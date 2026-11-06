import { describe, expect, it } from 'vitest'
import {
  applyAction,
  HIDDEN,
  legalActions,
  shuffledDeck,
  viewFor,
  type PlayerAction,
  type TableState,
} from '../engine/engine'
import { actionText, breakdown, chipColors, isFlick, potSize, raiseTo } from './betting'
import { restack } from './BetControls'
import { MAX_STACK, payOrder, plan, potLayout, ready, settle, splitKept, take, total } from './piles'
import { decide, equity } from './bot'
import { advice, describeHand, priceToCall } from './helpers'
import { progress, route } from './route'
import {
  botAction,
  busted,
  BUY_IN,
  chipMoves,
  endOfHand,
  HERO,
  isSolo,
  newSolo,
  payouts,
  pileAt,
  startHand,
  winnings,
  type Move,
  type Spot,
} from './solo'

// heads-up tables in these tests, the bot sits on your left
const BOT = 1
const RANKS = '23456789TJQKA'
const SUITS = 'cdhs'
const cards = (text: string) => text.split(' ').map((c) => (RANKS.indexOf(c[0]!) << 2) | SUITS.indexOf(c[1]!))

// a small seeded generator so the bot's dice are the same on every run
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

const ordered = Array.from({ length: 52 }, (_, i) => i)
// button moves to the bot, so it acts first preflop and the hero first after
const dealt = () => startHand({ ...newSolo().table, button: HERO }, ordered)

// hands the bot a spot with the cards and board wanted, leaving the rest of the view real
function spot(s: TableState, hole: string, board = ''): TableState {
  const view = viewFor(s, BOT)
  view.seats[BOT]!.cards = cards(hole)
  view.board = board ? cards(board) : []
  return view
}

describe('equity', () => {
  it('is near the known preflop numbers', () => {
    expect(equity(cards('As Ah'), [], 1, 20000, seeded(1))).toBeCloseTo(0.85, 1)
    expect(equity(cards('7c 2d'), [], 1, 20000, seeded(2))).toBeCloseTo(0.35, 1)
  })

  it('knows a hand that cannot lose', () => {
    expect(equity(cards('As Ks'), cards('Qs Js Ts 2d 3c'), 1, 500, seeded(3))).toBe(1)
  })
})

describe('the bot', () => {
  it('folds rubbish to a shove and calls with aces', () => {
    const called = applyAction(dealt(), { type: 'call', seat: BOT })
    const facing = applyAction(called, { type: 'raise', seat: HERO, to: BUY_IN })
    expect(decide(spot(facing, '7c 2d'), seeded(4), 2000).type).toBe('fold')
    expect(decide(spot(facing, 'As Ah'), seeded(5), 2000).type).toBe('call')
  })

  it('never folds when checking is free', () => {
    const s = applyAction(dealt(), { type: 'call', seat: BOT })
    const flop = applyAction(s, { type: 'check', seat: HERO })
    for (let seed = 0; seed < 40; seed++) {
      const action = decide(spot({ ...flop, toAct: BOT }, '7c 2d', 'Ks Qs 9h'), seeded(seed), 100)
      expect(action.type).not.toBe('fold')
    }
  })

  it('only ever sends legal actions, and chips are never made or lost', () => {
    const random = seeded(99)
    let table = newSolo().table
    for (let hand = 0; hand < 300; hand++) {
      const before = table.seats.reduce((sum, seat) => sum + seat!.chips, 0)
      table = startHand(table, shuffledDeck())
      // a blind can put someone all in and finish the hand inside the deal, and then the
      // pot's already been paid out, so counting committed too would count it twice
      const done = table.street === 'complete'
      const rebought = table.seats.reduce((sum, seat) => sum + seat!.chips + (done ? 0 : seat!.committed), 0)
      expect(rebought).toBeGreaterThanOrEqual(before)
      for (let guard = 0; table.toAct >= 0; guard++) {
        expect(guard).toBeLessThan(40)
        const answer = decide(viewFor(table, table.toAct), random, 30)
        table = applyAction(table, answer) // throws if illegal
      }
      expect(table.seats.reduce((sum, seat) => sum + seat!.chips, 0)).toBe(rebought)
    }
  })

  it('never sees the hero cards', () => {
    expect(viewFor(dealt(), BOT).seats[HERO]!.cards).toEqual([HIDDEN, HIDDEN])
  })
})

describe('sizing', () => {
  it('calls first, then raises a share of the pot', () => {
    const s = dealt() // bot on the button, 5 in against 10
    const legal = legalActions(s)!
    expect(potSize(s)).toBe(15)
    expect(raiseTo(s, legal, 1)).toBe(30) // call to 10, pot is then 20, raise by 20
  })

  it('stays inside the legal range', () => {
    const s = dealt()
    const legal = legalActions(s)!
    expect(raiseTo(s, legal, 0)).toBe(legal.minTo)
    expect(raiseTo(s, legal, 1000)).toBe(legal.maxTo)
  })

  it('stacks big chips first and caps the height', () => {
    expect(chipColors(0)).toEqual([])
    expect(chipColors(15)).toHaveLength(2)
    expect(chipColors(1000)).toHaveLength(1)
    expect(chipColors(99).length).toBeLessThanOrEqual(8)
  })

  it('words actions the way a player would', () => {
    const s = dealt()
    expect(actionText(s, { type: 'call', seat: BOT })).toBe('Call 5')
    expect(actionText(s, { type: 'raise', seat: BOT, to: 30 })).toBe('Raise to 30')
    expect(actionText(s, { type: 'raise', seat: BOT, to: BUY_IN })).toBe('All in')
    expect(actionText(s, { type: 'timeout' })).toBe('Fold')
    const flop = [
      { type: 'call', seat: BOT },
      { type: 'check', seat: HERO },
    ].reduce((t, a) => applyAction(t, a as PlayerAction), s)
    expect(actionText(flop, { type: 'raise', seat: flop.toAct, to: 20 })).toBe('Bet 20')
  })
})

describe('flicking', () => {
  const up = { x: 0, y: -300 }

  it('counts a quick flick toward the bet spot', () => {
    expect(isFlick({ x: 0, y: -40 }, { x: 0, y: -900 }, up)).toBe(true)
  })

  it('ignores taps, slow nudges and flicks the wrong way', () => {
    expect(isFlick({ x: 0, y: -5 }, { x: 0, y: -900 }, up)).toBe(false)
    expect(isFlick({ x: 0, y: -40 }, { x: 0, y: -50 }, up)).toBe(false)
    expect(isFlick({ x: 0, y: 40 }, { x: 0, y: 900 }, up)).toBe(false)
  })

  it('counts a slow push past the line', () => {
    expect(isFlick({ x: 0, y: -130 }, { x: 0, y: 0 }, up)).toBe(true)
  })

  it('follows the table when it sits to the side', () => {
    const left = { x: -300, y: 0 }
    expect(isFlick({ x: -40, y: 0 }, { x: -900, y: 0 }, left)).toBe(true)
    expect(isFlick({ x: 0, y: -40 }, { x: 0, y: -900 }, left)).toBe(false)
  })
})

describe('table loop', () => {
  it('sits both players with a full buy in', () => {
    const { table } = newSolo()
    expect(table.seats.map((seat) => seat!.chips)).toEqual([BUY_IN, BUY_IN])
  })

  it('refills a bust seat before dealing, and leaves a short stack alone', () => {
    let { table } = newSolo()
    table = { ...table, seats: [{ ...table.seats[0]!, chips: 0 }, { ...table.seats[1]!, chips: 40 }] }
    const next = startHand(table, ordered)
    expect(next.seats[0]!.chips + next.seats[0]!.committed).toBe(BUY_IN)
    expect(next.seats[1]!.chips + next.seats[1]!.committed).toBe(40)
  })

  it('holds a top up until the hand ends', () => {
    const solo = newSolo()
    let table = applyAction(solo.table, { type: 'topUp', seat: HERO, chips: 1 })
    table = { ...table, seats: [{ ...table.seats[0]!, chips: 300 }, table.seats[1]!] }
    table = startHand(table, ordered)
    expect(() => endOfHand({ ...solo, table, topUp: true })).toThrow('hand in progress')

    table = applyAction(table, { type: 'fold', seat: table.toAct })
    const after = endOfHand({ ...solo, table, topUp: true })
    expect(after.table.seats[HERO]!.chips).toBe(BUY_IN)
    expect(after.topUp).toBe(false)
  })

  it('does not take chips off a player who is over the buy in', () => {
    const solo = newSolo()
    const table = { ...solo.table, seats: [{ ...solo.table.seats[0]!, chips: 1500 }, solo.table.seats[1]!] }
    expect(endOfHand({ ...solo, table, topUp: true }).table.seats[HERO]!.chips).toBe(1500)
  })

  it('falls back to check or fold when the bot answer is no good', () => {
    const s = dealt()
    expect(botAction(s, null)).toEqual({ type: 'fold', seat: BOT })
    expect(botAction(s, { type: 'check', seat: BOT })).toEqual({ type: 'fold', seat: BOT })
    const facing = applyAction(s, { type: 'call', seat: BOT })
    const option = applyAction(facing, { type: 'check', seat: HERO })
    expect(botAction({ ...option, toAct: BOT }, null)).toEqual({ type: 'check', seat: BOT })
  })

  it('keeps good bot answers', () => {
    const answer = { type: 'call', seat: BOT } as const
    expect(botAction(dealt(), answer)).toBe(answer)
  })

  it('throws out saved games it cannot read', () => {
    expect(isSolo(newSolo())).toBe(true)
    expect(isSolo(JSON.parse(JSON.stringify(newSolo())))).toBe(true)
    expect(isSolo(null)).toBe(false)
    expect(isSolo({ table: { seats: [null, null] } })).toBe(false)
  })
})

describe('chip moves', () => {
  it('posts blinds from the seats', () => {
    const { table } = newSolo()
    const moves = chipMoves(table, startHand(table, ordered), true)
    expect(moves.now).toEqual(
      expect.arrayContaining([
        { from: 'seat-0', to: 'bet-0', amount: 5 },
        { from: 'seat-1', to: 'bet-1', amount: 10 },
      ]),
    )
    expect(moves.now).toHaveLength(2)
    expect(moves.sweep).toEqual([])
  })

  it('still moves the chips when a blind all in finishes the hand on the deal', () => {
    let finished = 0
    for (const button of [HERO, BOT]) {
      // straight off a finished hand, whose committed chips used to get mixed into the new one
      const played = dealt()
      const table = { ...applyAction(played, { type: 'fold', seat: played.toAct }), button }
      table.seats = table.seats.map((seat, i) => (i === HERO ? { ...seat!, chips: 3 } : seat))
      const next = startHand(table, ordered)
      if (next.street === 'complete') finished++
      const { now, sweep, kept } = chipMoves(table, next, true)
      const moves = [...now, ...sweep, ...kept]
      for (const spot of ['pot', 'bet-0', 'bet-1'] as const) {
        const into = moves.filter((move) => move.to === spot).reduce((sum, move) => sum + move.amount, 0)
        const out = moves.filter((move) => move.from === spot).reduce((sum, move) => sum + move.amount, 0)
        expect(into - out).toBe(pileAt(next, spot))
      }
    }
    expect(finished).toBeGreaterThan(0)
  })

  it('puts a bet in front of the seat', () => {
    const s = dealt()
    expect(chipMoves(s, applyAction(s, { type: 'raise', seat: BOT, to: 30 }))).toEqual({
      now: [{ from: 'seat-1', to: 'bet-1', amount: 25 }],
      sweep: [],
      kept: [],
    })
  })

  it("throws the closing call onto its bet, then sweeps every bet in from the dealer's left", () => {
    const s = applyAction(dealt(), { type: 'call', seat: BOT })
    const raised = applyAction(s, { type: 'raise', seat: HERO, to: 30 })
    const next = applyAction(raised, { type: 'call', seat: BOT })
    const { now, sweep } = chipMoves(raised, next)
    expect(now).toEqual([{ from: 'seat-1', to: 'bet-1', amount: 20 }])
    const left = (next.button + 1) % 2
    expect(sweep).toEqual([
      { from: `bet-${left}`, to: 'pot', amount: 30 },
      { from: `bet-${1 - left}`, to: 'pot', amount: 30 },
    ])
  })

  it("keeps an uncalled bet for its owner's payout pile instead of the pot", () => {
    const s = applyAction(dealt(), { type: 'raise', seat: BOT, to: 100 })
    const { now, sweep, kept } = chipMoves(s, applyAction(s, { type: 'fold', seat: HERO }))
    expect(now).toEqual([])
    expect(kept).toEqual([{ from: 'bet-1', to: 'win-1', amount: 90 }])
    expect(sweep).toEqual(
      expect.arrayContaining([
        { from: 'bet-0', to: 'pot', amount: 10 },
        { from: 'bet-1', to: 'pot', amount: 10 },
      ]),
    )
  })

  it('keeps a whole bet for its owner when it was never called', () => {
    const flop = [
      { type: 'call', seat: BOT },
      { type: 'check', seat: HERO },
    ].reduce((t, a) => applyAction(t, a as PlayerAction), dealt())
    const bet = applyAction(flop, { type: 'raise', seat: HERO, to: 40 })
    expect(chipMoves(bet, applyAction(bet, { type: 'fold', seat: BOT }))).toEqual({
      now: [],
      sweep: [],
      kept: [{ from: 'bet-0', to: 'win-0', amount: 40 }],
    })
  })

  it('knows the pile waiting at each spot', () => {
    const s = applyAction(dealt(), { type: 'call', seat: BOT })
    const flop = applyAction(s, { type: 'check', seat: HERO })
    const bet = applyAction(flop, { type: 'raise', seat: HERO, to: 20 })
    expect(pileAt(bet, 'pot')).toBe(20)
    expect(pileAt(bet, 'bet-0')).toBe(20)
    expect(pileAt(bet, 'bet-1')).toBe(0)
    expect(pileAt(bet, 'seat-0')).toBe(0)
  })

  it('pays the pot from the final state, however fast the hand ended', () => {
    const s = applyAction(applyAction(dealt(), { type: 'raise', seat: BOT, to: BUY_IN }), { type: 'call', seat: HERO })
    expect(s.street).toBe('complete')
    expect(s.board).toHaveLength(5)
    const paid = payouts(s).reduce((sum, move) => sum + move.amount, 0)
    expect(paid).toBe(BUY_IN * 2)
    expect(winnings(s, HERO) + winnings(s, BOT)).toBe(BUY_IN * 2)
  })
})

describe('the real chips', () => {
  it('breaks an amount into chips, biggest first', () => {
    expect(breakdown(1270)).toEqual([1000, 100, 100, 25, 25, 10, 10])
    expect(total(breakdown(987))).toBe(987)
  })

  it('takes chips off the top of a pile when they make the amount', () => {
    expect(take([100, 25, 10], 35)).toEqual({
      taken: [
        { value: 10, index: 2, was: 10 },
        { value: 25, index: 1, was: 25 },
      ],
      left: [100],
    })
  })

  it('finds the real chips that make the amount before it ever makes change', () => {
    // top down grabs the 5, 10 and 5, then has 15 to go and only the 25 left
    const { taken, left } = take([5, 25, 10, 5], 35)
    expect(taken.map((chip) => chip.value).sort((a, b) => a - b)).toEqual([10, 25])
    expect(taken.every((chip) => chip.value === chip.was)).toBe(true)
    expect(left).toEqual([5, 5])
  })

  it('puts an uncalled bet in the same banded pile as the pot it won', () => {
    const { trips } = plan(
      { pot: [5, 25], 'bet-2': [10, 100] },
      [
        { from: 'bet-2', to: 'win-2', amount: 110 },
        { from: 'pot', to: 'win-2', amount: 30 },
      ],
      {},
    )
    expect(trips.map((trip) => [trip.value, trip.toAt!.level, trip.order])).toEqual([
      [100, 0, 0],
      [25, 1, 1],
      [10, 2, 2],
      [5, 3, 3],
    ])
  })

  it('takes straight off the top when the top chips make it, so the rest stay put', () => {
    // 25 + 10 would also make 35, but that pulls the 25 out from under the 10
    expect(take([25, 5, 10, 10, 10], 30)).toEqual({
      taken: [
        { value: 10, index: 4, was: 10 },
        { value: 10, index: 3, was: 10 },
        { value: 10, index: 2, was: 10 },
      ],
      left: [25, 5],
    })
  })

  it('never makes change on an all in that was called short, the whole pile goes in and the rest comes back', () => {
    // a 1085 shove called for 300. No set of these makes 300
    const piles = { 'bet-0': [1000, 25, 25, 25, 10] }
    const sweep = [{ from: 'bet-0', to: 'pot', amount: 300 }] satisfies Move[]
    const kept = [{ from: 'bet-0', to: 'win-0', amount: 785 }] satisfies Move[]
    const split = splitKept(piles, sweep, kept)
    expect(split.sweep).toEqual([{ from: 'bet-0', to: 'pot', amount: 1085 }])
    expect(split.kept).toEqual([{ from: 'pot', to: 'win-0', amount: 785 }])
    const swept = plan(piles, split.sweep, {}).trips
    expect(swept.map((trip) => trip.value).sort((a, b) => b - a)).toEqual([1000, 25, 25, 25, 10])
  })

  it('pays out so the pot never breaks a chip it did not have to', () => {
    // the short call above, split. The 305 can be made from the small chips, so the 1000 goes back whole
    const pot = [10, 10, 25, 25, 25, 100, 100, 10, 25, 25, 25, 1000]
    const moves = payOrder(pot, [
      { from: 'pot', to: 'win-0', amount: 785 },
      { from: 'pot', to: 'win-1', amount: 305 },
      { from: 'pot', to: 'win-0', amount: 305 },
    ])
    expect(moves).toEqual([
      { from: 'pot', to: 'win-1', amount: 305 },
      { from: 'pot', to: 'win-0', amount: 1090 },
    ])
    const { trips } = plan({ pot }, moves, {})
    expect(trips.map((trip) => trip.value).sort((a, b) => a - b)).toEqual([...pot].sort((a, b) => a - b))
  })

  it('leaves an uncalled bet where it is when the called part comes off its top', () => {
    const piles = { 'bet-0': [100, 25, 10] }
    const sweep = [{ from: 'bet-0', to: 'pot', amount: 35 }] satisfies Move[]
    const kept = [{ from: 'bet-0', to: 'win-0', amount: 100 }] satisfies Move[]
    expect(splitKept(piles, sweep, kept)).toEqual({ sweep, kept })
    expect(plan(piles, sweep, {}).piles['bet-0']).toEqual([100])
  })

  it('makes change when the chips there cannot make the amount', () => {
    const { taken, left } = take([1000, 100], 1060)
    expect(total(taken.map((chip) => chip.value))).toBe(1060)
    expect(total(left)).toBe(40)
  })

  it('moves the very chips a player bet into the pot, not a fresh set', () => {
    // two reds and a blue sit in the bet. a total of 20 would be two blues if it were just maths
    const { piles, trips } = plan({ 'bet-0': [5, 5, 10] }, [{ from: 'bet-0', to: 'pot', amount: 20 }], {})
    expect(piles['bet-0']).toEqual([])
    expect(trips.map((trip) => trip.value).sort()).toEqual([10, 5, 5])
  })

  it('stacks each chip on its own colour in the pot', () => {
    const { trips } = plan({ pot: [100, 5], 'bet-1': [5, 25] }, [{ from: 'bet-1', to: 'pot', amount: 30 }], {})
    // stacks will be 100, 25, 5 left to right
    expect(potLayout([100, 5, 5, 25]).map((stack) => stack.value)).toEqual([100, 25, 5])
    const red = trips.find((trip) => trip.value === 5)!
    const green = trips.find((trip) => trip.value === 25)!
    expect(red.toAt).toEqual({ stack: 2, of: 3, level: 1 }) // on top of the red already there
    expect(green.toAt).toEqual({ stack: 1, of: 3, level: 0 }) // a new stack in the middle
  })

  it('spreads a big flick up the flick pile instead of launching the extras from its top', () => {
    const { trips } = plan({}, [{ from: 'seat-0', to: 'bet-0', amount: 1999 }], {}) // 15 chips, pile draws 8
    const levels = trips.map((trip) => trip.fromAt!.level)
    expect(levels[0]).toBe(0)
    expect(levels.at(-1)).toBe(7)
    expect(new Set(levels).size).toBe(8)
  })

  it('counts chips already in the air when stacking new ones', () => {
    const { trips } = plan({ 'bet-0': [25] }, [{ from: 'seat-0', to: 'bet-0', amount: 25 }], { 'bet-0': [25] })
    expect(trips[0]!.toAt!.level).toBe(2)
  })

  it('sweeps a tall bet from where each chip is drawn, not all from the top', () => {
    // 20 chips, only the top 12 drawn, so levels run 11 down to 0 and the hidden 8 leave from the bottom
    const { trips } = plan({ 'bet-0': Array<number>(20).fill(5) }, [{ from: 'bet-0', to: 'pot', amount: 100 }], {})
    const levels = trips.map((trip) => trip.fromAt!.level)
    expect(levels.slice(0, 12)).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0])
    expect(levels.slice(12).every((l) => l === 0)).toBe(true)
  })

  it('lifts payout chips off the stacks they really sit on', () => {
    const { piles, trips } = plan({ pot: [100, 25, 25] }, [{ from: 'pot', to: 'seat-0', amount: 150 }], {})
    expect(piles.pot).toEqual([])
    expect(trips.every((trip) => trip.toAt === null)).toBe(true)
    expect(trips.map((trip) => trip.fromAt!.stack).sort()).toEqual([0, 1, 1])
  })

  it('builds a winner\'s pile in bands, biggest at the bottom, as tall as it needs', () => {
    const pot = [5, 100, 25, 5, ...Array<number>(20).fill(1), 100]
    const { trips } = plan({ pot }, [{ from: 'pot', to: 'win-1', amount: total(pot) }], {})
    const landed = [...trips].sort((a, b) => a.toAt!.level - b.toAt!.level)
    expect(landed.map((trip) => trip.value)).toEqual([100, 100, 25, 5, 5, ...Array<number>(20).fill(1)])
    expect(landed.at(-1)!.toAt!.level).toBe(pot.length - 1)
    // and they're thrown in that order, so the bottom lands first
    expect(trips.map((trip) => trip.order)).toEqual(landed.map((_, i) => i))
  })

  it('starts another stack of the same chip once a pot stack is full', () => {
    const full = Array<number>(MAX_STACK).fill(5)
    expect(potLayout([...full, 5, 5, 25]).map(({ value, count }) => [value, count])).toEqual([
      [25, 1],
      [5, MAX_STACK],
      [5, 2],
    ])
    const landing = plan({ pot: full, 'bet-0': [5, 5] }, [{ from: 'bet-0', to: 'pot', amount: 10 }], {}).trips
    expect(landing.map((trip) => trip.toAt)).toEqual([
      { stack: 1, of: 2, level: 0 },
      { stack: 1, of: 2, level: 1 },
    ])
    const payout = plan({ pot: [...full, 5] }, [{ from: 'pot', to: 'seat-0', amount: 10 }], {}).trips
    expect(payout.map((trip) => trip.fromAt)).toEqual([
      { stack: 1, of: 2, level: 0 },
      { stack: 0, of: 2, level: MAX_STACK - 1 },
    ])
  })

  it('holds a chip that lands early until the ones under it are down', () => {
    const { trips } = plan(
      { 'bet-0': [5, 5], 'bet-1': [5] },
      [
        { from: 'bet-0', to: 'pot', amount: 10 },
        { from: 'bet-1', to: 'pot', amount: 5 },
      ],
      {},
    )
    const [low, mid, top] = trips
    expect(top!.toAt!.level).toBe(2)
    // bet-1's chip starts sooner than bet-0's second one and gets there first
    expect(ready(trips, (t) => t === low || t === top)).toEqual([low])
    expect(ready([mid!, top!], () => true)).toEqual([mid, top])
  })

  it('only falls back to engine amounts when the chips do not add up', () => {
    const s = dealt()
    const right = { pot: [], 'bet-0': [10], 'bet-1': [5] }
    expect(settle(right, s, false)).toEqual(right)
    expect(settle({}, s, false)['bet-0']).toEqual(breakdown(10))
  })
})

describe('routing chips round the board', () => {
  const board = { left: 100, top: 100, right: 300, bottom: 200 }

  it('goes straight when nothing is in the way', () => {
    expect(route({ x: 0, y: 0 }, { x: 400, y: 0 }, board)).toEqual([
      { x: 0, y: 0 },
      { x: 400, y: 0 },
    ])
  })

  it('never passes through the board, and keeps both ends', () => {
    const start = { x: 150, y: 300 }
    const end = { x: 160, y: 20 }
    const path = route(start, end, board)
    expect(path[0]).toEqual(start)
    expect(path.at(-1)).toEqual(end)
    const inside = (p: { x: number; y: number }) => p.x > 100 && p.x < 300 && p.y > 100 && p.y < 200
    // check the straight bits between points too, not just the points
    for (let i = 1; i < path.length; i++) {
      for (let t = 0; t <= 1; t += 0.1) {
        const [a, b] = [path[i - 1]!, path[i]!]
        expect(inside({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })).toBe(false)
      }
    }
  })

  it('takes the nearer side', () => {
    const viaLeft = route({ x: 120, y: 300 }, { x: 120, y: 20 }, board)
    const viaRight = route({ x: 280, y: 300 }, { x: 280, y: 20 }, board)
    expect(Math.min(...viaLeft.map((p) => p.x))).toBeLessThanOrEqual(100)
    expect(Math.max(...viaRight.map((p) => p.x))).toBeGreaterThanOrEqual(300)
  })

  it('measures progress along the path from 0 to 1', () => {
    expect(progress([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 14 }])).toEqual([0, 1 / 3, 1])
  })
})

describe('helpers', () => {
  it('names starting hands in plain words', () => {
    expect(describeHand(cards('Qs Qh'), [])).toBe('Pocket queens')
    expect(describeHand(cards('6s 6h'), [])).toBe('Pocket sixes')
    expect(describeHand(cards('Ks As'), [])).toBe('Ace-king suited')
    expect(describeHand(cards('2s Td'), [])).toBe('Ten-two')
  })

  it('names made hands once there is a board', () => {
    expect(describeHand(cards('As Ah'), cards('Ad 7c 2s'))).toBe('Three of a kind')
  })

  it('works out the price of a call', () => {
    expect(priceToCall(50, 150)).toBe(0.25)
    expect(priceToCall(0, 150)).toBe(0)
  })

  it('compares the win chance with the price', () => {
    const facing = { seat: 0, toCall: 50, canCheck: false, canRaise: true, minTo: 100, maxTo: 1000 }
    expect(advice(0.5, facing, 150)).toContain('Good price')
    expect(advice(0.1, facing, 150)).toContain('folding')
    expect(advice(0.25, facing, 150)).toContain('Close')
    expect(advice(0.7, { ...facing, toCall: 0, canCheck: true }, 150)).toContain('betting')
    expect(advice(0.3, { ...facing, toCall: 0, canCheck: true }, 150)).toContain('free')
  })
})

describe('six handed', () => {
  const lineup = ['bot:xi', 'bot:omega', 'bot:pi', 'bot:chi', 'bot:psi']

  it('seats you first and the bots after, all with a full buy in', () => {
    const { table } = newSolo(lineup)
    expect(table.seats.map((seat) => seat!.id)).toEqual(['you', ...lineup])
    expect(table.seats.every((seat) => seat!.chips === BUY_IN)).toBe(true)
    expect(isSolo({ table, topUp: false })).toBe(true)
  })

  it('swaps a bust bot for one it has not met, and keeps the bust one in its seat until then', () => {
    let table = newSolo(lineup).table
    table.seats[3]!.chips = 0
    table = { ...table, street: 'complete' }
    expect(busted(table, 3)).toBe(true)
    expect(busted(table, 2)).toBe(false)

    const next = startHand(table, ordered, seeded(4))
    const fresh = next.seats[3]!
    expect(['you', ...lineup]).not.toContain(fresh.id)
    expect(fresh.chips + fresh.committed).toBe(BUY_IN)
    expect(next.seats.map((seat) => seat!.id).filter((id) => id !== fresh.id)).toEqual(['you', 'bot:xi', 'bot:omega', 'bot:chi', 'bot:psi'])
  })

  it('never calls you out, a bust hero is only dealt back in by the rebuy', () => {
    const table = { ...newSolo(lineup).table, street: 'complete' as const }
    table.seats[HERO]!.chips = 0
    expect(busted(table, HERO)).toBe(false)
    const next = startHand(table, ordered)
    expect(next.seats[HERO]!.id).toBe('you')
    expect(next.seats[HERO]!.chips + next.seats[HERO]!.committed).toBe(BUY_IN)
  })

  it('takes answers for whichever bot is on the clock, and nobody else', () => {
    const s = startHand(newSolo(lineup).table, ordered)
    const seat = s.toAct
    expect(seat).not.toBe(HERO)
    expect(botAction(s, { type: 'fold', seat })).toEqual({ type: 'fold', seat })
    expect(botAction(s, { type: 'call', seat: (seat + 1) % 6 })).toEqual({ type: 'fold', seat })
  })

  // every chip that lands somewhere is accounted for by a move, side pots and all
  it('moves account for every pile through random hands with uneven stacks', () => {
    const random = seeded(17)
    const spots: Spot[] = ['pot', 'bet-0', ...lineup.map((_, i) => `bet-${i + 1}` as const)]
    let table = newSolo(lineup).table
    for (let hand = 0; hand < 150; hand++) {
      table = { ...table, seats: table.seats.map((seat) => ({ ...seat!, chips: 20 + Math.floor(random() * 1500) })) }
      let prev = table
      let next = startHand(prev, shuffledDeck())
      let fresh = true
      while (true) {
        const { now, sweep, kept } = chipMoves(prev, next, fresh)
        const moves = [...now, ...sweep, ...kept]
        for (const spot of spots) {
          const into = moves.filter((move) => move.to === spot).reduce((sum, move) => sum + move.amount, 0)
          const out = moves.filter((move) => move.from === spot).reduce((sum, move) => sum + move.amount, 0)
          expect((fresh ? 0 : pileAt(prev, spot)) + into - out).toBe(pileAt(next, spot))
        }
        if (next.toAct < 0) break
        prev = next
        fresh = false
        next = applyAction(prev, decide(viewFor(prev, prev.toAct), random, 20))
      }
      expect(payouts(next).reduce((sum, move) => sum + move.amount, 0)).toBe(pileAt(next, 'pot'))
      table = next
    }
  })
})

describe('flick pile restack', () => {
  it('keeps the shared bottom, pops the rest and drops the new ones on', () => {
    const ids = { current: 0 }
    const start = restack([], ['a', 'b', 'c'], ids, 0, true)
    const next = restack(start, ['a', 'd'], ids, 1000, false)
    expect(next.filter((c) => !c.out).map((c) => c.color)).toEqual(['a', 'd'])
    expect(next.find((c) => c.color === 'a')).toBe(start[0])
    expect(next.filter((c) => c.out).map((c) => c.color)).toEqual(['b', 'c'])
    expect(next.find((c) => c.color === 'd')!.n).toBe(1)
    expect(restack(next, ['a', 'd'], ids, 2000, false)).toBe(next)
  })

  it('drops a chip that never showed instead of ghosting it', () => {
    const ids = { current: 0 }
    const dropped = restack(restack([], ['a'], ids, 0, true), ['a', 'b'], ids, 1000, false)
    expect(restack(dropped, ['a'], ids, 1010, false).map((c) => c.color)).toEqual(['a'])
  })
})
