import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { resetRateLimit } from './resetRateLimit.ts'

test.beforeAll(resetRateLimit)

const uniqueUser = (name: string) => ({ name, email: `e2e-${randomUUID()}@example.com`, password: `E2e!${randomUUID()}` })

async function register(page: Page, user: ReturnType<typeof uniqueUser>) {
  await page.goto('/register')
  await page.getByLabel(/^Name\b/).fill(user.name)
  await page.getByLabel(/^Email\b/).fill(user.email)
  await page.getByLabel(/^Password\b/).fill(user.password)
  await page.getByLabel(/^Confirm password\b/).fill(user.password)
  const response = page.waitForResponse((response) => response.url().endsWith('/api/auth/register') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  expect((await response).status()).toBe(201)
  await expect(page).toHaveURL(/\/login$/)
}

async function login(page: Page, user: ReturnType<typeof uniqueUser>) {
  await page.getByLabel(/^Email\b/).fill(user.email)
  await page.getByLabel(/^Password\b/).fill(user.password)
  const response = page.waitForResponse((response) => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  expect((await response).status()).toBe(200)
  await expect(page.getByRole('heading', { name: `Welcome, ${user.name}`, exact: true })).toBeVisible()
}

test('cross-tab account change invalidates Alice without replaying her pending request as Bob', async ({ page, context }) => {
  const alice = uniqueUser('Alice')
  const bob = uniqueUser('Bob')
  const otherTab = await context.newPage()
  // Both stores are anonymous before either account signs in; cookies are shared.
  await register(page, alice)
  await register(otherTab, bob)
  await login(page, alice)
  await expect(otherTab).toHaveURL(/\/login$/)

  let meCalls = 0
  let logouts = 0
  context.on('request', (request) => {
    if (request.url().endsWith('/api/auth/logout')) ++logouts
  })
  let release!: () => void
  let started!: () => void
  const released = new Promise<void>((resolve) => { release = resolve })
  const intercepted = new Promise<void>((resolve) => { started = resolve })
  await page.route('**/api/auth/me', async (route) => {
    ++meCalls
    started()
    await released
    // Make the old request fail against the real API, exercising the potential refresh/retry path.
    await route.continue({ headers: { ...route.request().headers(), authorization: 'Bearer expired-test-token' } })
  })
  try {
    await page.getByRole('button', { name: 'Check session', exact: true }).click()
    await intercepted
    await login(otherTab, bob)
    await expect(page).toHaveURL(/\/login$/)
    const response = page.waitForResponse((response) => response.url().endsWith('/api/auth/me'))
    release()
    expect((await response).status()).toBe(401)
    // Drain the route handler as well as its response before checking request counts.
    await page.unrouteAll({ behavior: 'wait' })
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
    await expect(page.getByText('Signed in as', { exact: false })).toHaveCount(0)
    expect(meCalls).toBe(1)
    expect(logouts).toBe(0)
    await otherTab.reload()
    await expect(otherTab.getByRole('heading', { name: 'Welcome, Bob', exact: true })).toBeVisible()
    await otherTab.getByRole('button', { name: 'Check session', exact: true }).click()
    await expect(otherTab.getByRole('status')).toHaveText('Your session is active.')
  } finally {
    release()
  }
})

test('same-user refresh retries safely and session restoration still works', async ({ page, context }) => {
  const alice = uniqueUser('Alice')
  await register(page, alice)
  await login(page, alice)
  let meCalls = 0
  let refreshCalls = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/api/auth/refresh')) ++refreshCalls
  })
  await page.route('**/api/auth/me', async (route) => {
    ++meCalls
    if (meCalls === 1) {
      await route.continue({ headers: { ...route.request().headers(), authorization: 'Bearer expired-test-token' } })
    } else {
      await route.continue()
    }
  })
  await page.getByRole('button', { name: 'Check session', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Your session is active.')
  expect(meCalls).toBe(3) // Original rejection, refreshed /me identity check, original request retry.
  expect(refreshCalls).toBe(1)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Welcome, Alice', exact: true })).toBeVisible()
  const otherTab = await context.newPage()
  await otherTab.goto('/')
  await expect(otherTab.getByRole('heading', { name: 'Welcome, Alice', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Welcome, Alice', exact: true })).toBeVisible()
})
