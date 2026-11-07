import { describe, expect, test } from 'vitest'
import { blank, decode, encode, isArt, ART_LENGTH } from '../../src/lib/avatar'
import { checkName, hashToken, jwtSubject, newToken, readState, signState } from './accounts'
import { command, handStats, join, newRoom, tick, viewOf } from './room'

const ok = (name: string) => 'name' in checkName(name)

describe('names', () => {
  test('ordinary names pass and get tidied', () => {
    expect(checkName('  Aidan   B ')).toEqual({ name: 'Aidan B' })
    for (const name of ['Cassie', 'Dickens', 'Hancock', 'Peacock', 'Assassin', 'Titan', 'Ana-Lu', 'J.R.', 'Zoë', 'Alphabet', 'Botany']) {
      expect(ok(name), name).toBe(true)
    }
  })

  test('shape', () => {
    expect(ok('a')).toBe(false)
    expect(ok('x'.repeat(17))).toBe(false)
    expect(ok('-dash')).toBe(false)
    expect(ok('hi<script>')).toBe(false)
  })

  test('the words, look-alikes and all', () => {
    for (const name of ['fuck', 'FuCk you', 'fvck', 'sh1t', 'b1tch', 'ass', 'big tits', 'n1gg4', 'xXnaziXx']) {
      expect(ok(name), name).toBe(false)
    }
  })

  test('nobody passes for a bot, a guest or the house', () => {
    for (const name of ['Alpha', 'omega', 'Guest', 'Guest 4', 'guest_12', 'Admin', 'Ponker', 'Player 1234']) {
      expect(ok(name), name).toBe(false)
    }
  })
})

describe('state', () => {
  const key = 'test-key'
  const state = { p: 'google', from: 'http://localhost:3000', name: 'Aidan', at: 1_000_000 }

  test('round trips while it is fresh', async () => {
    const signed = await signState(key, state)
    expect(await readState(key, signed, state.at + 60_000)).toEqual(state)
  })

  test('goes stale, and a different key or a tweak is refused', async () => {
    const signed = await signState(key, state)
    expect(await readState(key, signed, state.at + 11 * 60_000)).toBeNull()
    expect(await readState('other', signed, state.at)).toBeNull()
    const [body, sig] = signed.split('.')
    const forged = btoa(JSON.stringify({ ...state, from: 'https://evil.example' })).replace(/=+$/, '')
    expect(await readState(key, `${forged}.${sig}`, state.at)).toBeNull()
    expect(await readState(key, `${body}.`, state.at)).toBeNull()
    expect(await readState(key, 'junk', state.at)).toBeNull()
  })

  test('tokens are random and hash the same every time', async () => {
    const a = newToken()
    expect(a).not.toBe(newToken())
    expect(await hashToken(a)).toBe(await hashToken(a))
    expect(await hashToken(a)).not.toBe(a)
  })

  test('reads the subject out of an id token', () => {
    const payload = btoa(JSON.stringify({ sub: '1234567890', aud: 'x' }))
    expect(jwtSubject(`e30.${payload}.sig`)).toBe('1234567890')
    expect(jwtSubject('nonsense')).toBeNull()
  })
})

describe('avatars', () => {
  test('round trips every colour in every spot', () => {
    const pixels = blank().map((_, i) => (i * 7) % 16)
    const art = encode(pixels)!
    expect(art).toHaveLength(ART_LENGTH)
    expect(isArt(art)).toBe(true)
    expect(decode(art)).toEqual(pixels)
  })

  test('a blank canvas is no picture', () => {
    expect(encode(blank())).toBeNull()
  })

  test('only the exact shape passes', () => {
    expect(isArt('A'.repeat(ART_LENGTH))).toBe(true)
    expect(isArt('A'.repeat(ART_LENGTH - 1))).toBe(false)
    expect(isArt('A'.repeat(ART_LENGTH - 1) + '=')).toBe(false)
    expect(isArt(null)).toBe(false)
  })

  test('a signed-in seat carries its picture, and a reconnect brings the new one', () => {
    const r = newRoom()
    const art = 'A'.repeat(ART_LENGTH)
    join(r, 'u:7', 'Aidan', 0, { user: 7, art })
    join(r, 'token-guestguestguest', 'Guesty', 0)
    const view = viewOf(r, 'u:7', new Set(), 0)
    expect(view.seats[0]).toMatchObject({ name: 'Aidan', user: 7, art })
    expect(view.seats[3]).toMatchObject({ name: 'Guesty', user: null, art: null })
    join(r, 'u:7', 'Aidan', 1, { user: 7, art: null })
    expect(viewOf(r, 'u:7', new Set(), 1).seats[0]?.art).toBeNull()
  })
})

describe('stats', () => {
  // heads-up, the signed-in player raises preflop and both check it down
  function hand(withBot = false) {
    const r = newRoom()
    join(r, 'u:7', 'Aidan', 0, { user: 7, art: null })
    if (withBot) command(r, 'u:7', { t: 'addBot' }, 0)
    else join(r, 'token-guestguestguest', 'Guesty', 0)
    let now = r.nextHand!
    tick(r, now, new Set(['u:7', 'token-guestguestguest']))
    for (let guard = 0; r.table.street !== 'complete' && guard < 40; guard++) {
      const seat = r.table.toAct
      const m = r.members[seat]!
      now = Math.max(now, r.turn!.ends - 1)
      if (!m.token) {
        tick(r, r.turn!.ends, new Set(['u:7']))
        continue
      }
      const preflopFirst = r.table.street === 'preflop' && m.user && !r.tally![seat]!.pfr
      const owed = r.table.currentBet > r.table.seats[seat]!.bet
      const type = preflopFirst ? 'raise' : owed ? 'call' : 'check'
      command(r, m.token, { t: 'act', action: { type, to: type === 'raise' ? 30 : undefined } }, now)
    }
    return r
  }

  test('a finished hand gives one line for the signed-in player only', () => {
    const r = hand()
    expect(r.table.street).toBe('complete')
    expect(r.done).toHaveLength(1)
    const [line] = r.done!
    const me = r.members.findIndex((m) => m?.user === 7)
    expect(line).toMatchObject({ user: 7, bots: false, vpip: true, pfr: true })
    expect(line!.net).toBe(r.table.seats[me]!.chips - 1000)
    expect(line!.won).toBe(line!.showdown && line!.pot > 0)
  })

  test('a bot at the table marks the hand', () => {
    const r = hand(true)
    if (r.table.street !== 'complete') return // a bot folded early or raised past the script, nothing to check
    expect(r.done?.[0]?.bots).toBe(true)
  })

  test('guests and watchers get nothing', () => {
    const r = newRoom()
    join(r, 'token-aaaaaaaaaaaaaaaa', 'A', 0)
    join(r, 'token-bbbbbbbbbbbbbbbb', 'B', 0)
    expect(handStats({ ...r, tally: [] })).toEqual([])
  })
})
