import { expect, test, type Page } from '@playwright/test'
import { applyAction, createTable, shuffledDeck } from '../src/engine/engine'

const art = 'A'.repeat(384)
const boards = {
  rating: [{ id: 'u:2', name: 'Two', avatar: art, rating: 1100, bot: false }],
  bb100: [{ id: 'u:2', name: 'Two', avatar: art, hands: 250, net: 1000 }],
}

async function mock(page: Page, remote: number[] = [], shown: number[] = []) {
  await page.route('http://127.0.0.1:8787/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    let json: unknown = {}
    if (path === '/boards') json = boards
    if (path.startsWith('/players/')) json = { id: 2, name: 'Two', avatar: art, rating: 1100, stats: [] }
    if (path === '/me/friends') json = { friends: [], incoming: [], outgoing: [] }
    if (path === '/avatars') json = [{ id: 2, avatar: art }]
    if (path === '/me/hidden-art') {
      const ids = route.request().postDataJSON()?.ids ?? []
      remote.push(...ids.filter((id: number) => !remote.includes(id) && !shown.includes(id)))
      for (const choice of route.request().postDataJSON()?.choices ?? []) {
        for (const list of [remote, shown]) {
          const at = list.indexOf(choice.user)
          if (at >= 0) list.splice(at, 1)
        }
        ;(choice.hidden ? remote : shown).push(choice.user)
      }
      json = { hidden: remote, shown }
    }
    await route.fulfill({ json, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } })
  })
}

test('reporting hides full boards, both tabs, and profile boards without a reload', async ({ page }) => {
  await mock(page)
  await page.goto('/#boards')
  await expect(page.locator('.leaderboard canvas')).toHaveCount(1)
  await page.getByRole('button', { name: 'Two' }).click()
  await expect(page.locator('.leaderboard canvas')).toHaveCount(1)
  await page.getByRole('button', { name: 'Report picture', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Report', exact: true }).click()
  await expect(page.locator('.leaderboard canvas')).toHaveCount(0)
  await expect(page.locator('.player-art')).toHaveCount(0)
  await page.goto('/#boards')
  await expect(page.locator('.board-name')).toHaveText('Two')
  await expect(page.locator('.leaderboard canvas')).toHaveCount(0)
  await page.getByRole('tab', { name: 'bb/100' }).click()
  await expect(page.locator('.leaderboard canvas')).toHaveCount(0)
  await page.getByRole('button', { name: 'Two' }).click()
  await page.getByRole('button', { name: 'Show picture', exact: true }).click()
  await expect(page.locator('.player-art')).toHaveCount(1)
  await expect(page.locator('.leaderboard canvas')).toHaveCount(1)
})

test('legacy browser hides merge into the account and a fresh browser loads account hides', async ({ page, browser }) => {
  const remote: number[] = [2]
  await mock(page, remote)
  await page.addInitScript(() => {
    localStorage.setItem('ponker-session', 'test-session')
    localStorage.setItem('ponker-hidden-art', '[3]')
  })
  await page.goto('/#boards')
  await expect.poll(() => remote).toEqual([2, 3])
  await expect(page.locator('.board-name')).toHaveText('Two')
  await expect(page.locator('.leaderboard canvas')).toHaveCount(0)
  const context = await browser.newContext()
  try {
    const fresh = await context.newPage()
    await mock(fresh, remote)
    await fresh.addInitScript(() => localStorage.setItem('ponker-session', 'test-session'))
    await fresh.goto('http://127.0.0.1:3000/#boards')
    await expect.poll(() => fresh.evaluate(() => JSON.parse(localStorage.getItem('ponker-hidden-art') ?? '[]'))).toEqual([2, 3])
    await expect(fresh.locator('.leaderboard canvas')).toHaveCount(0)
  } finally { await context.close() }
})

test('replays look up current art, react to hides, and discard unidentified old pictures', async ({ page }) => {
  await mock(page)
  let before = createTable(2, 5, 10)
  before = applyAction(before, { type: 'sit', seat: 0, id: 'me', chips: 1000 })
  before = applyAction(before, { type: 'sit', seat: 1, id: 'other', chips: 1000 })
  const dealt = applyAction(before, { type: 'deal', deck: shuffledDeck() })
  const base = { where: 'Venom', me: 0, names: ['Me', 'Two'], before, steps: [{ table: dealt }], arts: [null, 'B'.repeat(384)] }
  await page.addInitScript((hands) => localStorage.setItem('ponker-history', JSON.stringify(hands)), [
    { ...base, id: 1, users: [null, 2] }, { ...base, id: 2 },
  ])
  await page.goto('/#history/1')
  await expect(page.locator('.seat:not(.seat-badges) .avatar-art')).toHaveCount(1)
  expect(await page.locator('.seat:not(.seat-badges) .avatar-art').evaluate((canvas) => (canvas as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 1, 1).data[3])).toBe(0)
  await page.evaluate(() => {
    localStorage.setItem('ponker-hidden-art', '[2]')
    dispatchEvent(new Event('hidden-art'))
  })
  await expect(page.locator('.seat:not(.seat-badges) .avatar-art')).toHaveCount(0)
  await page.goto('/#history/2')
  await expect(page.locator('.history-controls')).toBeVisible()
  await expect(page.locator('.seat:not(.seat-badges) .avatar-art')).toHaveCount(0)
})


test('a report can keep the picture visible and the choice survives stale device hides', async ({ page, browser }) => {
  const remote: number[] = []
  const shown: number[] = []
  await mock(page, remote, shown)
  await page.addInitScript(() => localStorage.setItem('ponker-session', 'test-session'))
  await page.goto('/#player/2')
  await page.getByRole('button', { name: 'Report picture', exact: true }).click()
  const choice = page.getByRole('checkbox', { name: 'Hide their picture for me' })
  await expect(choice).toBeChecked()
  await choice.uncheck()
  const report = page.waitForRequest((request) => new URL(request.url()).pathname === '/report')
  await page.getByRole('dialog').getByRole('button', { name: 'Report', exact: true }).click()
  expect((await report).postDataJSON()).toEqual({ user: 2, hidden: false })
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.locator('.player-art')).toHaveCount(1)
  await expect(page.locator('.leaderboard canvas')).toHaveCount(1)
  await expect.poll(() => shown).toEqual([2])
  const context = await browser.newContext()
  try {
    const other = await context.newPage()
    await mock(other, remote, shown)
    await other.addInitScript(() => {
      localStorage.setItem('ponker-session', 'test-session')
      localStorage.setItem('ponker-hidden-art', '[2]')
    })
    await other.goto('http://127.0.0.1:3000/#player/2')
    await expect(other.locator('.player-art')).toHaveCount(1)
    await expect(other.locator('.leaderboard canvas')).toHaveCount(1)
    expect(remote).toEqual([])
  } finally { await context.close() }
})
