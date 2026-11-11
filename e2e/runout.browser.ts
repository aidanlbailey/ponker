import { expect, test, type WebSocketRoute } from '@playwright/test'
import { command, join, newRoom, tick, viewOf } from '../worker/src/room'
import { REVEAL_FLIP_MS, REVEAL_MS } from '../src/game/runout'

type Frame = { at: number; scale: number; goal: number; cards: number; width: number; height: number; fits: boolean; potFits: boolean; potVisible: boolean; reveal: boolean; board: boolean; flip: number | null; spread: number }

for (const street of ['preflop', 'flop', 'turn', 'river'] as const) {
  test(`all-in on the ${street} keeps muted and audible viewers together`, async ({ page, context, browser }, testInfo) => {
    const room = newRoom()
    const a = 'runout-player-aaaa'
    const b = 'runout-player-bbbb'
    const online = new Set([a, b])
    join(room, a, 'Ann', 0)
    join(room, b, 'Bob', 0)
    tick(room, room.nextHand!, online)
    while (room.table.street !== street) {
      const seat = room.table.seats[room.table.toAct]!
      command(room, room.members[room.table.toAct]!.token!, { t: 'act', action: { type: room.table.currentBet > seat.bet ? 'call' : 'check' } }, 2000)
    }
    const raiser = room.table.seats[room.table.toAct]!
    command(room, room.members[room.table.toAct]!.token!, { t: 'act', action: { type: 'raise', to: raiser.chips + raiser.bet } }, 3000)
    const sockets: WebSocketRoute[] = []
    const connect = (ws: WebSocketRoute) => {
      sockets.push(ws)
      ws.onMessage((raw) => { if (raw === 'ping') ws.send('pong') })
      ws.send(JSON.stringify(viewOf(room, a, online, 3000)))
    }
    const mutedContext = await browser.newContext({ viewport: page.viewportSize()!, reducedMotion: 'reduce' })
    await context.routeWebSocket('**/room/roll?*', connect)
    await mutedContext.routeWebSocket('**/room/roll?*', connect)
    const muted = await mutedContext.newPage()
    for (const [i, viewer] of [page, muted].entries()) {
      await viewer.addInitScript((on) => {
        localStorage.setItem('ponker-user-name', JSON.stringify('Ann'))
        localStorage.setItem('ponker-sound', JSON.stringify(on))
      }, i === 0)
      await viewer.goto('/#room/roll')
      await expect(viewer.locator('.felt')).toBeVisible()
      await viewer.evaluate(() => document.body.click())
      await viewer.evaluate(() => {
        const watch = new MutationObserver(() => {
          if (document.querySelectorAll('.board .tcard.up').length !== 5) return
          Object.assign(window, { riverAt: Date.now() })
          watch.disconnect()
        })
        watch.observe(document.querySelector('.board')!, { childList: true })
      })
    }
    await page.bringToFront()
    await page.evaluate(() => {
      const frames: Frame[] = []
      Object.assign(window, { runoutFrames: frames })
      const start = performance.now()
      const frame = (at: number) => {
        const felt = document.querySelector<HTMLElement>('.felt')!
        const scale = new DOMMatrix(getComputedStyle(felt).transform).a
        const targets = document.querySelectorAll('.board')
        const wrap = document.querySelector('.table-wrap')!.getBoundingClientRect()
        const toolbar = document.querySelector('.poker-bar')!.getBoundingClientRect()
        const inside = (element: Element) => {
          const r = element.getBoundingClientRect()
          return r.left >= Math.max(0, wrap.left) - 1 && r.right <= Math.min(innerWidth, wrap.right) + 1 && r.top >= Math.max(0, wrap.top, toolbar.bottom) - 1 && r.bottom <= Math.min(innerHeight, wrap.bottom) + 1
        }
        const fits = [...targets].every((element) => {
          const r = element.getBoundingClientRect()
          return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight
        })
        const pot = [...felt.querySelectorAll('.pot .pile, .pot .pile-label:not(.gone, .pot-fit)')]
        const potFits = pot.every(inside)
        const potVisible = !!felt.querySelector('.pot .pile-label:not(.gone, .pot-fit)')
        const flips = [...document.querySelectorAll('.reveal-cards .tcard-flip')].map((card) => new DOMMatrix(getComputedStyle(card).transform).m11)
        frames.push({ at: at - start, scale, goal: Number(felt.style.getPropertyValue('--camera-zoom')), cards: felt.querySelectorAll('.board .tcard.up').length, width: felt.offsetWidth, height: felt.offsetHeight, fits, potFits, potVisible, reveal: !!document.querySelector('.hand-reveal'), board: felt.classList.contains('runout'), flip: flips[0] ?? null, spread: flips.length ? Math.max(...flips) - Math.min(...flips) : 0 })
        if (performance.now() - start < 12000) requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    })
    command(room, room.members[room.table.toAct]!.token!, { t: 'act', action: { type: 'call' } }, 4000)
    room.seq++
    for (const socket of sockets) socket.send(JSON.stringify(viewOf(room, a, online, 4000)))
    await expect(page.locator('.hand-reveal .reveal-pane')).toHaveCount(2)
    await expect(muted.locator('.hand-reveal .reveal-pane')).toHaveCount(2)
    await expect(page.locator('.reveal-pane .tcard.up')).toHaveCount(4)
    await expect(page.locator('.reveal-board .tcard')).toHaveCount(street === 'preflop' ? 0 : street === 'flop' ? 3 : street === 'turn' ? 4 : 5)
    await expect(page.locator('.reveal-pot')).toHaveText('Pot 2,000')
    await expect(page.getByRole('button', { name: 'Sound', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Leave', exact: true })).toBeVisible()
    await expect(page.locator('.dock')).toBeHidden()
    await expect(page.locator('.felt')).toHaveAttribute('inert', '')
    await page.waitForTimeout(750)
    const paneFits = await page.locator('.reveal-pane').evaluateAll((panes) => panes.every((pane) => {
      const p = pane.getBoundingClientRect()
      return [...pane.querySelectorAll('.tcard')].every((card) => {
        const c = card.getBoundingClientRect()
        return c.left >= p.left && c.right <= p.right && c.top >= p.top && c.bottom <= p.bottom
      })
    }))
    expect(paneFits).toBe(true)
    const split = await page.locator('.reveal-pane').evaluateAll((panes) => {
      const a = panes[0]!.getBoundingClientRect()
      const b = panes[1]!.getBoundingClientRect()
      const overlay = document.querySelector('.hand-reveal')!.getBoundingClientRect()
      return { stacked: Math.abs(a.left - b.left) < 1, portrait: overlay.height >= overlay.width }
    })
    expect(split.stacked).toBe(split.portrait)
    await testInfo.attach(`split-${street}`, { body: await page.screenshot({ path: testInfo.outputPath(`split-${street}.png`), scale: 'css' }), contentType: 'image/png' })
    await expect(page.locator('.hand-reveal')).toHaveCount(0)
    if (street !== 'river') {
      await testInfo.attach(`board-${street}`, { body: await page.screenshot({ path: testInfo.outputPath(`board-${street}.png`), scale: 'css' }), contentType: 'image/png' })
    }
    await expect(page.locator('.board .tcard.up')).toHaveCount(5)
    await expect(muted.locator('.board .tcard.up')).toHaveCount(5)
    expect(await muted.locator('.felt').evaluate((el) => getComputedStyle(el).transform)).toBe('none')
    if (street !== 'river') {
      const arrivals = await Promise.all([page, muted].map((viewer) => viewer.evaluate(() => (window as unknown as { riverAt: number }).riverAt)))
      expect(Math.abs(arrivals[0]! - arrivals[1]!)).toBeLessThan(250)
    }
    await expect.poll(() => page.locator('.felt').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a)).toBe(1)
    const frames = await page.evaluate(() => (window as unknown as { runoutFrames: Frame[] }).runoutFrames)
    await testInfo.attach(`runout-${street}-frames`, { body: JSON.stringify(frames), contentType: 'application/json' })
    const flipStart = frames.find((frame) => frame.flip !== null && frame.flip > -0.99)!.at
    expect(flipStart).toBeGreaterThan(REVEAL_FLIP_MS - 30)
    expect(frames.every((frame) => frame.spread < 0.001)).toBe(true)
    if (street === 'river') {
      expect(frames.every((frame) => frame.scale === 1)).toBe(true)
    } else {
      expect(Math.max(...frames.map((frame) => frame.scale))).toBeGreaterThan(1.1)
      expect(frames.filter((frame) => frame.reveal).every((frame) => frame.scale === 1)).toBe(true)
      const focus = frames.find((frame) => frame.board)!
      const firstFlip = frames.find((frame) => frame.cards > (street === 'preflop' ? 0 : street === 'flop' ? 3 : 4))!
      expect(firstFlip.at - focus.at).toBeGreaterThan(1000)
      expect(firstFlip.scale).toBeGreaterThanOrEqual(firstFlip.goal - 0.02)
      const river = frames.find((frame) => frame.cards === 5)!
      const turn = street === 'turn' ? frames.find((frame) => frame.scale > 1)!.at : frames.find((frame) => frame.cards === 4)!.at
      expect(river.at - turn).toBeGreaterThan(2500)
      expect(river.at - turn).toBeLessThan(2900)
      expect(frames.filter((frame) => frame.board).every((frame) => frame.fits)).toBe(true)
      expect(frames.filter((frame) => frame.board).every((frame) => frame.potFits)).toBe(true)
      expect(frames.filter((frame) => frame.board).some((frame) => frame.potVisible)).toBe(true)
      expect(river.at).toBeGreaterThan(REVEAL_MS)
      expect(new Set(frames.map((frame) => `${frame.width}/${frame.height}`)).size).toBe(1)
      for (let i = 1; i < frames.length; i++) {
        const elapsed = frames[i]!.at - frames[i - 1]!.at
        expect(Math.abs(frames[i]!.scale - frames[i - 1]!.scale)).toBeLessThan(elapsed * 0.003 + 0.005)
      }
    }
    await mutedContext.close()
  })
}

for (const { count, landscape } of [{ count: 3, landscape: false }, { count: 5, landscape: false }, { count: 6, landscape: false }, { count: 6, landscape: true }]) {
  test(`${count} simultaneous hands fit ${landscape ? 'a short landscape screen' : 'separate close-up panes'}, and a reload skips the reveal`, async ({ page }, testInfo) => {
    const room = newRoom()
    const tokens = Array.from({ length: count }, (_, i) => `runout-six-player-${i}`)
    const online = new Set(tokens)
    for (const [i, token] of tokens.entries()) join(room, token, `Player ${i + 1}`, 0)
    tick(room, room.nextHand!, online)
    command(room, room.members[room.table.toAct]!.token!, { t: 'act', action: { type: 'raise', to: 1000 } }, 2000)
    while (room.table.seats.filter((seat) => seat && seat.chips > 0).length > 1) {
      command(room, room.members[room.table.toAct]!.token!, { t: 'act', action: { type: 'call' } }, 2500)
    }
    let send: ((data: string) => void) | undefined
    await page.routeWebSocket('**/room/sixx?*', (ws) => {
      send = (data) => ws.send(data)
      ws.onMessage((raw) => { if (raw === 'ping') ws.send('pong') })
      ws.send(JSON.stringify(viewOf(room, tokens[0]!, online, 3000)))
    })
    await page.addInitScript(() => localStorage.setItem('ponker-user-name', JSON.stringify('Player 1')))
    await page.goto('/#room/sixx')
    let scene = page.mainFrame()
    if (landscape) {
      await page.evaluate(() => {
        const iframe = document.createElement('iframe')
        iframe.src = location.href
        iframe.style.cssText = 'position:fixed;inset:0;width:844px;height:390px;border:0;z-index:9999'
        document.body.append(iframe)
      })
      scene = page.frames().find((frame) => frame !== page.mainFrame())!
      await scene.waitForURL('**/#room/sixx')
      expect(await scene.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({ width: 844, height: 390 })
    }
    await expect(scene.locator('.felt')).toBeVisible()
    command(room, room.members[room.table.toAct]!.token!, { t: 'act', action: { type: 'call' } }, 4000)
    room.seq++
    send!(JSON.stringify(viewOf(room, tokens[0]!, online, 4000)))
    await expect(scene.locator('.reveal-pane')).toHaveCount(count)
    await page.waitForTimeout(750)
    expect(await scene.locator('.reveal-pane').evaluateAll((panes) => panes.every((pane) => {
      const p = pane.getBoundingClientRect()
      return [...pane.querySelectorAll('.tcard, .reveal-player')].every((element) => {
        const r = element.getBoundingClientRect()
        return r.left >= p.left && r.right <= p.right && r.top >= p.top && r.bottom <= p.bottom
      })
    }))).toBe(true)
    const tracks = await scene.locator('.reveal-panes').evaluate((el) => {
      const box = el.getBoundingClientRect()
      const overlay = document.querySelector('.hand-reveal')!.getBoundingClientRect()
      const toolbar = document.querySelector('.poker-bar')!.getBoundingClientRect()
      return { columns: getComputedStyle(el).gridTemplateColumns.split(' ').length, portrait: overlay.height >= overlay.width, toolbarClear: overlay.top >= toolbar.bottom, fits: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight }
    })
    expect(tracks.fits).toBe(true)
    expect(tracks.toolbarClear).toBe(true)
    expect(tracks.columns).toBe(tracks.portrait ? 2 : count === 5 ? 6 : 3)
    await testInfo.attach('hands', { body: await scene.locator('.poker').screenshot({ path: testInfo.outputPath('hands.png'), scale: 'css' }), contentType: 'image/png' })
    const fresh = new URL(scene.url())
    fresh.searchParams.set('reveal-reload', '1')
    await scene.goto(fresh.href)
    await expect(scene.locator('.board .tcard.up')).toHaveCount(5)
    await expect(scene.locator('.hand-reveal')).toHaveCount(0)
    expect(await scene.locator('.felt').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a)).toBe(1)
  })
}

test('a voluntary show gets one close-up and cannot replay on another unchanged state', async ({ page }, testInfo) => {
  const room = newRoom()
  const a = 'runout-player-aaaa'
  const b = 'runout-player-bbbb'
  const online = new Set([a, b])
  join(room, a, 'Ann', 0)
  join(room, b, 'Bob', 0)
  tick(room, room.nextHand!, online)
  command(room, room.members[room.table.toAct]!.token!, { t: 'act', action: { type: 'fold' } }, 2000)
  const winner = room.table.seats.findIndex((seat) => seat && !seat.folded)
  let send: ((data: string) => void) | undefined
  await page.routeWebSocket('**/room/show?*', (ws) => {
    send = (data) => ws.send(data)
    ws.onMessage((raw) => { if (raw === 'ping') ws.send('pong') })
    ws.send(JSON.stringify(viewOf(room, a, online, 3000)))
  })
  await page.addInitScript(() => localStorage.setItem('ponker-user-name', JSON.stringify('Ann')))
  await page.goto('/#room/show')
  await expect(page.locator('.felt')).toBeVisible()
  await expect(page.locator('.hand-reveal')).toHaveCount(0)
  command(room, room.members[winner]!.token!, { t: 'act', action: { type: 'show' } }, 4000)
  room.seq++
  send!(JSON.stringify(viewOf(room, a, online, 4000)))
  await expect(page.locator('.reveal-pane')).toHaveCount(1)
  await expect(page.locator('.reveal-pane .tcard.up')).toHaveCount(2)
  await page.waitForTimeout(750)
  await testInfo.attach('one-hand', { body: await page.screenshot({ path: testInfo.outputPath('one-hand.png'), scale: 'css' }), contentType: 'image/png' })
  await expect(page.locator('.hand-reveal')).toHaveCount(0)
  room.seq++
  send!(JSON.stringify(viewOf(room, a, online, 6000)))
  await page.waitForTimeout(250)
  await expect(page.locator('.hand-reveal')).toHaveCount(0)
  expect(await page.locator('.felt').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a)).toBe(1)
})
