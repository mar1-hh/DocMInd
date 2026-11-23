import { randomUUID } from 'node:crypto'
import { expect, type Page } from '@playwright/test'

export async function signIn(page: Page) {
  const email = `collections-${randomUUID()}@example.com`
  const password = `Test!${randomUUID()}`
  const registered = await page.request.post('/api/auth/register', { data: { name: 'Collection Tester', email, password } })
  expect(registered.status()).toBe(201)
  await page.goto('/collections')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel(/^Email\b/).fill(email)
  await page.getByLabel(/^Password\b/).fill(password)
  const login = page.waitForResponse(res => res.url().endsWith('/api/auth/login'))
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/collections$/)
  await expect(page.getByRole('heading', { name: 'No collections yet' })).toBeVisible()
  return (await (await login).json()).accesstoken as string
}
