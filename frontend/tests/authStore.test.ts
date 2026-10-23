import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/api/auth.ts'
import { createAuthStore } from '../src/auth/authStore.ts'

const user = { id: 'user-1', name: 'Test User', email: 'test@example.com' }
const input = { email: user.email, password: 'Password123!' }
const json = (body: unknown, status = 200) => Response.json(body, { status })
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

test('restoration is shared across concurrent callers and repeated StrictMode effects', async () => {
  let refreshes = 0
  const started = deferred()
  const finish = deferred()
  const store = createAuthStore(async (url, init) => {
    assert.equal(init?.credentials, 'include')
    if (url === '/api/auth/refresh') {
      ++refreshes
      started.resolve()
      await finish.promise
      return json({ accessToken: 'restored' })
    }
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer restored')
    return json({ user })
  })
  const first = store.restore()
  await started.promise
  const second = store.restore()
  assert.equal(first, second)
  assert.equal(store.getSnapshot().status, 'restoring')
  finish.resolve()
  await Promise.all([first, second])
  await store.restore()
  assert.equal(refreshes, 1)
  assert.equal(store.getSnapshot().status, 'authenticated')
  assert.deepEqual(store.getSnapshot().user, user)
  assert.ok(!JSON.stringify(store.getSnapshot()).includes('restored'))
})

test('missing cookie is anonymous, while network errors allow restoration retry', async () => {
  const anonymous = createAuthStore(async () => json({ code: 'MISSING_REFRESH_TOKEN', message: 'Missing' }, 401))
  await anonymous.restore()
  assert.equal(anonymous.getSnapshot().status, 'anonymous')
  assert.equal(anonymous.getSnapshot().error, null)
  let online = false
  const store = createAuthStore(async (url) => {
    if (!online) throw new TypeError('Network unavailable')
    return url === '/api/auth/refresh' ? json({ accessToken: 'restored' }) : json({ user })
  })
  await store.restore()
  assert.equal(store.getSnapshot().status, 'error')
  online = true
  await store.retryRestoration()
  assert.equal(store.getSnapshot().status, 'authenticated')
})

test('register posts only backend fields and never creates a session', async () => {
  const store = createAuthStore(async (url, init) => {
    assert.equal(url, '/api/auth/register')
    assert.equal(init?.method, 'POST')
    assert.deepEqual(JSON.parse(String(init?.body)), { ...input, name: 'Test User' })
    return json(user, 201)
  })
  assert.deepEqual(await store.register({ ...input, name: '  Test User  ' }), user)
  assert.equal(store.getSnapshot().user, null)
})

test('login maps accesstoken and exposes a usable authenticated request', async () => {
  const store = createAuthStore(async (url, init) => {
    if (url === '/api/auth/login') return json({ accesstoken: 'login-token', user })
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer login-token')
    return json({ user })
  })
  await store.login(input)
  assert.deepEqual(await store.authenticatedRequest('/me'), { user })
})

test('API field errors, duplicate email, wrong password, rate limits and bad gateway responses are clear', async () => {
  const cases = [
    { status: 400, body: { errors: { formErrors: [], fieldErrors: { email: ['Invalid email'] } } }, field: 'email' },
    { status: 409, body: { code: 'EMAIL_ALREADY_EXISTS', message: 'Email is already registered' }, field: 'email' },
    { status: 401, body: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } },
    { status: 429, body: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests' } },
    { status: 502, body: null },
  ]
  for (const item of cases) {
    const store = createAuthStore(async () => json(item.body, item.status))
    await assert.rejects(store.login(input), (error: unknown) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.status, item.status)
      assert.ok(error.message.length)
      if (item.field) assert.ok(error.fieldErrors[item.field])
      return true
    })
    assert.equal(store.getSnapshot().user, null)
  }
})

test('parallel 401s refresh once, including late 401s when the new JWT string is unchanged', async () => {
  let refreshes = 0
  let originalRequests = 0
  const lateStarted = deferred()
  const releaseLate = deferred()
  const releaseRefresh = deferred()
  const refreshStarted = deferred()
  const store = createAuthStore(async (url, init) => {
    if (url === '/api/auth/login') return json({ accesstoken: 'same-jwt', user })
    if (url === '/api/auth/refresh') {
      ++refreshes
      refreshStarted.resolve()
      await releaseRefresh.promise
      return json({ accessToken: 'same-jwt' })
    }
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer same-jwt')
    ++originalRequests
    if (originalRequests <= 3) {
      if (originalRequests === 3) {
        lateStarted.resolve()
        await releaseLate.promise
      }
      return json({ code: 'TOKEN_EXPIRED', message: 'Expired' }, 401)
    }
    return json({ user })
  })
  await store.login(input)
  const requests = Array.from({ length: 3 }, () => store.authenticatedRequest('/me'))
  await Promise.all([lateStarted.promise, refreshStarted.promise])
  releaseRefresh.resolve()
  await requests[0]
  releaseLate.resolve()
  await Promise.all(requests)
  assert.equal(refreshes, 1)
  assert.equal(store.getSnapshot().status, 'authenticated')
})

test('rejected refresh clears the user and does not loop', async () => {
  let refreshes = 0
  const store = createAuthStore(async (url) => {
    if (url === '/api/auth/login') return json({ accesstoken: 'expired', user })
    if (url === '/api/auth/refresh') ++refreshes
    return json({ code: 'INVALID_REFRESH_TOKEN', message: 'Expired' }, 401)
  })
  await store.login(input)
  await assert.rejects(store.authenticatedRequest('/me'))
  assert.equal(refreshes, 1)
  assert.equal(store.getSnapshot().user, null)
  assert.equal(store.getSnapshot().status, 'anonymous')
})

test('logout during refresh waits for rotation, clears state immediately and prevents resurrection', async () => {
  const calls: string[] = []
  const started = deferred()
  const finish = deferred()
  const store = createAuthStore(async (url) => {
    calls.push(String(url))
    if (url === '/api/auth/login') return json({ accesstoken: 'expired', user })
    if (url === '/api/auth/refresh') {
      started.resolve()
      await finish.promise
      return json({ accessToken: 'late-token' })
    }
    if (url === '/api/auth/logout') return new Response(null, { status: 204 })
    return json({ message: 'Expired' }, 401)
  })
  await store.login(input)
  const request = store.authenticatedRequest('/me')
  const rejection = assert.rejects(request)
  await started.promise
  const logout = store.logout()
  const duplicate = store.logout()
  assert.equal(logout, duplicate)
  assert.equal(store.getSnapshot().user, null)
  assert.equal(store.getSnapshot().loggingOut, true)
  assert.ok(!calls.includes('/api/auth/logout'))
  finish.resolve()
  await Promise.all([logout, rejection])
  assert.equal(calls.filter((path) => path === '/api/auth/logout').length, 1)
  assert.equal(store.getSnapshot().status, 'anonymous')
  await assert.rejects(store.authenticatedRequest('/me'))
})

test('logout failures still clear state and support retrying server cleanup', async () => {
  let online = false
  const store = createAuthStore(async (url) => {
    if (url === '/api/auth/login') return json({ accesstoken: 'login-token', user })
    if (!online) throw new TypeError('Offline')
    return new Response(null, { status: 204 })
  })
  await store.login(input)
  await store.logout()
  assert.equal(store.getSnapshot().user, null)
  assert.equal(store.getSnapshot().logoutFailed, true)
  online = true
  await store.logout()
  assert.equal(store.getSnapshot().logoutFailed, false)
})

test('a second unauthorized response after refresh stops after one retry', async () => {
  let refreshes = 0
  let meRequests = 0
  const store = createAuthStore(async (url) => {
    if (url === '/api/auth/login') return json({ accesstoken: 'expired', user })
    if (url === '/api/auth/refresh') { ++refreshes; return json({ accessToken: 'new' }) }
    ++meRequests
    // Only the user lookup within refresh succeeds.
    return meRequests === 2 ? json({ user }) : json({ message: 'Unauthorized' }, 401)
  })
  await store.login(input)
  await assert.rejects(store.authenticatedRequest('/me'))
  assert.equal(refreshes, 1)
  assert.equal(meRequests, 3)
  assert.equal(store.getSnapshot().user, null)
})

for (const pending of ['request', 'login', 'restore', 'refresh'] as const) {
  test(`cross-tab logout invalidates an in-flight ${pending}`, { timeout: 5000 }, async (t) => {
    const channelFactory = () => new BroadcastChannel(`docmind-auth-test-${pending}`)
    const started = deferred()
    const finish = deferred()
    let hold = false
    let receiverLogouts = 0
    const sender = createAuthStore(async () => new Response(null, { status: 204 }), channelFactory)
    const receiver = createAuthStore(async (url) => {
      if (url === '/api/auth/logout') ++receiverLogouts
      const delayed = pending === 'login' ? url === '/api/auth/login'
        : pending === 'request' ? url === '/api/auth/me' : url === '/api/auth/refresh'
      if (hold && delayed) {
        started.resolve()
        await finish.promise
      }
      if (url === '/api/auth/login') return json({ accesstoken: 'login-token', user })
      if (url === '/api/auth/refresh') return json({ accessToken: 'refreshed-token' })
      if (pending === 'refresh' && hold) return json({ message: 'Expired' }, 401)
      return json({ user })
    }, channelFactory)
    t.after(() => { finish.resolve(); sender.dispose(); receiver.dispose() })
    await receiver.login(input)
    hold = true
    const operation = pending === 'login' ? receiver.login(input)
      : pending === 'restore' ? receiver.restore() : receiver.authenticatedRequest('/me')
    const settled = operation.then(() => 'resolved', () => 'rejected')
    await started.promise
    const received = deferred()
    receiver.subscribe(() => {
      if (receiver.getSnapshot().status === 'anonymous') received.resolve()
    })
    const logout = sender.logout()
    await received.promise
    assert.equal(receiver.getSnapshot().user, null)
    await assert.rejects(receiver.authenticatedRequest('/me'), /Please sign in/)
    finish.resolve()
    assert.equal(await settled, pending === 'restore' ? 'resolved' : 'rejected')
    await logout
    assert.equal(receiver.getSnapshot().status, 'anonymous')
    assert.equal(receiver.getSnapshot().user, null)
    assert.equal(receiverLogouts, 0, 'receiving logout must not send another server logout')
  })
}
