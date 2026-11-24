import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { resetRateLimit } from './resetRateLimit.ts'
import { signIn } from './signIn.ts'

test.beforeAll(resetRateLimit)

test('collection chat cites the known answer on page two and respects ownership and deletion', async ({ page, request }) => {
  test.setTimeout(150_000)
  const headers = { Authorization: 'Bearer ' + await signIn(page) }
  const base = '/api/collections'
  const create = async (name: string) => {
    const response = await request.post(base, { headers, data: { name } })
    expect(response.status()).toBe(201)
    return (await response.json()).collection.id as string
  }
  const id = await create('Fieldwork')
  const other = await create('Unrelated')
  await page.reload()
  const open = (name: string) => page.getByRole('link', { name, exact: true }).click()
  await open('Fieldwork')
  await expect(page.getByRole('button', { name: 'Ask question' })).toBeDisabled()
  const path = base + '/' + id + '/documents'
  const uploaded = page.waitForResponse(r => r.url().endsWith(path) && r.request().method() === 'POST')
  await page.getByLabel('Choose PDF').setInputFiles(fileURLToPath(new URL('../../../chatbot-service/tests/field-guide.pdf', import.meta.url)))
  const doc = (await (await uploaded).json()).document
  expect(doc.indexStatus).toBe('pending')
  const checkbox = page.getByRole('checkbox', { name: /field-guide.pdf/ })
  const count = page.getByRole('status', { name: 'Documents selected' })
  await expect(count).toHaveText('1 of 1', { timeout: 60_000 })
  await expect(checkbox).toHaveText('field-guide')
  const title = checkbox.locator('.document-basename')
  await expect(title).toHaveCSS('background-image', /linear-gradient/)
  await checkbox.uncheck()
  await expect(title).toHaveCSS('background-image', 'none')
  await expect(count).toHaveText('0 of 1')
  await expect(page.getByRole('button', { name: 'Ask question' })).toBeDisabled()
  await checkbox.check()
  await expect(count).toHaveText('1 of 1')
  const input = page.getByRole('textbox', { name: 'Question', exact: true })
  const composer = page.locator('form.composer')
  const ask = page.getByRole('button', { name: 'Ask question' })
  for (const mode of ['light', 'dark']) {
    if (mode === 'dark') {
      await page.getByRole('button', { name: 'Settings' }).click()
      await page.getByRole('switch', { name: 'Dark mode' }).check()
      await page.getByRole('button', { name: 'Done' }).click()
      await expect(title).toHaveCSS('box-shadow', /inset/)
    }
    await input.click()
    await expect(input).toHaveCSS('outline-style', 'none')
    await expect(input).toHaveCSS('box-shadow', 'none')
    await expect(composer).toHaveCSS('outline-style', 'none')
    await input.press('Tab')
    await expect(ask).toBeFocused()
    await expect(ask).toHaveCSS('outline-style', 'none')
    await expect(ask).toHaveCSS('background-color', await input.evaluate(el => getComputedStyle(el).color))
    await expect(composer).toHaveCSS('outline-style', 'none')
    await ask.press('Shift+Tab')
    await expect(input).toBeFocused()
    await expect(input).toHaveCSS('outline-style', 'none')
    await expect(input).toHaveCSS('box-shadow', 'none')
    await expect(composer).toHaveCSS('outline-style', 'none')
  }
  const invalidScope = await request.post('/api/chat', { headers, data: { collectionId: other, documentIds: [doc.id], question: 'What is the code?' } })
  expect(invalidScope.status()).toBe(409)
  const question = 'What is the project code name?'
  const query = (collectionId: string, auth: Record<string, string>) =>
    request.post('/api/chat', { headers: auth, data: { collectionId, question } })
  expect((await query(id, {})).status()).toBe(401)
  expect((await query(other, headers)).status()).toBe(409)
  const credentials = { email: randomUUID() + '@example.org', password: randomUUID() + '!Aa1' }
  expect((await request.post('/api/auth/register', { data: { ...credentials, name: 'Other reader' } })).status()).toBe(201)
  const login = await request.post('/api/auth/login', { data: credentials })
  const stranger = { Authorization: 'Bearer ' + (await login.json()).accesstoken }
  expect((await query(id, stranger)).status()).toBe(404)
  expect((await request.post(path + '/' + doc.id + '/index', { headers: stranger })).status()).toBe(404)
  expect((await request.post(path + '/' + doc.id + '/index', { headers })).status()).toBe(202)
  await page.reload()
  await expect(checkbox).toBeChecked({ timeout: 60_000 })

  // Both PDFs contain the answer. Only the file left checked may appear in evidence.
  const longName = 'other-guide-' + 'archived-field-notes-'.repeat(5) + 'final.pdf'
  const second = await request.post(path, { headers, multipart: { file: { name: longName,
    mimeType: 'application/pdf', buffer: await readFile(new URL('../../../chatbot-service/tests/field-guide.pdf', import.meta.url)) } } })
  expect(second.status()).toBe(201)
  await page.reload()
  const unchecked = page.getByRole('checkbox', { name: longName })
  await expect(unchecked).toBeEnabled({ timeout: 60_000 })
  await expect(count).toHaveText('2 of 2')
  const longRow = page.getByRole('listitem').filter({ has: unchecked })
  expect(await longRow.locator('.document-basename').evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true)
  await longRow.locator('.document-basename').hover()
  await expect(page.getByRole('tooltip')).toHaveText(longName)
  await input.hover()
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await longRow.getByRole('button').focus()
  await page.keyboard.press('Shift+Tab')
  await expect(unchecked).toBeFocused()
  await expect(page.getByRole('tooltip')).toHaveText(longName)
  await unchecked.press('Space')
  await expect(count).toHaveText('1 of 2')

  // Hold delivery of the actual gateway answer until the user is in another collection.
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/chat', async route => {
    expect(route.request().postDataJSON().documentIds).toEqual([doc.id])
    const response = await route.fetch({ timeout: 100_000 })
    await gate
    await route.fulfill({ response })
  })
  await page.getByLabel('Question', { exact: true }).fill(question)
  await page.getByRole('button', { name: 'Ask question' }).click()
  await expect(page.getByText('Finding an answer…')).toBeVisible()
  await open('Collections')
  await open('Unrelated')
  const delivered = page.waitForResponse(r => r.url().endsWith('/api/chat'), { timeout: 100_000 })
  release()
  expect((await delivered).status()).toBe(200)
  await expect(page.getByRole('log')).toBeEmpty()
  await open('Collections')
  await open('Fieldwork')
  await expect(page.getByRole('log')).toContainText(/Juniper/i)
  const evidence = page.getByRole('list', { name: 'Sources' })
  await expect(evidence).toContainText('field-guide.pdf')
  await expect(evidence).toContainText('Juniper')
  await expect(evidence).not.toContainText(longName)
  const citation = page.getByRole('button', { name: 'Show evidence 1' }).first()
  await citation.focus()
  await citation.press('Enter')
  const source = page.locator('#evidence-1')
  await expect(source).toBeFocused()
  await expect(citation).toHaveAttribute('aria-current', 'true')
  await source.press('Escape')
  await expect(citation).toBeFocused()
  await citation.click()
  await source.getByRole('button', { name: 'Back to answer' }).click()
  await expect(citation).toBeFocused()
  const popup = page.waitForEvent('popup')
  await evidence.getByRole('link', { name: 'Open page 2' }).click()
  const reader = await popup
  await expect(reader.locator('iframe')).toHaveAttribute('src', /^blob:.+#page=2$/)
  await reader.close()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: /^Documents/ }).click()
  const documents = page.getByRole('dialog', { name: 'Documents' })
  await expect(documents.getByRole('checkbox', { name: /field-guide.pdf/ })).toBeChecked()
  await expect(documents.getByRole('status')).toHaveText('2 of 2')
  await documents.getByRole('checkbox', { name: longName }).uncheck()
  await expect(documents.getByRole('status')).toHaveText('1 of 2')
  await documents.getByRole('button', { name: 'Done' }).click()
  await citation.click()
  await expect(page.getByRole('dialog', { name: 'Evidence for this answer' })).toBeVisible()
  await expect(page.locator('#evidence-1')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(citation).toBeFocused()
  await expect(composer).toBeInViewport({ ratio: 1 })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.getByRole('button', { name: 'Actions for field-guide.pdf' }).click()
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Delete PDF', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: /field-guide.pdf/ })).toHaveCount(0)
  expect((await request.post('/api/chat', { headers, data: { collectionId: id, documentIds: [doc.id], question } })).status()).toBe(409)
  expect((await request.delete(path + '/' + (await second.json()).document.id, { headers })).status()).toBe(204)
  expect((await query(id, headers)).status()).toBe(409)
})
