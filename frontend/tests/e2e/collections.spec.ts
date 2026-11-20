import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { resetRateLimit } from './resetRateLimit.ts'

test.beforeAll(resetRateLimit)

async function signIn(page: Page) {
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

test('create, recover a failed edit, and confirm deletion through the gateway', async ({ page }) => {
  await signIn(page)
  const open = page.getByRole('button', { name: 'New collection' })
  await open.click()
  const dialog = page.getByRole('dialog')
  const name = dialog.getByLabel(/^Name\b/)
  await expect(name).toBeFocused()
  await dialog.getByRole('button', { name: 'Create collection' }).click()
  await expect(dialog.getByText('Enter a collection name.')).toBeVisible()
  await name.fill('  Reading notes  ')
  await dialog.getByLabel('Description (optional)').fill('Papers to revisit.')
  await dialog.getByRole('button', { name: 'Create collection' }).click()
  let card = page.getByRole('article', { name: 'Reading notes' })
  await expect(card.getByText('Papers to revisit.')).toBeVisible()
  await expect(card.getByText(/^Created /)).toBeVisible()

  await card.getByRole('button', { name: 'Edit Reading notes' }).click()
  await name.fill('Research archive')
  await dialog.getByLabel('Description (optional)').fill('Reviewed papers.')
  // Send one invalid PATCH through Nginx so the UI receives the backend's real field error.
  await page.route('**/api/collections/*', route => route.continue({
    postData: JSON.stringify({ ...route.request().postDataJSON(), name: ' ' }),
  }), { times: 1 })
  const failed = page.waitForResponse(res => res.request().method() === 'PATCH')
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  expect((await failed).status()).toBe(400)
  await expect(dialog.getByRole('alert')).toBeVisible()
  await expect(name).toHaveValue('Research archive')
  await expect(dialog.getByLabel('Description (optional)')).toHaveValue('Reviewed papers.')
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  card = page.getByRole('article', { name: 'Research archive' })
  await expect(card.getByText('Reviewed papers.')).toBeVisible()

  await page.setViewportSize({ width: 375, height: 812 })
  await card.getByRole('button', { name: 'Delete Research archive' }).click()
  await expect(dialog.getByText('Research archive', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(card.getByRole('button', { name: 'Delete Research archive' })).toBeFocused()
  await card.getByRole('button', { name: 'Delete Research archive' }).click()
  await dialog.getByRole('button', { name: 'Delete collection', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'No collections yet' })).toBeVisible()
  await expect(open).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('deleting the last collection on page two returns to page one', async ({ page }) => {
  const token = await signIn(page)
  for (let i = 1; i <= 10; ++i) {
    const response = await page.request.post('/api/collections', {
      headers: { Authorization: `Bearer ${token}` }, data: { name: `Collection ${i}` },
    })
    expect(response.status()).toBe(201)
  }
  await page.reload()
  await expect(page.getByRole('article')).toHaveCount(9)
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('article')).toHaveCount(1)
  await page.getByRole('button', { name: 'Delete Collection 1', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete collection' }).click()
  await expect(page.getByRole('article')).toHaveCount(9)
  await expect(page.getByRole('article', { name: 'Collection 10' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Collection pages' })).toHaveCount(0)
})


test('dashboard theme defaults to light and persists across restoration', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await signIn(page)
  const toggle = page.getByRole('switch', { name: 'Dark mode' })
  await expect(toggle).not.toBeChecked()
  const surface = page.locator('.collections-workspace')
  const light = await surface.evaluate(node => getComputedStyle(node).backgroundColor)
  const lightPaper = await page.locator('.collections-empty').evaluate(node => getComputedStyle(node).backgroundColor)
  await toggle.focus()
  await page.keyboard.press('Space')
  await expect(toggle).toBeChecked()
  await expect(surface).not.toHaveCSS('background-color', light)
  await page.reload()
  await expect(toggle).toBeChecked()
  await expect(surface).not.toHaveCSS('background-color', light)
  await page.getByRole('button', { name: 'New collection' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).not.toHaveCSS('background-color', lightPaper)
  await expect(dialog.locator('.MuiOutlinedInput-root').first()).not.toHaveCSS('background-color', lightPaper)
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await toggle.uncheck()
  await page.reload()
  await expect(toggle).not.toBeChecked()
  await expect(surface).toHaveCSS('background-color', light)
})
