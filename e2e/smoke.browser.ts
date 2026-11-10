import { expect, test, type Page } from '@playwright/test'
import { networkInterfaces } from 'node:os'
import process from 'node:process'

function lanOrigin() {
  const configured = process.env.PONKER_LAN_URL
  const addresses = Object.values(networkInterfaces()).flatMap((items) => items ?? [])
  const address = addresses.find((item) => item.family === 'IPv4' && !item.internal && /^(10\.|192\.168\.)/.test(item.address))
  const url = new URL(configured ?? `http://${address?.address ?? 'localhost'}:3000`)
  if (url.protocol !== 'http:' || !/^(localhost|127\.0\.0\.1|10(\.\d+){3}|192\.168(\.\d+){2})$/.test(url.hostname) || url.port !== '3000') {
    throw new Error('PONKER_LAN_URL must be a local HTTP origin on port 3000')
  }
  if (url.hostname === '127.0.0.1') throw new Error('Use a different origin for the second player')
  return url.origin
}

async function join(page: Page, origin: string, name: string) {
  await page.goto(`${origin}/#table/phantom`)
  await page.getByRole('textbox', { name: 'What should the table call you?' }).fill(name)
  await page.getByRole('button', { name: 'Sit down', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Players', exact: true })).toBeVisible()
}

async function checkPlayers(page: Page) {
  await page.getByRole('button', { name: 'Players', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Players', exact: true })
  await expect(dialog.getByText('PW Alice', { exact: true })).toBeVisible()
  await expect(dialog.getByText('PW Bob', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).not.toBeVisible()
}

test('home opens Rooms and loads the real local table list', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Play', exact: true })).toBeVisible()
  await testInfo.attach('home', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
  const tables = page.waitForResponse('http://127.0.0.1:8787/tables')
  await page.getByRole('link', { name: 'Rooms Public tables and private rooms' }).click()
  expect((await tables).ok()).toBe(true)
  await expect(page.getByRole('heading', { name: 'Public tables', exact: true })).toBeVisible()
  await expect(page.locator('.preview-list li')).toHaveCount(4)
  await expect(page.getByText("Couldn't load the tables", { exact: false })).not.toBeVisible()
  await testInfo.attach('rooms', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
  expect(errors).toEqual([])
})

test('two guests share a table and keep their identity after reload', async ({ page: alice, browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'The connection check only needs one run')
  const bobContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const bob = await bobContext.newPage()
  const errors: string[] = []
  for (const page of [alice, bob]) page.on('pageerror', (error) => errors.push(error.message))
  try {
    await join(alice, 'http://127.0.0.1:3000', 'PW Alice')
    await join(bob, lanOrigin(), 'PW Bob')
    const aliceToken = await alice.evaluate(() => localStorage.getItem('ponker-guest'))
    const bobToken = await bob.evaluate(() => localStorage.getItem('ponker-guest'))
    expect(aliceToken).toBeTruthy()
    expect(bobToken).toBeTruthy()
    expect(aliceToken).not.toBe(bobToken)
    await checkPlayers(alice)
    await checkPlayers(bob)
    await bob.reload()
    await checkPlayers(bob)
    expect(await bob.evaluate(() => localStorage.getItem('ponker-guest'))).toBe(bobToken)
    await testInfo.attach('table-desktop', { body: await alice.screenshot({ fullPage: true }), contentType: 'image/png' })
    await testInfo.attach('table-phone', { body: await bob.screenshot({ fullPage: true }), contentType: 'image/png' })
    expect(errors).toEqual([])
  } catch (error) {
    if (!bob.isClosed()) {
      await testInfo.attach('second-player-failure', { body: await bob.screenshot({ fullPage: true }), contentType: 'image/png' })
    }
    throw error
  } finally {
    // Leaving through the UI releases the seats instead of waiting for disconnect grace.
    try {
      for (const page of [bob, alice]) {
        await page.keyboard.press('Escape')
        const close = page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true })
        if (await close.isVisible()) {
          await close.click()
          await expect(page.getByRole('dialog')).not.toBeVisible()
        }
        const leave = page.getByRole('button', { name: 'Leave', exact: true })
        if (await leave.isVisible()) await leave.click()
      }
    } finally {
      await bobContext.close()
    }
  }
})
