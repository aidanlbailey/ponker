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
import { actionText, chipColors, isFlick, potSize, raiseTo } from './betting'
import { decide, equity } from './bot'
import { advice, describeHand, priceToCall } from './helpers'
import {
  BOT,
  botAction,
  BUY_IN,
  chipMoves,
  endOfHand,
  HERO,
  isSolo,
  newSolo,
  payouts,
  setLeaving,
  startHand,
  winnings,
} from './solo'

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
      const rebought = table.seats.reduce((sum, seat) => sum + seat!.chips + seat!.committed, 0)
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

  it('leaving mid hand sits the seat out so timeouts can finish the hand', () => {
    let solo = { ...newSolo(), table: dealt() }
    solo = setLeaving(solo, true)
    expect(solo.table.seats[HERO]!.sittingOut).toBe(true)
    expect(() => applyAction(solo.table, { type: 'leave', seat: HERO })).toThrow()

    let { table } = solo
    table = applyAction(table, { type: 'call', seat: BOT })
    table = applyAction(table, { type: 'timeout' }) // hero's option, checks
    expect(table.street).toBe('flop')
    table = applyAction(table, { type: 'timeout' }) // first to act, checks
    table = applyAction(table, { type: 'raise', seat: BOT, to: 20 })
    table = applyAction(table, { type: 'timeout' }) // facing a bet, folds
    expect(table.street).toBe('complete')
  })

  it('can change its mind about leaving', () => {
    const solo = setLeaving(setLeaving({ ...newSolo(), table: dealt() }, true), false)
    expect(solo.table.seats[HERO]!.sittingOut).toBe(false)
    expect(solo.leaving).toBe(false)
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
    expect(chipMoves(table, startHand(table, ordered))).toEqual([
      { from: 'seat-0', to: 'bet-0', amount: 5 },
      { from: 'seat-1', to: 'bet-1', amount: 10 },
    ])
  })

  it('puts a bet in front of the seat', () => {
    const s = dealt()
    expect(chipMoves(s, applyAction(s, { type: 'raise', seat: BOT, to: 30 }))).toEqual([
      { from: 'seat-1', to: 'bet-1', amount: 25 },
    ])
  })

  it('sweeps everything to the pot when the street closes', () => {
    const s = applyAction(dealt(), { type: 'call', seat: BOT })
    const raised = applyAction(s, { type: 'raise', seat: HERO, to: 30 })
    expect(chipMoves(raised, applyAction(raised, { type: 'call', seat: BOT }))).toEqual([
      { from: 'bet-0', to: 'pot', amount: 30 },
      { from: 'bet-1', to: 'pot', amount: 10 },
      { from: 'seat-1', to: 'pot', amount: 20 },
    ])
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
