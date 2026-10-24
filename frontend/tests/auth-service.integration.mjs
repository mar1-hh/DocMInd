import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import mongoose from '../../auth-service/node_modules/mongoose/index.js'
import { MongoMemoryServer } from '../../auth-service/node_modules/mongodb-memory-server/index.js'
import jwt from '../../auth-service/node_modules/jsonwebtoken/index.js'
import app from '../../auth-service/src/app.ts'
import User from '../../auth-service/src/models/user.model.ts'
import RefreshToken from '../../auth-service/src/models/refreshToken.model.ts'
import { createAuthStore } from '../src/auth/authStore.ts'

// This test never loads .env or connects to the user's database.
process.env.NODE_ENV = 'test'
process.env.JWT_ACCESS_SECRET = 'frontend-auth-integration-test-only'
let mongo
let server
let origin
const database = 'docmind_frontend_auth_test'

before(async () => {
  mongo = await MongoMemoryServer.create({ instance: { dbName: database } })
  await mongoose.connect(mongo.getUri(), { dbName: database })
  await Promise.all([User.init(), RefreshToken.init()])
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
}, { timeout: 120_000 })

after(async () => {
  try {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    if (mongoose.connection.readyState === 1) {
      assert.equal(mongoose.connection.name, database)
      await mongoose.connection.dropDatabase()
    }
  } finally {
    await mongoose.disconnect()
    await mongo?.stop()
  }
})

test('frontend store uses real registration, login, rotating-cookie reload, expired-access recovery and logout', async () => {
  let cookie = ''
  let refreshCalls = 0
  let meCalls = 0
  let forceExpiredRequests = 0
  const cookies = []
  const browserFetch = async (path, init = {}) => {
    assert.equal(init.credentials, 'include')
    const headers = new Headers(init.headers)
    if (cookie) headers.set('Cookie', cookie)
    if (path === '/api/auth/refresh') ++refreshCalls
    if (path === '/api/auth/me') {
      ++meCalls
      if (forceExpiredRequests > 0) {
        --forceExpiredRequests
        headers.set('Authorization', `Bearer ${jwt.sign({ sub: registered.id }, process.env.JWT_ACCESS_SECRET, { expiresIn: -1 })}`)
      }
    }
    const response = await fetch(`${origin}${path}`, { ...init, headers })
    const setCookie = response.headers.getSetCookie().find((value) => value.startsWith('refreshToken='))
    if (setCookie) {
      assert.match(setCookie, /HttpOnly/i)
      assert.match(setCookie, /SameSite=Strict/i)
      assert.match(setCookie, /Path=\/api\/auth/i)
      cookie = setCookie.split(';')[0]
      cookies.push(cookie)
    }
    return response
  }
  const credentials = { name: 'Integration User', email: 'frontend-integration@example.com', password: 'Password123!' }
  const firstPage = createAuthStore(browserFetch)
  await firstPage.restore()
  assert.equal(firstPage.getSnapshot().status, 'anonymous')
  const registered = await firstPage.register(credentials)
  assert.equal(firstPage.getSnapshot().user, null)
  assert.equal(cookie, '')
  await assert.rejects(firstPage.register(credentials), (error) => error.status === 409 && Boolean(error.fieldErrors.email))
  await assert.rejects(firstPage.login({ email: credentials.email, password: 'incorrect' }), (error) => error.status === 401)
  await firstPage.login(credentials)
  assert.equal(firstPage.getSnapshot().user.id, registered.id)
  assert.deepEqual(await firstPage.authenticatedRequest('/me'), { user: registered })
  const originalCookie = cookie

  // A new store has no access token: only the browser's cookie survives the reload.
  const reloadedPage = createAuthStore(browserFetch)
  const callsBeforeReload = refreshCalls
  await Promise.all([reloadedPage.restore(), reloadedPage.restore(), reloadedPage.restore()])
  assert.equal(refreshCalls, callsBeforeReload + 1)
  assert.equal(reloadedPage.getSnapshot().user.id, registered.id)
  assert.notEqual(cookie, originalCookie)
  assert.equal(await RefreshToken.countDocuments({ revokedAt: null }), 1)

  // Four real /me requests get expired JWTs; the frontend must refresh only once.
  forceExpiredRequests = 4
  const beforeRecovery = refreshCalls
  await Promise.all(Array.from({ length: 4 }, () => reloadedPage.authenticatedRequest('/me')))
  assert.equal(refreshCalls, beforeRecovery + 1)
  assert.equal(await RefreshToken.countDocuments({ revokedAt: null }), 1)
  const session = await RefreshToken.findOne().orFail()
  assert.equal(session.usedTokenHashes.length, 2)

  await reloadedPage.logout()
  assert.equal(reloadedPage.getSnapshot().user, null)
  assert.equal(reloadedPage.getSnapshot().loggingOut, false)
  assert.equal(cookie, 'refreshToken=')
  assert.equal(await RefreshToken.countDocuments(), 0)
  await assert.rejects(reloadedPage.authenticatedRequest('/me'))
  const loggedOutReload = createAuthStore(browserFetch)
  await loggedOutReload.restore()
  assert.equal(loggedOutReload.getSnapshot().status, 'anonymous')
  assert.equal(cookies.length, 4) // login, reload rotation, expired-access rotation, logout deletion
  assert.ok(meCalls >= 8)
})
