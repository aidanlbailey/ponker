import { expect, test, type WebSocketRoute } from '@playwright/test'
import { command, join, newRoom, tick, viewOf } from '../worker/src/room'

for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 720 }]) {
  test(`pot and board stay framed at ${viewport.width}x${viewport.height} for a player and spectator`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Each iframe supplies its own exact viewport')
    const room = newRoom()
    const tokens = Array.from({ length: 6 }, (_, i) => `pot-camera-player-${i}`)
    const online = new Set(tokens)
    for (const [i, token] of tokens.entries()) join(room, token, `Player ${i}`, 0)
    tick(room, room.nextHand!, online)
    while (room.table.street !== 'turn') {
      const seat = room.table.seats[room.table.toAct]!
      command(room, room.members[room.table.toAct]!.token!, { t: 'act', action: { type: room.table.currentBet > seat.bet ? 'call' : 'check' } }, 2000)
    }
    const shover = room.table.seats[room.table.toAct]!
    command(room, room.members[room.table.toAct]!.token!, { t: 'act', action: { type: 'raise', to: shover.chips } }, 3000)
    while (room.table.seats.filter((seat) => seat && seat.chips > 0).length > 1) {
      command(room, room.members[room.table.toAct]!.token!, { t: 'act', action: { type: 'call' } }, 3000)
    }
    const sockets = new Map<string, WebSocketRoute>()
    await page.routeWebSocket(/\/room\/pot[12]\?/, (ws) => {
      const who = new URL(ws.url()).pathname.endsWith('pot1') ? tokens[0]! : 'pot-camera-watcher'
      sockets.set(who, ws)
      ws.onMessage((raw) => { if (raw === 'ping') ws.send('pong') })
      ws.send(JSON.stringify(viewOf(room, who, online, 3000)))
    })
    await page.goto('/')
    await page.evaluate(({ width, height }) => {
      localStorage.setItem('ponker-user-name', JSON.stringify('Viewer'))
      localStorage.setItem('ponker-sound', 'false')
      for (const id of ['pot1', 'pot2']) {
        const iframe = document.createElement('iframe')
        iframe.src = `/#room/${id}`
        iframe.style.cssText = `position:absolute;left:0;top:0;width:${width}px;height:${height}px;border:0`
        document.body.append(iframe)
      }
    }, viewport)
    const frames = page.frames().filter((frame) => frame !== page.mainFrame())
    for (const frame of frames) {
      await expect(frame.locator('.felt')).toBeVisible()
      expect(await frame.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual(viewport)
      await frame.evaluate(() => {
        const samples: { active: boolean; fits: boolean; pot: boolean; zoom: number; boxes: number[][] }[] = []
        Object.assign(window, { potFrames: samples })
        const start = performance.now()
        const sample = () => {
          const felt = document.querySelector('.felt')!
          const wrap = document.querySelector('.table-wrap')!.getBoundingClientRect()
          const toolbar = document.querySelector('.poker-bar')!.getBoundingClientRect()
          const targets = [...felt.querySelectorAll('.board, .pot .pile-label:not(.gone, .pot-fit), .pot .pile')]
          const boxes = targets.map((el) => el.getBoundingClientRect())
          const fits = boxes.every((r) => r.left >= Math.max(0, wrap.left) - 1 && r.right <= Math.min(innerWidth, wrap.right) + 1 && r.top >= Math.max(wrap.top, toolbar.bottom) - 1 && r.bottom <= Math.min(innerHeight, wrap.bottom) + 1)
          samples.push({ active: felt.classList.contains('runout'), fits, pot: !!felt.querySelector('.pot .pile-label:not(.gone, .pot-fit)'), zoom: new DOMMatrix(getComputedStyle(felt).transform).a, boxes: boxes.map((r) => [r.left, r.top, r.right, r.bottom]) })
          if (performance.now() - start < 9000) requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
      })
    }
    expect(sockets.size).toBe(2)
    command(room, room.members[room.table.toAct]!.token!, { t: 'act', action: { type: 'call' } }, 4000)
    room.seq++
    for (const [who, ws] of sockets) ws.send(JSON.stringify(viewOf(room, who, online, 4000)))
    for (const [i, frame] of frames.entries()) {
      await expect(frame.locator('.board .tcard.up')).toHaveCount(5)
      const data = await frame.evaluate(() => (window as unknown as { potFrames: { active: boolean; fits: boolean; pot: boolean; zoom: number; boxes: number[][] }[] }).potFrames)
      await testInfo.attach(`frames-${i}`, { body: JSON.stringify(data), contentType: 'application/json' })
      const zoomed = data.filter((sample) => sample.active)
      expect(zoomed.length).toBeGreaterThan(20)
      expect(zoomed.every((sample) => sample.pot)).toBe(true)
      expect(zoomed.filter((sample) => !sample.fits), JSON.stringify(zoomed.filter((sample) => !sample.fits).slice(0, 3))).toEqual([])
    }
  })
}
