import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, beforeEach, describe, it } from 'node:test'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../src/app.js'
import User from '../src/models/user.model.js'
import RefreshToken from '../src/models/refreshToken.model.js'

// Never load .env or use MONGO_URI: this suite owns its MongoDB process and database.
process.env.NODE_ENV = 'test'
process.env.JWT_ACCESS_SECRET = 'docmind-integration-test-secret-only'
const secret = process.env.JWT_ACCESS_SECRET
const database = 'docmind_auth_test'
let mongo: MongoMemoryServer | undefined
const credentials = { name: 'Test User', email: 'test@example.com', password: 'Password123!' }
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

function refreshCookie(response: request.Response) {
  const header = response.headers['set-cookie'] as string[] | undefined
  const cookie = header?.find(value => value.startsWith('refreshToken='))
  assert.ok(cookie, 'Expected refreshToken cookie')
  assert.match(cookie, /; HttpOnly/i)
  assert.match(cookie, /; SameSite=Strict/i)
  assert.match(cookie, /; Path=\/api\/auth(?:;|$)/i)
  const pair = cookie.split(';')[0]!
  return { header: cookie, pair, token: decodeURIComponent(pair.slice('refreshToken='.length)) }
}

async function login() {
  await request(app).post('/api/auth/register').send(credentials).expect(201)
  return request(app).post('/api/auth/login').send(credentials).expect(200)
}

before(async () => {
  mongo = await MongoMemoryServer.create({ instance: { dbName: database } })
  await mongoose.connect(mongo.getUri(), { dbName: database })
  await Promise.all([User.init(), RefreshToken.init()])
}, { timeout: 120_000 })

beforeEach(async () => {
  assert.equal(mongoose.connection.name, database)
  await Promise.all([User.deleteMany({}), RefreshToken.deleteMany({})])
})

after(async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      assert.equal(mongoose.connection.name, database)
      await mongoose.connection.dropDatabase()
    }
  } finally {
    await mongoose.disconnect()
    await mongo?.stop()
  }
})

describe('POST /api/auth/register', () => {
  it('creates a user, hashes the password, and excludes secrets', async () => {
    const response = await request(app).post('/api/auth/register').send(credentials).expect(201)
    assert.deepEqual(Object.keys(response.body).sort(), ['email', 'id', 'name'])
    const user = await User.findById(response.body.id).select('+password').orFail()
    assert.equal(user.email, credentials.email)
    const bcrypt = await import('bcrypt')
    assert.notEqual(user.password, credentials.password)
    assert.equal(await bcrypt.compare(credentials.password, user.password), true)
    assert.equal(await RefreshToken.countDocuments(), 0)
  })

  for (const [label, input] of Object.entries({
    'missing fields': {},
    'invalid email': { ...credentials, email: 'invalid' },
    'short name': { ...credentials, name: 'ab' },
    'short password': { ...credentials, password: 'short' },
    'wrong field type': { ...credentials, password: 12345678 },
  })) {
    it(`rejects ${label}`, async () => {
      const response = await request(app).post('/api/auth/register').send(input).expect(400)
      assert.ok(response.body.errors)
      assert.equal(await User.countDocuments(), 0)
    })
  }

  it('rejects duplicate email addresses', async () => {
    await request(app).post('/api/auth/register').send(credentials).expect(201)
    const response = await request(app).post('/api/auth/register').send(credentials).expect(409)
    assert.equal(response.body.code, 'EMAIL_ALREADY_EXISTS')
    assert.equal(await User.countDocuments(), 1)
  })
})

describe('POST /api/auth/login', () => {
  it('returns a usable access token and stores only the refresh-token hash', async () => {
    const response = await login()
    const cookie = refreshCookie(response)
    assert.match(cookie.header, /; Max-Age=604800/i)
    assert.equal(response.body.refreshToken, undefined)
    assert.equal(response.body.user.password, undefined)
    assert.equal(jwt.verify(response.body.accesstoken, secret).sub, response.body.user.id)
    const stored = await RefreshToken.findOne({ tokenHash: hash(cookie.token) }).orFail()
    assert.notEqual(stored.tokenHash, cookie.token)
    assert.equal(stored.userId.toString(), response.body.user.id)
    assert.ok(stored.expiresAt.getTime() > Date.now())
    assert.ok(!JSON.stringify(await RefreshToken.collection.findOne({ _id: stored._id })).includes(cookie.token))
    await request(app).get('/api/auth/me').auth(response.body.accesstoken, { type: 'bearer' }).expect(200)
  })

  for (const input of [{}, { email: 'invalid', password: 'x' }, { email: credentials.email, password: '' }]) {
    it(`rejects invalid input ${JSON.stringify(input)}`, async () => {
      await request(app).post('/api/auth/login').send(input).expect(400)
      assert.equal(await RefreshToken.countDocuments(), 0)
    })
  }

  for (const email of [credentials.email, 'unknown@example.com']) {
    it(`rejects incorrect credentials for ${email} with 401`, async () => {
      await request(app).post('/api/auth/register').send(credentials).expect(201)
      const response = await request(app).post('/api/auth/login').send({ email, password: 'wrong' })
      assert.equal(await RefreshToken.countDocuments(), 0)
      assert.equal(response.headers['set-cookie'], undefined)
      assert.equal(response.status, 401)
    })
  }
})

describe('POST /api/auth/refresh', () => {
  it('rotates the cookie and hash, rejects replay, and issues a usable access token', async () => {
    const initial = refreshCookie(await login())
    const response = await request(app).post('/api/auth/refresh').set('Cookie', initial.pair).expect(200)
    const rotated = refreshCookie(response)
    assert.notEqual(rotated.token, initial.token)
    assert.equal(response.body.refreshToken, undefined)
    assert.equal(await RefreshToken.countDocuments({ tokenHash: hash(initial.token) }), 0)
    assert.equal(await RefreshToken.countDocuments({ tokenHash: hash(rotated.token) }), 1)
    assert.equal(await RefreshToken.countDocuments(), 1)
    await request(app).get('/api/auth/me').auth(response.body.accessToken, { type: 'bearer' }).expect(200)
    await request(app).post('/api/auth/refresh').set('Cookie', initial.pair).expect(401)
    await request(app).post('/api/auth/refresh').set('Cookie', rotated.pair).expect(200)
  })

  for (const cookie of [undefined, 'refreshToken=', 'refreshToken=invalid']) {
    it(`rejects missing, empty, or unknown cookie: ${cookie}`, async () => {
      const req = request(app).post('/api/auth/refresh')
      if (cookie) req.set('Cookie', cookie)
      const response = await req.expect(401)
      assert.equal(response.body.code, cookie === 'refreshToken=invalid' ? 'INVALID_REFRESH_TOKEN' : 'MISSING_REFRESH_TOKEN')
      assert.equal(response.headers['set-cookie'], undefined)
    })
  }

  it('rejects an expired token in the database', async () => {
    const cookie = refreshCookie(await login())
    await RefreshToken.updateOne({ tokenHash: hash(cookie.token) }, { expiresAt: new Date(0) })
    const response = await request(app).post('/api/auth/refresh').set('Cookie', cookie.pair).expect(401)
    assert.equal(response.body.code, 'INVALID_REFRESH_TOKEN')
  })
})

describe('POST /api/auth/logout', () => {
  it('revokes the session, clears the cookie, and prevents refresh', async () => {
    const cookie = refreshCookie(await login())
    const response = await request(app).post('/api/auth/logout').set('Cookie', cookie.pair).expect(204)
    const cleared = refreshCookie(response)
    assert.equal(cleared.token, '')
    assert.match(cleared.header, /Expires=Thu, 01 Jan 1970/i)
    assert.equal(await RefreshToken.countDocuments({ tokenHash: hash(cookie.token) }), 0)
    await request(app).post('/api/auth/refresh').set('Cookie', cookie.pair).expect(401)
    await request(app).post('/api/auth/logout').set('Cookie', cookie.pair).expect(204)
  })

  it('allows logout without a cookie or with an unknown cookie', async () => {
    await request(app).post('/api/auth/logout').expect(204)
    await request(app).post('/api/auth/logout').set('Cookie', 'refreshToken=unknown').expect(204)
  })

  it('keeps a separate login session valid', async () => {
    const first = refreshCookie(await login())
    const second = refreshCookie(await request(app).post('/api/auth/login').send(credentials).expect(200))
    await request(app).post('/api/auth/logout').set('Cookie', first.pair).expect(204)
    await request(app).post('/api/auth/refresh').set('Cookie', second.pair).expect(200)
  })
})

describe('GET /api/auth/me', () => {
  it('returns only the authenticated user public fields', async () => {
    const loginResponse = await login()
    const response = await request(app).get('/api/auth/me').auth(loginResponse.body.accesstoken, { type: 'bearer' }).expect(200)
    assert.deepEqual(response.body, { user: loginResponse.body.user })
  })

  const unauthorizedCases = [
    { label: 'missing authorization', authorization: undefined },
    { label: 'wrong authorization scheme', authorization: 'Basic invalid' },
    { label: 'malformed token', authorization: 'Bearer invalid' },
    { label: 'invalid signature', authorization: `Bearer ${jwt.sign({ sub: new mongoose.Types.ObjectId().toString() }, 'wrong-secret')}` },
    { label: 'expired token', authorization: `Bearer ${jwt.sign({ sub: new mongoose.Types.ObjectId().toString() }, secret, { expiresIn: -1 })}` },
    { label: 'missing subject', authorization: `Bearer ${jwt.sign({ name: 'no subject' }, secret)}` },
  ]
  for (const { label, authorization } of unauthorizedCases) {
    it(`rejects ${label}`, async () => {
      const req = request(app).get('/api/auth/me')
      if (authorization) req.set('Authorization', authorization)
      await req.expect(401)
    })
  }

  it('returns 404 if the authenticated user was deleted', async () => {
    const response = await login()
    await User.deleteOne({ _id: response.body.user.id })
    const me = await request(app).get('/api/auth/me').auth(response.body.accesstoken, { type: 'bearer' }).expect(404)
    assert.equal(me.body.code, 'USER_NOT_FOUND')
  })
})
