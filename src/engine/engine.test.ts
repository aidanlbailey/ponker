import { describe, expect, it, test } from 'vitest'
import {
  applyAction,
  createTable,
  HIDDEN,
  legalActions,
  pots,
  shuffledDeck,
  viewFor,
  type Action,
  type TableState,
} from './engine'

const RANKS = '23456789TJQKA'
const SUITS = 'cdhs'
const cards = (text: string) =>
  text.split(' ').map((c) => (RANKS.indexOf(c[0]!) << 2) | SUITS.indexOf(c[1]!))

const ordered = Array.from({ length: 52 }, (_, i) => i)

function table(stacks: (number | null)[], blinds = [5, 10]) {
  let s = createTable(stacks.length, blinds[0]!, blinds[1]!)
  stacks.forEach((chips, seat) => {
    if (chips !== null) s = applyAction(s, { type: 'sit', seat, id: `p${seat}`, chips })
  })
  return s
}

const run = (s: TableState, ...actions: Action[]) => actions.reduce(applyAction, s)
const fold = (seat: number): Action => ({ type: 'fold', seat })
const check = (seat: number): Action => ({ type: 'check', seat })
const call = (seat: number): Action => ({ type: 'call', seat })
const raise = (seat: number, to: number): Action => ({ type: 'raise', seat, to })

// deals, then swaps in known hole cards and a known run of community cards
function rigged(stacks: (number | null)[], holes: (string | null)[], board: string, blinds?: number[]) {
  const s = applyAction(table(stacks, blinds), { type: 'deal', deck: ordered })
  // a hand can end on the deal itself, so hands are rigged by rebuilding the deck
  const order: number[] = []
  const players = s.seats.flatMap((seat, i) => (seat ? [i] : []))
  const start = players.findIndex((i) => i > s.button)
  for (let k = 0; k < players.length; k++) {
    order.push(players[(Math.max(start, 0) + k) % players.length]!)
  }
  const hole = holes.map((h) => (h ? cards(h) : []))
  const deck = [...order.map((i) => hole[i]![0]!), ...order.map((i) => hole[i]![1]!), ...cards(board)]
  deck.push(...ordered.filter((c) => !deck.includes(c)))
  return applyAction(table(stacks, blinds), { type: 'deal', deck })
}

const chips = (s: TableState) => s.seats.map((seat) => seat?.chips ?? null)

describe('dealing and positions', () => {
  it('deals one card at a time starting left of the button', () => {
    const s = applyAction(table([100, 100, 100]), { type: 'deal', deck: ordered })
    expect(s.button).toBe(0)
    expect(s.seats[1]!.cards).toEqual([0, 3])
    expect(s.seats[2]!.cards).toEqual([1, 4])
    expect(s.seats[0]!.cards).toEqual([2, 5])
    expect(s.deck).toHaveLength(46)
  })

  it('heads-up the button posts the small blind, acts first pre and last post', () => {
    let s = applyAction(table([100, 100]), { type: 'deal', deck: ordered })
    expect(s.seats[0]!.bet).toBe(5)
    expect(s.seats[1]!.bet).toBe(10)
    expect(s.toAct).toBe(0)
    s = run(s, call(0), check(1))
    expect(s.street).toBe('flop')
    expect(s.toAct).toBe(1)
  })

  it('three handed the button acts first preflop and the small blind first post', () => {
    let s = applyAction(table([100, 100, 100]), { type: 'deal', deck: ordered })
    expect(s.toAct).toBe(0)
    s = run(s, call(0), call(1), check(2))
    expect(s.toAct).toBe(1)
  })

  it('moves the button past empty, sitting out and busted seats', () => {
    let s = table([100, null, 100, 100, 100])
    s = run(s, { type: 'sitOut', seat: 2 })
    s = applyAction(s, { type: 'deal', deck: ordered })
    expect(s.button).toBe(0)
    expect(s.seats[2]!.cards).toEqual([])
    expect([s.seats[3]!.bet, s.seats[4]!.bet]).toEqual([5, 10])
    s = run(s, call(0), call(3), check(4), check(3), check(4), check(0))
    expect(s.street).toBe('turn')
    s = run(s, fold(3), fold(4))
    s = applyAction(s, { type: 'deal', deck: ordered })
    expect(s.button).toBe(3)
  })

  it('refuses a broken deck and a table of one', () => {
    const two = table([100, 100])
    expect(() => applyAction(table([100]), { type: 'deal', deck: ordered })).toThrow()
    expect(() => applyAction(two, { type: 'deal', deck: ordered.slice(1) })).toThrow()
    expect(() => applyAction(two, { type: 'deal', deck: [...ordered.slice(1), 1] })).toThrow()
    expect(() => applyAction(two, { type: 'deal', deck: ordered.map((c) => c + 1) })).toThrow()
  })
})

describe('betting', () => {
  it('gives the big blind its option', () => {
    let s = applyAction(table([100, 100, 100]), { type: 'deal', deck: ordered })
    s = run(s, call(0), call(1))
    expect(s.street).toBe('preflop')
    expect(s.toAct).toBe(2)
    expect(legalActions(s)).toMatchObject({ canCheck: true, canRaise: true, minTo: 20 })
    s = run(s, raise(2, 40))
    expect(s.toAct).toBe(0)
  })

  it('min raise follows the last full raise', () => {
    let s = applyAction(table([1000, 1000, 1000]), { type: 'deal', deck: ordered })
    expect(legalActions(s)!.minTo).toBe(20)
    s = run(s, raise(0, 50))
    expect(legalActions(s)!.minTo).toBe(90)
    expect(() => applyAction(s, raise(1, 89))).toThrow()
    s = run(s, raise(1, 90))
    expect(legalActions(s)!.minTo).toBe(130)
  })

  it('opening bets start at a big blind each street', () => {
    let s = applyAction(table([100, 100]), { type: 'deal', deck: ordered })
    s = run(s, call(0), check(1))
    expect(legalActions(s)).toMatchObject({ minTo: 10, canCheck: true })
    expect(() => applyAction(s, raise(1, 9))).toThrow()
  })

  it('short all-ins: no reopen until they add up to a full raise', () => {
    // button is seat 0. 1 small blind, 2 big blind, 3 is first to act.
    let s = table([1000, 1000, 1000, 1000, 145, 170])
    s = run(s, { type: 'deal', deck: ordered })
    expect(s.toAct).toBe(3)
    s = run(s, raise(3, 100), raise(4, 145)) // short by 55
    expect(s.minRaise).toBe(90)
    expect(legalActions(s)).toMatchObject({ seat: 5, canRaise: true, minTo: 170, maxTo: 170 })
    s = run(s, raise(5, 170), call(0), fold(1), fold(2))
    // 3 opened to 100 and faces 70 more, short of a full 90 raise
    expect(legalActions(s)).toMatchObject({ seat: 3, canRaise: false, toCall: 70 })

    let t = table([1000, 1000, 1000, 1000, 145, 195])
    t = run(t, { type: 'deal', deck: ordered }, raise(3, 100), raise(4, 145), raise(5, 195), call(0), fold(1), fold(2))
    // two short raises add to 95, which is a full raise, so 3 is back in
    expect(legalActions(t)).toMatchObject({ seat: 3, canRaise: true, minTo: 285 })
  })

  it('no raising when nobody is left to call it', () => {
    let s = table([1000, 50])
    s = run(s, { type: 'deal', deck: ordered }, raise(0, 200))
    s = run(s, { type: 'call', seat: 1 })
    expect(s.street).toBe('complete')

    let t = table([500, 50, 1000])
    t = run(t, { type: 'deal', deck: ordered }, fold(0), raise(1, 50))
    expect(legalActions(t)).toMatchObject({ seat: 2, canRaise: false, toCall: 40 })
  })

  it('caps a call at the stack', () => {
    let s = table([1000, 60, 1000])
    s = run(s, { type: 'deal', deck: ordered }, raise(0, 200))
    expect(legalActions(s)).toMatchObject({ seat: 1, toCall: 55 })
  })

  it('rejects junk from the outside', () => {
    const s = applyAction(table([100, 100]), { type: 'deal', deck: ordered })
    for (const to of [NaN, Infinity, 20.5, -20, 0, 101, 5e20]) {
      expect(() => applyAction(s, raise(0, to))).toThrow()
    }
    expect(() => applyAction(s, call(1))).toThrow() // not their turn
    expect(() => applyAction(s, call(7))).toThrow()
    expect(() => applyAction(s, check(0))).toThrow() // facing a bet
    expect(() => applyAction(s, { type: 'show', seat: 0 })).toThrow() // hand still live
    expect(() => applyAction(s, { type: 'deal', deck: ordered })).toThrow()
    expect(() => applyAction(s, { type: 'leave', seat: 0 })).toThrow()
    expect(() => applyAction(s, { type: 'topUp', seat: 0, chips: 100 })).toThrow()
    expect(() => applyAction(table([100]), { type: 'sit', seat: 9, id: 'x', chips: 100 })).toThrow()
    expect(() => applyAction(table([100, null]), { type: 'sit', seat: 1, id: 'x', chips: -1 })).toThrow()
    expect(() => applyAction(table([100, null]), { type: 'sit', seat: 0, id: 'x', chips: 1 })).toThrow()
  })

  it('leaves the old state alone', () => {
    const s = applyAction(table([100, 100]), { type: 'deal', deck: ordered })
    const before = JSON.stringify(s)
    applyAction(s, raise(0, 50))
    expect(JSON.stringify(s)).toBe(before)
  })

  it('timeout checks when free, folds otherwise, then sits the seat out', () => {
    let s = applyAction(table([100, 100, 100]), { type: 'deal', deck: ordered })
    s = run(s, { type: 'timeout' })
    expect(s.seats[0]).toMatchObject({ folded: true, sittingOut: true })
    s = run(s, call(1), { type: 'timeout' })
    expect(s.seats[2]).toMatchObject({ folded: false, sittingOut: true })
    expect(s.street).toBe('flop')
    expect(() => applyAction(table([100, 100]), { type: 'timeout' })).toThrow()
  })
})

describe('short blinds', () => {
  it('a short big blind still costs others a full big blind', () => {
    const s = applyAction(table([100, 100, 3]), { type: 'deal', deck: ordered })
    expect(s.seats[2]!.bet).toBe(3)
    expect(legalActions(s)).toMatchObject({ seat: 0, toCall: 10, minTo: 20 })
  })

  it('heads-up, no decision when the blind already covers a short big blind', () => {
    const s = rigged([100, 3], ['Ac Ad', 'Kc Kd'], '2c 7d 9h Js 3s')
    expect(s.street).toBe('complete')
    expect(s.board).toHaveLength(5)
    expect(chips(s)).toEqual([103, 0])
  })

  it('heads-up, only the real amount is owed against a short big blind', () => {
    const s = applyAction(table([100, 7]), { type: 'deal', deck: ordered })
    expect(legalActions(s)).toMatchObject({ seat: 0, toCall: 2, canRaise: false })
  })

  it('three handed, the small blind needs no decision against a smaller all-in', () => {
    const s = run(applyAction(table([100, 100, 3]), { type: 'deal', deck: ordered }), fold(0))
    expect(s.street).toBe('complete')
    expect(s.board).toHaveLength(5)
  })

  it('all in on the blinds deals straight to the river', () => {
    const s = rigged([5, 8], ['Ac Ad', 'Kc Kd'], '2c 7d 9h Js 3s')
    expect(s.street).toBe('complete')
    expect(chips(s)).toEqual([10, 3])
  })
})

describe('showdown and pots', () => {
  const allIn = (s: TableState, ...seats: number[]) =>
    seats.reduce((t, seat) => {
      const legal = legalActions(t)!
      return applyAction(t, legal.canRaise ? raise(seat, legal.maxTo) : call(seat))
    }, s)

  it('returns an uncalled bet without showing anything', () => {
    let s = applyAction(table([100, 100]), { type: 'deal', deck: ordered })
    s = run(s, raise(0, 80), fold(1))
    expect(chips(s)).toEqual([110, 90])
    expect(s.result).toEqual([{ amount: 20, eligible: [0], winners: [{ seat: 0, amount: 20, hand: null }] }])
    expect(s.board).toEqual([])
    expect(s.seats[0]!.shown).toBe(false)
  })

  it('returns the part of a shove nobody could match', () => {
    const s = allIn(rigged([1000, 100], ['2c 3d', 'Ac Ad'], '7d 8h 9s Jc Kd'), 0, 1)
    expect(s.result).toHaveLength(1)
    expect(s.result![0]!.amount).toBe(200)
    expect(chips(s)).toEqual([900, 200])
  })

  it('builds a main pot and a side pot', () => {
    // short stack has the best hand, so seat 0 keeps only the side pot
    const s = allIn(
      rigged([1000, 100, 1000], ['Kc Kd', 'Ac Ad', 'Qc Qd'], '2h 7d 9h Js 3s'),
      0,
      1,
      2,
    )
    expect(s.result!.map((p) => [p.amount, p.eligible, p.winners.map((w) => w.seat)])).toEqual([
      [300, [0, 1, 2], [1]],
      [1800, [0, 2], [0]],
    ])
    expect(chips(s)).toEqual([1800, 300, 0])
  })

  it('handles four different stacks', () => {
    const s = allIn(
      rigged(
        [50, 100, 200, 400],
        ['Ac Ad', 'Kc Kd', 'Qc Qd', 'Jc Jd'],
        '2h 7d 9h 3s 4s',
      ),
      3,
      0,
      1,
      2,
    )
    expect(s.result!.map((p) => p.amount)).toEqual([200, 150, 200])
    expect(chips(s)).toEqual([200, 150, 200, 200])
  })

  it('folded money stays in the pots it reached', () => {
    let s = rigged([1000, 300, 1000], ['Ac Ad', 'Kc Kd', '2c 7d'], 'Jh 8s 5d 4c 3h')
    s = run(s, raise(0, 200), raise(1, 300), call(2), call(0)) // seat 1 is all in
    s = run(s, raise(2, 100), call(0)) // flop
    s = run(s, check(2), raise(0, 400), fold(2)) // turn, 400 comes back uncalled
    expect(s.result!.map((p) => [p.amount, p.eligible])).toEqual([
      [900, [0, 1]],
      [200, [0]],
    ])
    expect(chips(s)).toEqual([1700, 0, 600])
  })

  it('an uncontested side pot needs no showing, a lost main pot stays mucked', () => {
    let s = rigged([1000, 100, 1000], ['Kc Kd', 'Ac Ad', '2c 7d'], '2h 8d 9h Js 3s')
    s = run(s, raise(0, 200), call(1), call(2))
    expect(s.street).toBe('flop')
    expect(s.seats[1]!.chips).toBe(0)
    s = run(s, raise(2, 400), fold(0))
    // seat 2 wins the side pot alone but loses the main to seat 1
    expect(s.result!.map((p) => p.winners)).toEqual([
      [{ seat: 1, amount: 300, hand: 'Pair' }],
      [{ seat: 2, amount: 200, hand: null }],
    ])
  })

  it('splits a tied pot', () => {
    const s = allIn(rigged([100, 100], ['2c 3d', '2d 3c'], 'Ah Kh Qh Jh Th'), 0, 1)
    expect(s.result![0]!.winners.map((w) => w.amount)).toEqual([100, 100])
    expect(s.result![0]!.winners[0]!.hand).toBe('Royal flush')
    expect(chips(s)).toEqual([100, 100])
  })

  it('odd chips go left of the button first', () => {
    // dead money from the folded seat makes the total odd
    let t = rigged([500, 500, 500, 500], ['2c 3d', '2d 3c', '4s 5s', '4c 5d'], 'Ah Kh Qh Jh Td', [1, 2])
    t = run(t, call(3), call(0), raise(1, 50), call(2), fold(3), call(0))
    t = run(t, check(1), check(2), check(0), check(1), check(2), check(0), check(1), check(2), check(0))
    expect(t.result![0]!.amount).toBe(152)
    expect(t.result![0]!.winners.map((w) => [w.seat, w.amount])).toEqual([
      [1, 51],
      [2, 51],
      [0, 50],
    ])
  })

  it('pots reads a running hand from a view too', () => {
    let s = applyAction(table([100, 100]), { type: 'deal', deck: ordered })
    s = run(s, call(0), check(1))
    expect(pots(viewFor(s, null))).toEqual([{ amount: 20, eligible: [0, 1] }])
  })
})

describe('what players can see', () => {
  const finished = () => {
    let s = rigged([100, 100, 100], ['Ac Ad', 'Kc Kd', 'Qc Qd'], '2h 7d 9h Js 3s')
    s = run(s, call(0), call(1), check(2))
    for (let i = 0; i < 3; i++) s = run(s, check(1), check(2), check(0))
    return s
  }

  it('shows your own cards and nobody elses', () => {
    const s = applyAction(table([100, 100, 100]), { type: 'deal', deck: ordered })
    const view = viewFor(s, 1)
    expect(view.deck).toEqual([])
    expect(view.seats[1]!.cards).toEqual(s.seats[1]!.cards)
    expect(view.seats[0]!.cards).toEqual([HIDDEN, HIDDEN])
    expect(view.seats[2]!.cards).toEqual([HIDDEN, HIDDEN])
    expect(viewFor(s, null).seats.map((seat) => seat!.cards)).toEqual(Array(3).fill([HIDDEN, HIDDEN]))
  })

  it('never leaks hidden cards anywhere in the view', () => {
    const s = applyAction(table([100, 100]), { type: 'deal', deck: ordered })
    const { seats, deck, ...rest } = viewFor(s, 0)
    expect(deck).toEqual([])
    expect(JSON.stringify(rest)).not.toContain('cards')
    expect(seats[1]!.cards).toEqual([HIDDEN, HIDDEN])
  })

  it('shows the winner at showdown and lets losers muck', () => {
    const s = finished()
    const view = viewFor(s, 1)
    expect(view.seats[0]!.cards).toEqual(cards('Ac Ad'))
    expect(viewFor(s, 0).seats[1]!.cards).toEqual([HIDDEN, HIDDEN])
    expect(viewFor(s, 0).seats[2]!.cards).toEqual([HIDDEN, HIDDEN])
  })

  it('lets a loser show if they want to', () => {
    const s = applyAction(finished(), { type: 'show', seat: 2 })
    expect(viewFor(s, 0).seats[2]!.cards).toEqual(cards('Qc Qd'))
    expect(viewFor(s, 0).seats[1]!.cards).toEqual([HIDDEN, HIDDEN])
  })

  it('lets a winner show after everyone folds', () => {
    let s = rigged([100, 100], ['2c 7d', 'Ac Ad'], '2h 7h 9h Js 3s')
    s = run(s, raise(0, 50), fold(1))
    expect(viewFor(s, 1).seats[0]!.cards).toEqual([HIDDEN, HIDDEN])
    s = applyAction(s, { type: 'show', seat: 0 })
    expect(viewFor(s, 1).seats[0]!.cards).toEqual(cards('2c 7d'))
    expect(() => applyAction(s, { type: 'show', seat: 1 })).toThrow() // folded
  })

  it('all-in hands turn face up before the board runs out', () => {
    let s = rigged([100, 100, 100], ['Ac Ad', 'Kc Kd', 'Qc Qd'], '2h 7d 9h Js 3s')
    s = run(s, raise(0, 100), call(1), fold(2))
    expect(viewFor(s, 2).seats[0]!.cards).toEqual(cards('Ac Ad'))
    expect(viewFor(s, 2).seats[1]!.cards).toEqual(cards('Kc Kd'))
    // the folder stays hidden
    expect(viewFor(s, 0).seats[2]!.cards).toEqual([HIDDEN, HIDDEN])
  })

  it('an all-in loser is shown even when others played on to the river', () => {
    let s = rigged([50, 200, 200], ['Kc Kd', 'Ac Ad', 'Qc Qd'], '2h 7d 9h Js 3s')
    s = run(s, raise(0, 50), call(1), call(2))
    while (s.street !== 'complete') s = applyAction(s, check(legalActions(s)!.seat))
    expect(viewFor(s, 2).seats[0]!.cards).toEqual(cards('Kc Kd'))
  })

  it('legal actions work from the acting seat view', () => {
    const s = applyAction(table([100, 100]), { type: 'deal', deck: ordered })
    expect(legalActions(viewFor(s, 0))).toEqual(legalActions(s))
  })
})

describe('table management', () => {
  it('seats join mid-hand and wait for the next deal', () => {
    let s = applyAction(table([100, 100, null]), { type: 'deal', deck: ordered })
    s = run(s, { type: 'sit', seat: 2, id: 'late', chips: 100 }, fold(0))
    expect(s.street).toBe('complete')
    expect(s.seats[2]!.cards).toEqual([])
    s = run(s, { type: 'topUp', seat: 0, chips: 5 }, { type: 'leave', seat: 1 })
    s = applyAction(s, { type: 'deal', deck: ordered })
    expect(s.button).toBe(2)
    expect(s.seats[1]).toBeNull()
    expect(s.seats[0]!.chips + s.seats[0]!.bet).toBe(100)
  })

  it('a saved table carries on after a JSON round trip', () => {
    let s = applyAction(table([100, 100]), { type: 'deal', deck: ordered })
    s = JSON.parse(JSON.stringify(s)) as TableState
    s = run(s, call(0), check(1))
    expect(s.street).toBe('flop')
    expect(s.board).toHaveLength(3)
  })

  it('shuffledDeck is a full deck in a fresh order', () => {
    const deck = shuffledDeck()
    expect([...deck].sort((a, b) => a - b)).toEqual(ordered)
    expect(shuffledDeck()).not.toEqual(deck)
  })
})

// Random hands with random stacks. Failures are reproducible from the seed.
test('fuzz: chips are conserved and nobody wins more than they could', () => {
  let seed = 2026
  const rand = (n: number) => (seed = (seed * 1664525 + 1013904223) % 2 ** 32) % n

  for (let game = 0; game < 400; game++) {
    const n = 2 + rand(8)
    const stacks = Array.from({ length: n }, () => (rand(3) ? 1 + rand(400) : 1 + rand(30)))
    const total = stacks.reduce((a, b) => a + b, 0)
    let s = table(stacks)

    for (let hand = 0; hand < 25; hand++) {
      if (s.seats.filter((seat) => seat && seat.chips > 0).length < 2) break
      const deck = [...ordered]
      for (let i = 51; i > 0; i--) {
        const j = rand(i + 1)
        ;[deck[i], deck[j]] = [deck[j]!, deck[i]!]
      }
      const before = s.seats.map((seat) => seat!.chips)
      s = applyAction(s, { type: 'deal', deck })

      let steps = 0
      for (let legal = legalActions(s); legal; legal = legalActions(s)) {
        expect(++steps).toBeLessThan(500)
        const { seat, toCall, canCheck, canRaise, minTo, maxTo } = legal
        const roll = rand(10)
        if (canRaise && roll < 3) {
          const to = roll === 0 ? maxTo : minTo + rand(maxTo - minTo + 1)
          s = applyAction(s, raise(seat, to))
        } else if (canCheck) s = applyAction(s, check(seat))
        else if (roll < 8 && toCall) s = applyAction(s, call(seat))
        else s = applyAction(s, fold(seat))

        for (const p of s.seats) expect(p!.chips).toBeGreaterThanOrEqual(0)
        if (s.street !== 'complete') {
          const inPlay = s.seats.reduce((sum, p) => sum + p!.chips + p!.committed, 0)
          expect(inPlay).toBe(total)
        }
      }

      expect(s.street).toBe('complete')
      expect(s.seats.reduce((sum, p) => sum + p!.chips, 0)).toBe(total)
      expect(s.seats.reduce((sum, p) => sum + p!.bet, 0)).toBe(0)

      const paid = s.result!.reduce((sum, p) => sum + p.amount, 0)
      const put = s.seats.reduce((sum, p) => sum + p!.committed, 0)
      expect(paid).toBe(put)

      const committed = s.seats.map((p) => p!.committed)
      s.result!.forEach((pot) => {
        expect(pot.winners.reduce((sum, w) => sum + w.amount, 0)).toBe(pot.amount)
        for (const w of pot.winners) {
          expect(pot.eligible).toContain(w.seat)
          expect(s.seats[w.seat]!.folded).toBe(false)
        }
      })
      // a live seat can only win up to its own commitment from each other seat
      s.seats.forEach((p, i) => {
        const cap = committed.reduce((sum, c) => sum + Math.min(c, committed[i]!), 0)
        expect(p!.chips - before[i]! + committed[i]!).toBeLessThanOrEqual(cap)
      })

      // losers stay hidden unless every hand went face up
      const allShown = s.seats.filter((p) => p!.cards.length && !p!.folded).every((p) => p!.shown)
      if (!allShown) {
        const hidden = s.seats.findIndex((p) => p!.cards.length && !p!.shown)
        const viewer = hidden === 0 ? 1 : 0
        expect(viewFor(s, viewer).seats[hidden]!.cards).toEqual([HIDDEN, HIDDEN])
      }
    }
  }
})
