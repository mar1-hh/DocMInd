import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

function uniqueUser() {
  return {
    name: `E2E User ${randomUUID().slice(0, 8)}`,
    email: `e2e-${randomUUID()}@example.com`,
    password: `E2e!${randomUUID()}`,
  }
}
type TestUser = ReturnType<typeof uniqueUser>

async function register(page: Page, user: TestUser) {
  await page.goto('/register')
  await page.getByLabel(/^Name\b/).fill(user.name)
  await page.getByLabel(/^Email\b/).fill(user.email)
  await page.getByLabel(/^Password\b/).fill(user.password)
  await page.getByLabel(/^Confirm password\b/).fill(user.password)
  const response = page.waitForResponse((response) => response.url().endsWith('/api/auth/register') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  expect((await response).status()).toBe(201)
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('alert')).toHaveText('Your account was created. Sign in to continue.')
}

async function login(page: Page, user: TestUser) {
  await page.getByLabel(/^Email\b/).fill(user.email)
  await page.getByLabel(/^Password\b/).fill(user.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL('http://127.0.0.1:4173/')
  await expect(page.getByRole('heading', { name: `Welcome, ${user.name}`, exact: true })).toBeVisible()
}

test('successful registration returns to sign in without creating a session', async ({ page }) => {
  const user = uniqueUser()
  await register(page, user)
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
})

test('successful login opens the protected account page', async ({ page }) => {
  const user = uniqueUser()
  await register(page, user)
  await login(page, user)
  await expect(page.getByText(`Signed in as ${user.email}`, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Check session', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Your session is active.')
})

test('invalid credentials show an error and keep the account page protected', async ({ page }) => {
  const user = uniqueUser()
  await register(page, user)
  await page.goto('/login')
  await page.getByLabel(/^Email\b/).fill(user.email)
  await page.getByLabel(/^Password\b/).fill(`Wrong!${randomUUID()}`)
  const response = page.waitForResponse((response) => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  expect((await response).status()).toBe(401)
  await expect(page.getByRole('alert').filter({ hasText: /^Invalid email or password$/ })).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
})

test('session persists through reload using one rotating refresh request', async ({ page }) => {
  const user = uniqueUser()
  await register(page, user)
  await login(page, user)
  const before = (await page.context().cookies()).find((cookie) => cookie.name === 'refreshToken')
  // Assert booleans so failures never print cookie/token contents.
  expect(Boolean(before?.httpOnly && before.sameSite === 'Strict' && before.path === '/api/auth')).toBe(true)
  let refreshCalls = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/api/auth/refresh') && request.method() === 'POST') ++refreshCalls
  })
  const refresh = page.waitForResponse((response) => response.url().endsWith('/api/auth/refresh'))
  await page.reload()
  expect((await refresh).status()).toBe(200)
  await expect(page.getByRole('heading', { name: `Welcome, ${user.name}`, exact: true })).toBeVisible()
  const after = (await page.context().cookies()).find((cookie) => cookie.name === 'refreshToken')
  expect(Boolean(before?.value && after?.value && before.value !== after.value)).toBe(true)
  expect(refreshCalls).toBe(1)
})

test('logout ends the session and denies protected access afterward', async ({ page }) => {
  const user = uniqueUser()
  await register(page, user)
  await login(page, user)
  const logout = page.waitForResponse((response) => response.url().endsWith('/api/auth/logout'))
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  expect((await logout).status()).toBe(204)
  await expect(page).toHaveURL(/\/login$/)
  await expect.poll(async () => (await page.context().cookies()).some((cookie) => cookie.name === 'refreshToken')).toBe(false)
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await page.reload()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0)
})

test('unauthenticated visitors are redirected from the protected route', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0)
})
