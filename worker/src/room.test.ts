import { describe, expect, test } from 'vitest'
import { HIDDEN } from '../../src/engine/engine'
import { pickTable } from '../../src/room/public'
import { addressKey, BANK_MS, charge, command, DAILY_ROWS, GRACE_MS, join, newRoom, nextWake, openRoom, PUBLIC_DAILY_ROWS, PUBLIC_GRACE_MS, ROOMS_PER_DAY, spent, stalled, tick, TURN_MS, viewOf, type Room } from './room'

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

  // a grace that ran out mid-hand used to keep the wake in the past, so the alarm fired back to back
  test('the next wake is never in the past, even with a grace run out mid-hand', () => {
    const r = newRoom()
    join(r, A, 'Ann', 0)
    join(r, B, 'Bob', 0)
    join(r, C, 'Cat', 0)
    let now = wake(r)
    const out = r.table.toAct
    const away = new Set([A, B, C].filter((t) => t !== r.members[out]!.token))
    while (r.members[out]!.outSince === null) now = wake(r, away)
    const graceEnds = r.members[out]!.outSince! + GRACE_MS
    // the other two take their time, so hands are live when the grace runs out
    while (now < graceEnds + 60_000) {
      const at = nextWake(r)!
      expect(at).toBeGreaterThanOrEqual(now)
      const seat = r.turn?.seat ?? -1
      if (seat >= 0 && at === r.turn!.ends && r.members[seat]!.token !== r.members[out]?.token) {
        now = at - 1
        const type = r.table.currentBet > r.table.seats[seat]!.bet ? 'call' : 'check'
        command(r, r.members[seat]!.token!, { t: 'act', action: { type } }, now)
      } else {
        now = at
        tick(r, now, away)
      }
    }
    expect(r.members[out]).toBeNull()
  })

  test('a room that has spent its rows for the day finishes the hand, then rests until tomorrow', () => {
    const day = Date.UTC(2026, 10, 3, 12)
    const r = newRoom()
    join(r, A, 'Ann', day)
    join(r, B, 'Bob', day)
    tick(r, nextWake(r)!, everyone)
    charge(r, DAILY_ROWS, day)
    expect(spent(r, day)).toBe(true)
    expect(() => command(r, A, { t: 'chat', text: 'hi' }, day)).toThrow('resting')
    // the hand in progress still plays out
    while (r.table.street !== 'complete') {
      const seat = r.turn!.seat
      const type = r.table.currentBet > r.table.seats[seat]!.bet ? 'call' : 'check'
      command(r, r.members[seat]!.token!, { t: 'act', action: { type } }, day)
    }
    tick(r, r.nextHand!, everyone)
    expect(r.hand).toBe(1)
    expect(r.nextHand).toBeNull()
    expect(viewOf(r, A, everyone, day).resting).toBe(true)
    expect(spent(r, day + 24 * 3600_000)).toBe(false)
    // it wakes itself at midnight and lines a hand up
    const midnight = nextWake(r)!
    expect(midnight).toBe(Date.UTC(2026, 10, 4))
    tick(r, midnight, everyone)
    expect(r.nextHand).not.toBeNull()
    expect(nextWake(r)).toBe(r.nextHand) // the old midnight is gone
  })
})

describe('public table', () => {
  const D = 'token-dddddddddddddddd'
  const all = new Set([A, B, C, D])
  const bots = (r: Room) => r.members.filter((m) => m && !m.token).length

  function lonePlusBots() {
    const r = newRoom(true)
    join(r, A, 'Ann', 0)
    command(r, A, { t: 'addBot' }, 0)
    tick(r, nextWake(r)!, all) // dealt
    return r
  }

  test('has no host, anyone seated fills it to six, and nobody sends a bot off', () => {
    const r = newRoom(true)
    join(r, A, 'Ann', 0)
    expect(r.host).toBeNull()
    expect(() => command(r, C, { t: 'addBot' }, 0)).toThrow() // watching, not seated
    command(r, A, { t: 'addBot' }, 0)
    expect(bots(r)).toBe(5)
    const bot = r.members.findIndex((m) => m && !m.token)
    expect(() => command(r, A, { t: 'removeBot', seat: bot }, 0)).toThrow()
  })

  test('a joiner at a full table waits, one bot stands after the hand, and the deal seats them', () => {
    const r = lonePlusBots()
    expect(r.table.street).toBe('preflop')
    join(r, B, 'Bob', 1)
    join(r, B, 'Bob', 2) // a reconnect while waiting doesn't cost a second bot
    expect(r.members.filter((m) => m?.leaving)).toHaveLength(1)
    expect(viewOf(r, B, all, 2)).toMatchObject({ me: null, waiting: true })
    let guard = 0
    while (r.hand < 2 && guard++ < 200) {
      if (r.turn && r.members[r.turn.seat]!.token) command(r, A, { t: 'act', action: { type: 'fold' } }, nextWake(r)! - 1)
      else tick(r, nextWake(r)!, all)
    }
    expect(r.members.some((m) => m?.token === B)).toBe(true)
    expect(bots(r)).toBe(4)
    expect(r.waiting).toEqual([])
  })

  test('between hands a bot gives up its chair straight away', () => {
    const r = lonePlusBots()
    // Ann's gone quiet and got sat out, so the bots stop and nothing's lined up
    while (r.members[0]!.outSince === null || r.turn || r.nextHand) tick(r, nextWake(r)!, new Set())
    join(r, B, 'Bob', r.members[0]!.outSince! + 1)
    expect(r.members.some((m) => m?.token === B)).toBe(true)
  })

  test('a private room never stands a bot up for a watcher', () => {
    const r = newRoom()
    join(r, A, 'Ann', 0)
    for (let i = 0; i < 5; i++) command(r, A, { t: 'addBot' }, 0)
    join(r, B, 'Bob', 0)
    expect(bots(r)).toBe(5)
    expect(r.members.some((m) => m?.leaving)).toBe(false)
  })

  test('has a shorter grace and a smaller daily cap', () => {
    const r = newRoom(true)
    join(r, A, 'Ann', 0)
    join(r, B, 'Bob', 0)
    let now = wake(r, all)
    const seat = r.table.toAct
    while (r.members[seat]!.outSince === null) now = wake(r, all)
    const out = r.members[seat]!.outSince!
    while (r.members[seat]) now = wake(r, all)
    expect(now - out).toBeLessThan(GRACE_MS)
    expect(now - out).toBeGreaterThanOrEqual(PUBLIC_GRACE_MS)
    charge(r, PUBLIC_DAILY_ROWS, now)
    expect(spent(r, now)).toBe(true)
  })

  test('someone who walks off a table that is not dealing still loses the seat after the grace', () => {
    const r = newRoom(true)
    join(r, A, 'Ann', 0)
    stalled(r, new Set(), 5)
    expect(r.members[0]!.outSince).toBe(5)
    expect(nextWake(r)).toBe(5 + PUBLIC_GRACE_MS)
    tick(r, nextWake(r)!, new Set())
    expect(r.members.filter(Boolean)).toHaveLength(0)
  })

  test('two who both walk off mid-hand both lose their seats, not just the one whose turn came up', () => {
    const r = newRoom(true)
    join(r, A, 'Ann', 0)
    join(r, B, 'Bob', 0)
    let guard = 0
    while (r.members.some(Boolean) && guard++ < 50) tick(r, nextWake(r)!, new Set())
    expect(r.members.filter(Boolean)).toHaveLength(0)
  })

  test('the bots go with the last person', () => {
    const r = lonePlusBots()
    command(r, A, { t: 'leave' }, 1)
    let guard = 0
    while (r.members.some(Boolean) && guard++ < 100) tick(r, nextWake(r)!, new Set([C])) // C is watching
    expect(r.members.filter(Boolean)).toHaveLength(0)
  })

  test('a table mid-game leaves the clock to deal with anyone who drops', () => {
    const r = lonePlusBots()
    stalled(r, new Set(), 1)
    expect(r.members[0]!.outSince).toBeNull()
  })

  test('emotes are for seated players and only from the list', () => {
    const r = lonePlusBots()
    expect(command(r, A, { t: 'emote', i: 0 }, 0)).toBe('emote')
    expect(() => command(r, C, { t: 'emote', i: 0 }, 0)).toThrow('not seated')
    expect(() => command(r, A, { t: 'emote', i: 99 }, 0)).toThrow('bad emote')
    expect(() => command(r, A, { t: 'emote', i: 1.5 }, 0)).toThrow('bad emote')
  })

  test('Quick Play goes where the people are, then to an empty table, never to a full or resting one', () => {
    const t = (id: string, humans: number, bots = 0, resting = false) => ({ id, humans, bots, resting })
    expect(pickTable([t('a', 0), t('b', 2, 3), t('c', 3, 3), t('d', 4, 0, true)])?.id).toBe('c')
    expect(pickTable([t('a', 0), t('b', 0)])?.id).toBe('a')
    expect(pickTable([t('a', 6), t('b', 5, 1)])?.id).toBe('b')
    expect(pickTable([t('a', 6), t('b', 2, 0, true)])).toBeNull()
  })
})

describe('rooms an address can open', () => {
  test('a few a day, then none until the next UTC day', () => {
    const day = Date.UTC(2026, 10, 3, 12)
    let log = undefined
    for (let i = 0; i < ROOMS_PER_DAY; i++) log = openRoom(log, day) ?? undefined
    expect(log?.rooms).toBe(ROOMS_PER_DAY)
    expect(openRoom(log, day)).toBeNull()
    expect(openRoom(log, Date.UTC(2026, 10, 4, 0, 0, 1))).toEqual({ day: '2026-11-04', rooms: 1 })
  })

  test('v4 counts per address, v6 per /64 however it was written', () => {
    expect(addressKey('203.0.113.7')).toBe('203.0.113.7')
    expect(addressKey('2001:db8:0:1:aaaa::1')).toBe('2001:db8:0:1::/64')
    expect(addressKey('2001:0DB8:0000:0001:bbbb:cccc:dddd:eeee')).toBe('2001:db8:0:1::/64')
    expect(addressKey('2001:db8::5')).toBe('2001:db8:0:0::/64')
    expect(addressKey('::1')).toBe('0:0:0:0::/64')
  })
})
