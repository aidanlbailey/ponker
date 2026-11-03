import { describe, expect, test } from 'vitest'
import { HIDDEN } from '../../src/engine/engine'
import { BANK_MS, command, GRACE_MS, join, newRoom, nextWake, tick, TURN_MS, viewOf, type Room } from './room'

const A = 'token-aaaaaaaaaaaaaaaa'
const B = 'token-bbbbbbbbbbbbbbbb'
const C = 'token-cccccccccccccccc'
const everyone = new Set([A, B, C])

// runs the clock forward to the next thing due, like the alarm would
function wake(r: Room, online = everyone) {
  const at = nextWake(r)
  if (at === null) throw new Error('nothing due')
  tick(r, at, online)
  return at
}

function twoPlayers() {
  const r = newRoom()
  join(r, A, 'Ann', 0)
  join(r, B, 'Bob', 0)
  wake(r) // the hand that was lined up gets dealt
  return r
}

const reject = (): never => {
  throw new Error('table stalled')
}

const tokenOn =(r: Room, seat: number) => r.members[seat]!.token!

describe('room', () => {
  test('host sits at the bottom, the next player across, and a hand gets dealt', () => {
    const r = newRoom()
    join(r, A, '  Ann\u0007 ', 0)
    expect(r.host).toBe(A)
    expect(r.members[0]?.name).toBe('Ann')
    expect(r.nextHand).toBeNull() // one player isn't a game
    join(r, B, '', 0)
    expect(r.members[3]?.name).toBe('Guest')
    wake(r)
    expect(r.table.street).toBe('preflop')
    expect(r.hand).toBe(1)
  })

  test('a view never has anyone else’s cards or tokens in it', () => {
    const r = twoPlayers()
    const view = viewOf(r, A, everyone, 0)
    expect(view.table.seats[0]!.cards.every((c) => c >= 0)).toBe(true)
    expect(view.table.seats[3]!.cards).toEqual([HIDDEN, HIDDEN])
    expect(view.table.deck).toEqual([])
    expect(JSON.stringify(view)).not.toContain(B)
    expect(viewOf(r, C, everyone, 0).me).toBeNull()
  })

  test('only the seat on the clock can act', () => {
    const r = twoPlayers()
    const waiting = tokenOn(r, r.table.toAct === 0 ? 3 : 0)
    expect(() => command(r, waiting, { t: 'act', action: { type: 'call' } }, 1)).toThrow('not your turn')
    const before = r.members.map((m) => m?.bank)
    expect(() => command(r, tokenOn(r, r.table.toAct), { t: 'act', action: { type: 'raise', to: 3 } }, 1)).toThrow()
    expect(r.members.map((m) => m?.bank)).toEqual(before)
  })

  test('the clock runs out, then the bank, then it checks or folds and sits them out', () => {
    const r = twoPlayers()
    const seat = r.table.toAct
    const started = r.turn!.ends - TURN_MS
    wake(r)
    expect(r.turn).toMatchObject({ seat, banked: true })
    expect(r.turn!.ends - started).toBe(TURN_MS + BANK_MS)
    wake(r)
    expect(r.last).toEqual({ seat, action: { type: 'timeout' } })
    expect(r.table.seats[seat]!.sittingOut).toBe(true)
    expect(r.table.seats[seat]!.folded).toBe(true) // facing the big blind preflop
    expect(r.members[seat]!.bank).toBe(0)
  })

  test('a disconnected player gets the plain clock, no bank', () => {
    const r = twoPlayers()
    const seat = r.table.toAct
    wake(r, new Set([tokenOn(r, seat === 0 ? 3 : 0)]))
    expect(r.last?.action).toEqual({ type: 'timeout' })
    expect(r.members[seat]!.bank).toBe(BANK_MS) // still there for when they're back
  })

  test('acting inside the bank keeps whatever was left of it', () => {
    const r = twoPlayers()
    const token = tokenOn(r, r.table.toAct)
    wake(r)
    command(r, token, { t: 'act', action: { type: 'call' } }, r.turn!.ends - 12_000)
    expect(r.members[r.members.findIndex((m) => m?.token === token)]!.bank).toBe(12_000)
  })

  test('sat out by the clock, they keep the seat for the grace period and no longer', () => {
    const r = twoPlayers()
    const seat = r.table.toAct
    wake(r)
    const out = wake(r) // timed out, hand over
    expect(r.members[seat]!.outSince).toBe(out)
    // the other player alone can't get a hand going
    while (r.members[seat]) wake(r)
    expect(r.table.seats[seat]).toBeNull()
    expect(nextWake(r)).toBeNull()
  })

  test('coming back inside the grace period sits them back in', () => {
    const r = twoPlayers()
    const seat = r.table.toAct
    wake(r)
    wake(r)
    command(r, tokenOn(r, seat), { t: 'back' }, (r.members[seat]!.outSince ?? 0) + GRACE_MS - 1)
    expect(r.table.seats[seat]!.sittingOut).toBe(false)
    expect(r.members[seat]!.outSince).toBeNull()
  })

  test('the same token gets its seat back, a new one gets a new seat', () => {
    const r = twoPlayers()
    join(r, A, 'Ann again', 5)
    expect(r.members[0]!.name).toBe('Ann again')
    expect(r.members.filter(Boolean)).toHaveLength(2)
    join(r, C, 'Cat', 5)
    expect(r.members[1]!.name).toBe('Cat')
  })

  test('only the host adds bots, and bots alone never get dealt a hand', () => {
    const r = newRoom()
    join(r, A, 'Ann', 0)
    join(r, B, 'Bob', 0)
    expect(() => command(r, B, { t: 'addBot' }, 0)).toThrow('host only')
    command(r, A, { t: 'addBot' }, 0)
    command(r, A, { t: 'addBot' }, 0)
    expect(r.members.filter((m) => m && !m.token)).toHaveLength(2)
    command(r, A, { t: 'leave' }, 0)
    command(r, B, { t: 'leave' }, 0)
    wake(r) // the hand that was lined up finds only bots
    expect(r.members.filter(Boolean)).toHaveLength(2)
    expect(r.nextHand).toBeNull()
  })

  test('a leaver mid-hand is played out fast and gone after the payout', () => {
    const r = twoPlayers()
    const seat = r.table.toAct
    command(r, tokenOn(r, seat), { t: 'leave' }, 1)
    expect(r.turn!.ends).toBeLessThanOrEqual(1 + 500)
    wake(r)
    expect(r.table.street).toBe('complete')
    expect(r.members[seat]).not.toBeNull() // winnings still flying
    wake(r)
    expect(r.members[seat]).toBeNull()
  })

  test('hands keep coming with bots, and every chip stays on the table', () => {
    const r = newRoom()
    join(r, A, 'Ann', 0)
    command(r, A, { t: 'addBot' }, 0)
    command(r, A, { t: 'addBot' }, 0)
    let now = 0
    while (r.hand < 20) {
      // the human plays along, calling or checking the moment it's their turn
      if (r.turn && r.members[r.turn.seat]!.token) {
        const type = r.table.currentBet > r.table.seats[r.turn.seat]!.bet ? 'call' : 'check'
        command(r, A, { t: 'act', action: { type } }, now)
      } else {
        // calling everything goes bust, and a bust player alone holds the table up
        if (!r.table.seats[0]!.chips && !r.members[0]!.topUp) command(r, A, { t: 'topUp' }, now)
        now = nextWake(r) ?? reject()
        tick(r, now, new Set([A]))
      }
    }
    expect(r.table.seats[0]!.sittingOut).toBe(false)
    expect(r.stats.actions).toBeGreaterThan(20)
  })

  test('chat keeps the last 30 lines and anyone can talk', () => {
    const r = twoPlayers()
    for (let i = 0; i < 35; i++) command(r, A, { t: 'chat', text: `hi ${i}` }, i)
    expect(r.chat).toHaveLength(30)
    expect(r.chat.at(-1)).toMatchObject({ name: 'Ann', text: 'hi 34' })
    expect(() => command(r, B, { t: 'chat', text: '   ' }, 0)).toThrow('empty')
    expect(command(r, C, { t: 'chat', text: 'x'.repeat(500) }, 0)).toBe('chat')
    expect(r.chat.at(-1)!.text).toHaveLength(200)
  })
})
