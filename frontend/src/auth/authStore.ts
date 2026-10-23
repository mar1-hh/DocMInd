import { ApiError, createApi, errorMessage, jsonPost, loginResponseSchema, meResponseSchema, parseResponse, refreshResponseSchema, userSchema } from '../api/auth.ts'
import type { LoginInput, RegisterInput, User } from '../api/auth.ts'

type AuthState = {
  status: 'restoring' | 'authenticated' | 'anonymous' | 'error'
  user: User | null
  error: string | null
  loggingOut: boolean
  logoutFailed: boolean
}

// A browser-wide lock also serializes cookie rotation across tabs when Web Locks is available.
async function cookieLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('docmind-auth-cookie', operation)
  }
  return operation()
}

export function createAuthStore(fetcher: typeof fetch = (...args) => fetch(...args)) {
  const request = createApi(fetcher)
  let state: AuthState = { status: 'restoring', user: null, error: null, loggingOut: false, logoutFailed: false }
  let accessToken: string | null = null
  let tokenVersion = 0
  let revision = 0
  let refreshPromise: Promise<void> | null = null
  let restorePromise: Promise<void> | null = null
  let logoutPromise: Promise<void> | null = null
  let queue: Promise<unknown> = Promise.resolve()
  const listeners = new Set<() => void>()
  const publish = (next: AuthState) => {
    state = next
    listeners.forEach((listener) => listener())
  }
  // Cookie-changing operations must finish in order, including a refresh already in flight at logout.
  function serialized<T>(operation: () => Promise<T>): Promise<T> {
    const pending = queue.then(() => cookieLock(operation))
    queue = pending.catch(() => undefined)
    return pending
  }
  const ensureCurrent = (expected: number) => {
    if (expected !== revision) throw new ApiError('The session changed. Please try again.')
  }
  function refreshSession(): Promise<void> {
    if (refreshPromise) return refreshPromise
    if (state.loggingOut) return Promise.reject(new ApiError('Sign out is in progress.'))
    const expected = revision
    refreshPromise = serialized(async () => {
      ensureCurrent(expected)
      try {
        const data = parseResponse(refreshResponseSchema, await request('/refresh', jsonPost()))
        ensureCurrent(expected)
        const { user } = parseResponse(meResponseSchema, await request('/me', { headers: { Authorization: `Bearer ${data.accessToken}` } }))
        ensureCurrent(expected)
        accessToken = data.accessToken
        ++tokenVersion
        publish({ status: 'authenticated', user, error: null, loggingOut: false, logoutFailed: false })
      } catch (error) {
        if (expected === revision) {
          ++revision
          accessToken = null
          const expired = error instanceof ApiError && (error.status === 401 || error.code === 'USER_NOT_FOUND')
          const message = expired ? (state.user ? 'Your session has expired. Please sign in again.' : null) : errorMessage(error)
          publish({ status: expired ? 'anonymous' : 'error', user: null, error: message, loggingOut: false, logoutFailed: false })
        }
        throw error
      }
    }).finally(() => { refreshPromise = null })
    return refreshPromise
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    restore() {
      // Kept beyond completion: React StrictMode's repeated effect cannot consume a cookie twice.
      restorePromise ??= refreshSession().catch(() => undefined)
      return restorePromise
    },
    retryRestoration() {
      publish({ ...state, status: 'restoring', error: null })
      restorePromise = null
      return this.restore()
    },
    goToSignIn() {
      accessToken = null
      publish({ ...state, status: 'anonymous', user: null, error: null })
    },
    register(input: RegisterInput) {
      // Registration does not create a session in the existing backend contract.
      return request('/register', jsonPost({ name: input.name.trim(), email: input.email, password: input.password }))
        .then((data) => parseResponse(userSchema, data))
    },
    async login(input: LoginInput) {
      const expected = ++revision
      await serialized(async () => {
        ensureCurrent(expected)
        const data = parseResponse(loginResponseSchema, await request('/login', jsonPost(input)))
        ensureCurrent(expected)
        accessToken = data.accesstoken // Backend login spelling differs from refresh.
        ++tokenVersion
        publish({ status: 'authenticated', user: data.user, error: null, loggingOut: false, logoutFailed: false })
      })
    },
    logout(): Promise<void> {
      if (logoutPromise) return logoutPromise
      ++revision
      accessToken = null
      publish({ status: 'anonymous', user: null, error: null, loggingOut: true, logoutFailed: false })
      logoutPromise = serialized(async () => {
        try {
          await request('/logout', jsonPost())
          publish({ ...state, loggingOut: false, logoutFailed: false, error: null })
        } catch {
          publish({ ...state, loggingOut: false, logoutFailed: true, error: 'You are signed out locally, but the server session could not be ended. Retry sign out before reloading.' })
        }
      }).finally(() => { logoutPromise = null })
      return logoutPromise
    },
    async authenticatedRequest(path: string, init: RequestInit = {}) {
      const expected = revision
      const send = (token: string) => {
        const headers = new Headers(init.headers)
        headers.set('Authorization', `Bearer ${token}`)
        return request(path, { ...init, headers })
      }
      if (!accessToken) throw new ApiError('Please sign in to continue.', 401)
      const originalToken = accessToken
      const originalVersion = tokenVersion
      try {
        const result = await send(originalToken)
        ensureCurrent(expected)
        return result
      } catch (error) {
        ensureCurrent(expected)
        if (!(error instanceof ApiError) || error.status !== 401) throw error
        // A different request may already have refreshed while this 401 was in transit.
        if (tokenVersion === originalVersion) await refreshSession()
        ensureCurrent(expected)
        if (!accessToken) throw new ApiError('Your session has expired. Please sign in again.', 401)
        try {
          const result = await send(accessToken)
          ensureCurrent(expected)
          return result
        } catch (retryError) {
          if (expected === revision && retryError instanceof ApiError && retryError.status === 401) {
            ++revision
            accessToken = null
            publish({ status: 'anonymous', user: null, error: 'Your session has expired. Please sign in again.', loggingOut: false, logoutFailed: false })
          }
          throw retryError
        }
      }
    },
  }
}

export const authStore = createAuthStore()
