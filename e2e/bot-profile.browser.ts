import { expect, test, type Page } from '@playwright/test'
import { applyAction, shuffledDeck } from '../src/engine/engine'
import { botById, type Bot } from '../src/game/roster'
import { newSolo, startHand, STORAGE_KEY } from '../src/game/solo'
import { command, join, newRoom, viewOf } from '../worker/src/room'

async function ratings(page: Page, rating: number | null = 1123) {
  await page.route('**/ratings?*', (route) => {
    const id = new URL(route.request().url()).searchParams.get('ids')!
    return route.fulfill({ json: { [id]: rating }, headers: { 'Access-Control-Allow-Origin': '*' } })
  })
}

async function checkSheet(page: Page, bot: Bot) {
  const sheet = page.locator('.profile-sheet')
  await expect(sheet).toHaveClass(/profile-popout/)
  const bounds = await sheet.boundingBox()
  expect(bounds!.width).toBeLessThan(page.viewportSize()!.width)
  expect(bounds!.height).toBeLessThan(page.viewportSize()!.height)
  await expect(sheet.getByRole('heading', { name: bot.name, exact: true })).toBeVisible()
  await expect(sheet.getByText(`${bot.skill} ${bot.style}`, { exact: true })).toBeVisible()
  await expect(sheet.getByText(bot.bio, { exact: true })).toBeVisible()
  await expect(sheet.locator('.bot-pic .avatar')).toHaveText(bot.letter)
  await expect(sheet.getByRole('button', { name: 'Rating 1123, how rating works' })).toBeVisible()
  await expect(sheet.getByRole('button', { name: /Report|Edit|friend/i })).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Rating 1123, how rating works' }).click()
  await expect(sheet.getByRole('heading', { name: 'How rating works' })).toBeVisible()
  await sheet.getByRole('button', { name: 'Rating 1123, how rating works' }).click()
  await expect(sheet.locator('.rating-fold')).not.toHaveClass(/open/)
  const fits = await sheet.evaluate((element) => element.scrollWidth <= innerWidth)
  expect(fits).toBe(true)
}

async function back(page: Page) {
  await page.locator('.profile-sheet').getByRole('button', { name: /^(Close|‹ Table)$/ }).click()
  await expect(page.locator('.profile-sheet')).toHaveCount(0)
}

test('solo bot names and pictures open the profile without changing the saved table', async ({ page }, testInfo) => {
  await ratings(page)
  const bot = botById('bot:delta')!
  const solo = newSolo([bot.id])
  await page.addInitScript(({ key, solo }) => localStorage.setItem(key, JSON.stringify(solo)), { key: STORAGE_KEY, solo })
  await page.goto('/#play')
  await page.getByRole('button', { name: bot.name, exact: true }).click()
  await checkSheet(page, bot)
  await testInfo.attach('bot-profile', { body: await page.screenshot({ path: testInfo.outputPath('bot-profile.png'), fullPage: true, animations: 'disabled' }), contentType: 'image/png' })
  await page.getByRole('button', { name: 'View full profile', exact: true }).click()
  await expect(page.locator('.profile-sheet')).toHaveClass(/expanded/)
  const full = await page.locator('.profile-sheet').boundingBox()
  expect(full!.width).toBe(page.viewportSize()!.width)
  expect(full!.height).toBe(page.viewportSize()!.height)
  await back(page)
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY)).toEqual(solo)
  await page.locator('.seat:not(.me, .seat-badges) button.avatar').click()
  await checkSheet(page, bot)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await back(page)
  await expect(page.getByRole('button', { name: 'Deal me in', exact: true })).toBeVisible()
  expect(new URL(page.url()).hash).toBe('#play')
})

test('player profiles start compact, expand for stats and dismiss with Escape', async ({ page }, testInfo) => {
  const token = 'player-profile-test'
  const room = newRoom()
  join(room, token, 'Me', 0)
  join(room, 'another-profile-player', 'Alice', 0, { user: 2, art: null })
  await page.route('**/players/2', (route) => route.fulfill({ json: { id: 2, name: 'Alice', avatar: null, rating: 1080, stats: [] } }))
  await page.route('**/boards', (route) => route.fulfill({ json: { rating: [], bb100: [] } }))
  await page.routeWebSocket('**/room/test?*', (ws) => {
    ws.onMessage((raw) => { if (raw === 'ping') ws.send('pong') })
    ws.send(JSON.stringify(viewOf(room, token, new Set([token]), 0)))
  })
  await page.addInitScript((token) => localStorage.setItem('ponker-guest', JSON.stringify(token)), token)
  await page.goto('/#room/test')
  await page.getByRole('textbox', { name: 'What should the table call you?' }).fill('Me')
  await page.getByRole('button', { name: 'Sit down', exact: true }).click()
  await page.getByRole('button', { name: 'Alice', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Profile', exact: true })
  await expect(sheet).toHaveClass(/profile-popout/)
  await expect(sheet.getByRole('heading', { name: 'Alice', exact: true })).toBeVisible()
  await expect(sheet.getByRole('heading', { name: 'Stats', exact: true })).toHaveCount(0)
  await testInfo.attach('player-popout', { body: await page.screenshot({ path: testInfo.outputPath('player-popout.png'), animations: 'disabled' }), contentType: 'image/png' })
  await sheet.getByRole('button', { name: 'View full profile' }).click()
  await expect(sheet).toHaveClass(/expanded/)
  await expect(sheet.getByRole('heading', { name: 'Stats', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(page.locator('.seat.me:not(.seat-badges) .seat-name')).toHaveText('Me')
  await page.locator('.seat:not(.seat-badges)').filter({ has: page.getByRole('button', { name: 'Alice', exact: true }) }).getByRole('button', { name: 'See their profile' }).click()
  await expect(sheet).toHaveClass(/profile-popout/)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await back(page)
})

for (const isPublic of [false, true]) {
  test(`${isPublic ? 'public' : 'private'} table bot profiles keep the socket and seat`, async ({ page }) => {
    await ratings(page)
    const token = 'bot-profile-player'
    const room = newRoom(isPublic)
    join(room, token, 'Me', 0)
    command(room, token, { t: 'addBot' }, 0)
    const bot = botById(room.table.seats.find((seat) => seat?.id.startsWith('bot:'))!.id)!
    const path = isPublic ? 'table/phantom' : 'room/test'
    const sent: string[] = []
    await page.addInitScript((token) => localStorage.setItem('ponker-guest', JSON.stringify(token)), token)
    await page.routeWebSocket(`**/${path}?*`, (ws) => {
      ws.onMessage((raw) => {
        if (raw === 'ping') return ws.send('pong')
        sent.push(String(raw))
      })
      ws.send(JSON.stringify(viewOf(room, token, new Set([token]), 0)))
    })
    await page.goto(`/#${path}`)
    await page.getByRole('textbox', { name: 'What should the table call you?' }).fill('Me')
    await page.getByRole('button', { name: 'Sit down', exact: true }).click()
    const name = page.getByRole('button', { name: bot.name, exact: true })
    await name.click()
    await checkSheet(page, bot)
    await page.evaluate(() => {
      (document.activeElement as HTMLElement)?.blur()
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    })
    await expect(page.locator('.said.draft')).toHaveCount(0)
    await back(page)
    await expect(page.locator('.seat.me:not(.seat-badges) .seat-name')).toHaveText('Me')
    const seat = page.locator('.seat:not(.seat-badges)').filter({ has: name })
    await seat.getByRole('button', { name: 'See their profile' }).click()
    await checkSheet(page, bot)
    await back(page)
    expect(new URL(page.url()).hash).toBe(`#${path}`)
    expect(sent).toEqual([])
  })
}

test('offline solo profiles show personality when rating cannot load', async ({ page }) => {
  await page.route('**/ratings?*', (route) => route.abort())
  await page.goto('/#play')
  await page.getByRole('button', { name: 'Xi', exact: true }).click()
  const sheet = page.locator('.profile-sheet')
  await expect(sheet.getByText(botById('bot:xi')!.bio, { exact: true })).toBeVisible()
  await expect(sheet.getByRole('status')).toHaveText('Rating unavailable')
  await page.mouse.click(1, 1)
  await expect(sheet).toHaveCount(0)
})

test('a solo bot keeps playing while its profile is open and an unplaced rating stays unplaced', async ({ page }) => {
  await ratings(page, null)
  const solo = newSolo()
  solo.table = startHand(solo.table, shuffledDeck())
  solo.table = applyAction(solo.table, { type: 'call', seat: 0 })
  expect(solo.table.toAct).toBe(1)
  await page.addInitScript(({ key, solo }) => localStorage.setItem(key, JSON.stringify(solo)), { key: STORAGE_KEY, solo })
  await page.goto('/#play')
  await page.getByRole('button', { name: 'Xi', exact: true }).click()
  await expect(page.locator('.profile-sheet').getByRole('button', { name: 'Rating still placing, how rating works' })).toBeVisible()
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).table, STORAGE_KEY)).not.toEqual(solo.table)
  await expect(page.locator('.profile-sheet')).toBeVisible()
  await back(page)
  expect(new URL(page.url()).hash).toBe('#play')
})

for (const path of ['play', 'room/test', 'table/phantom']) {
  test(`your own name and picture open your profile at ${path}`, async ({ page }) => {
    const me = { id: 7, name: 'Me', avatar: 'A'.repeat(384), admin: false, rating: 1080 }
    const token = 'own-profile-player'
    await page.addInitScript(({ me, token }) => {
      localStorage.setItem('ponker-session', 'test-session')
      localStorage.setItem('ponker-me', JSON.stringify(me))
      localStorage.setItem('ponker-user-name', me.name)
      localStorage.setItem('ponker-guest', token)
    }, { me, token })
    await page.route('http://127.0.0.1:8787/**', (route) => {
      const url = new URL(route.request().url())
      let json: unknown = {}
      if (url.pathname === '/me') json = me
      if (url.pathname === '/players/7') json = { ...me, stats: [] }
      if (url.pathname === '/me/friends') json = { friends: [], incoming: [], outgoing: [] }
      if (url.pathname === '/me/hidden-art') json = { hidden: [], shown: [] }
      if (url.pathname === '/boards') json = { rating: [], bb100: [] }
      return route.fulfill({ json })
    })
    if (path !== 'play') {
      const room = newRoom(path.startsWith('table/'))
      join(room, token, me.name, 0, { user: me.id, art: me.avatar })
      await page.routeWebSocket(`**/${path}?*`, (ws) => {
        ws.onMessage((raw) => { if (raw === 'ping') ws.send('pong') })
        ws.send(JSON.stringify(viewOf(room, token, new Set([token]), 0)))
      })
    }
    await page.goto(`/#${path}`)
    const seat = page.locator('.seat.me:not(.seat-badges)')
    await seat.getByRole('button', { name: 'Me', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Profile', exact: true })
    await expect(sheet).toHaveClass(/profile-popout/)
    await expect(sheet.getByRole('heading', { name: 'Me', exact: true })).toBeVisible()
    await expect(sheet.getByRole('button', { name: /Report picture|Add friend|Edit your profile/ })).toHaveCount(0)
    await sheet.getByRole('button', { name: 'View full profile' }).click()
    await sheet.getByRole('button', { name: 'Edit your profile', exact: true }).click()
    await expect(sheet.getByRole('button', { name: 'Edit your picture', exact: true })).toBeVisible()
    await expect(sheet.getByRole('button', { name: /Report picture|Add friend/ })).toHaveCount(0)
    await back(page)
    await seat.getByRole('button', { name: 'See your profile', exact: true }).click()
    await expect(sheet).toHaveClass(/profile-popout/)
    await back(page)
    expect(new URL(page.url()).hash).toBe(`#${path}`)
  })
}
