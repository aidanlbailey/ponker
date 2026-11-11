import { expect, test, type WebSocketRoute } from '@playwright/test'
import { command, join, newRoom, tick, viewOf } from '../worker/src/room'

type Cue = { file: string; rate: number; flip: number | null; board: number }

for (const street of ['turn', 'river'] as const) {
  test(`all-in pitches climb once per player and the finale ${street === 'turn' ? 'follows the river flip' : 'skips a finished board'}`, async ({ page }) => {
    const room = newRoom()
    const a = 'allin-audio-player-a'
    const b = 'allin-audio-player-b'
    const online = new Set([a, b])
    join(room, a, 'Ann', 0)
    join(room, b, 'Bob', 0)
    tick(room, room.nextHand!, online)
    while (room.table.street !== street) {
      const seat = room.table.seats[room.table.toAct]!
      command(room, room.members[room.table.toAct]!.token!, { t: 'act', action: { type: room.table.currentBet > seat.bet ? 'call' : 'check' } }, 2000)
    }
    const shover = room.members[room.table.toAct]!.token!
    const self = shover === a ? b : a
    await page.addInitScript((token) => {
      localStorage.setItem('ponker-guest', JSON.stringify(token))
      localStorage.setItem('ponker-user-name', JSON.stringify('Me'))
      localStorage.setItem('ponker-sound', 'true')
      const cues: Cue[] = []
      Object.assign(window, { audioCues: cues })
      const inputs = new WeakMap<ArrayBuffer, string>()
      const decoded = new WeakMap<AudioBuffer, string>()
      const fetchOriginal = window.fetch
      window.fetch = async (...args) => {
        const response = await fetchOriginal(...args)
        const path = String(args[0])
        if (path.includes('/sfx/')) {
          const read = response.arrayBuffer.bind(response)
          response.arrayBuffer = async () => {
            const data = await read()
            inputs.set(data, path)
            return data
          }
        }
        return response
      }
      const decode = AudioContext.prototype.decodeAudioData
      AudioContext.prototype.decodeAudioData = function (data) {
        return decode.call(this, data).then((buffer) => {
          decoded.set(buffer, inputs.get(data) ?? '')
          return buffer
        })
      }
      const create = AudioContext.prototype.createBufferSource
      AudioContext.prototype.createBufferSource = function () {
        const source = create.call(this)
        const start = source.start.bind(source)
        source.start = (...args) => {
          const flip = document.querySelector('.board .tcard:last-child .tcard-flip')
          cues.push({ file: source.buffer ? decoded.get(source.buffer) ?? '' : '', rate: source.playbackRate.value, flip: flip ? new DOMMatrix(getComputedStyle(flip).transform).m11 : null, board: document.querySelectorAll('.board .tcard.up').length })
          start(...args)
        }
        return source
      }
    }, self)
    let socket: WebSocketRoute
    await page.routeWebSocket('**/room/sfxs?*', (ws) => {
      socket = ws
      ws.onMessage((raw) => {
        if (raw === 'ping') return ws.send('pong')
        command(room, self, JSON.parse(String(raw)), 4000)
        room.seq++
        ws.send(JSON.stringify(viewOf(room, self, online, 4000)))
      })
      ws.send(JSON.stringify(viewOf(room, self, online, 3000)))
    })
    await page.goto('/#room/sfxs')
    await expect(page.locator('.felt')).toBeVisible()
    const toggle = page.getByRole('button', { name: 'Sound', exact: true })
    await toggle.click()
    await toggle.click()
    const raiser = room.table.seats[room.table.toAct]!
    command(room, shover, { t: 'act', action: { type: 'raise', to: raiser.chips + raiser.bet } }, 3500)
    room.seq++
    socket!.send(JSON.stringify(viewOf(room, self, online, 3500)))
    await expect(page.locator('.bet-actions .call')).toBeVisible()
    await page.locator('.bet-actions .call').click()
    const cues = () => page.evaluate(() => (window as unknown as { audioCues: Cue[] }).audioCues)
    await expect.poll(async () => (await cues()).filter((cue) => /all-in-\d/.test(cue.file)).map((cue) => cue.file.split('/').at(-1))).toEqual(['all-in-1.wav', 'all-in-2.wav'])
    await expect(page.locator('.reveal-pane')).toHaveCount(2)
    await expect(page.locator('.hand-reveal')).toHaveCount(0)
    if (street === 'turn') {
      await expect.poll(async () => (await cues()).filter((cue) => cue.file.endsWith('runout-end.wav')).length).toBe(1)
      const ending = (await cues()).find((cue) => cue.file.endsWith('runout-end.wav'))!
      expect(ending.board).toBe(5)
      expect(ending.flip).toBeGreaterThan(0.999)
      expect(ending.rate).toBe(1)
    } else {
      await page.waitForTimeout(600)
      expect((await cues()).some((cue) => cue.file.endsWith('runout-end.wav'))).toBe(false)
    }
    expect((await cues()).filter((cue) => /all-in-\d/.test(cue.file))).toHaveLength(2)
  })
}
