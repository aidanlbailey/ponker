// The table loop for a solo game. This is the caller the engine leaves things to:
// deal, topUp and timeout start here, and leave and topUp wait here until the hand ends.

import { applyAction, createTable, type Action, type Card, type PlayerAction, type TableState } from '../engine/engine'
import { potSize } from './betting'
import { randomBots } from './roster'

export const HERO = 0
export const MAX_SEATS = 6
export const STORAGE_KEY = 'ponker-solo'
export const SMALL_BLIND = 5
export const BIG_BLIND = 10
export const BUY_IN = 100 * BIG_BLIND

export type Solo = { table: TableState; leaving: boolean; topUp: boolean }

export type WorkerRequest =
  | { kind: 'decide'; view: TableState; bot: string }
  | { kind: 'equity'; cards: Card[]; board: Card[]; opponents: number }

export type Spot = `seat-${number}` | `bet-${number}` | 'pot'
export type Move = { from: Spot; to: Spot; amount: number }

// you in seat 0, then the bots clockwise from your left
export function newSolo(bots = ['bot:xi']): Solo {
  const ids = ['you', ...bots]
  const table = ids
    .map((id, seat): Action => ({ type: 'sit', seat, id, chips: BUY_IN }))
    .reduce(applyAction, createTable(ids.length, SMALL_BLIND, BIG_BLIND))
  return { table, leaving: false, topUp: false }
}

export const isSolo = (data: unknown): data is Solo => {
  const table = (data as Solo | null)?.table
  return (
    Array.isArray(table?.seats) &&
    table.seats.length >= 2 &&
    table.seats.length <= MAX_SEATS &&
    table.seats.every((seat) => Number.isFinite(seat?.chips) && Array.isArray(seat?.cards)) &&
    Array.isArray(table.board) &&
    Array.isArray(table.deck)
  )
}

const refill = (s: TableState, seat: number) =>
  applyAction(s, { type: 'topUp', seat, chips: BUY_IN - s.seats[seat]!.chips })

// A bust bot is out, and a fresh one it hasn't met takes the seat. You only get dealt in bust by
// pressing rebuy, so a bust hero is refilled here. Only the hero can top up early.
export function startHand(s: TableState, deck: Card[], random = Math.random) {
  const taken = s.seats.map((seat) => seat!.id)
  const ready = s.seats.reduce((table, seat, i) => {
    if (seat!.chips) return table
    if (i === HERO) return refill(table, i)
    const [fresh] = randomBots(1, taken, random)
    taken.push(fresh!.id)
    return applyAction(applyAction(table, { type: 'leave', seat: i }), { type: 'sit', seat: i, id: fresh!.id, chips: BUY_IN })
  }, s)
  return applyAction(ready, { type: 'deal', deck })
}

// still holding the seat after the payout, but not for the next hand
export const busted = (s: TableState, seat: number) =>
  s.street === 'complete' && seat !== HERO && s.seats[seat]!.chips === 0

export function endOfHand(solo: Solo): Solo {
  const table = solo.topUp && solo.table.seats[HERO]!.chips < BUY_IN ? refill(solo.table, HERO) : solo.table
  return { ...solo, table, topUp: false }
}

// Sitting out now means the table plays the seat's turns out, then the hand end takes it off.
export function setLeaving(solo: Solo, leaving: boolean): Solo {
  return { ...solo, leaving, table: applyAction(solo.table, { type: leaving ? 'sitOut' : 'sitIn', seat: HERO }) }
}

const checkOrFold = (s: TableState, seat: number): PlayerAction => ({
  type: s.currentBet > s.seats[seat]!.bet ? 'fold' : 'check',
  seat,
})

// A bad answer or a dead worker shouldn't freeze the table.
export function botAction(s: TableState, answer: PlayerAction | null) {
  if (answer && answer.seat === s.toAct && s.toAct !== HERO) {
    try {
      applyAction(s, answer)
      return answer
    } catch {
      // falls through
    }
  }
  return checkOrFold(s, s.toAct)
}

// Where the chips went between two states, for the flights. The caller says when it dealt, the
// street can't: a blind can put someone all in and finish the hand on the deal, complete to complete
export function chipMoves(prev: TableState, next: TableState, newHand = false) {
  const moves: Move[] = []
  const closed = !newHand && prev.street !== next.street
  next.seats.forEach((seat, i) => {
    const before = prev.seats[i]!
    if (newHand) {
      const swept = seat!.committed - seat!.bet
      if (seat!.bet) moves.push({ from: `seat-${i}`, to: `bet-${i}`, amount: seat!.bet })
      if (swept > 0) moves.push({ from: `seat-${i}`, to: 'pot', amount: swept })
      return
    }
    const added = seat!.committed - before.committed
    // nobody called the top of the bet, so that part goes home instead of into the pot
    const returned = Math.max(-added, 0)
    const swept = before.bet - returned
    // returned first, so it's the top of the pile that goes home
    if (returned > 0) moves.push({ from: `bet-${i}`, to: `seat-${i}`, amount: returned })
    if (closed && swept > 0) moves.push({ from: `bet-${i}`, to: 'pot', amount: swept })
    if (added > 0) moves.push({ from: `seat-${i}`, to: closed ? 'pot' : `bet-${i}`, amount: added })
  })
  return moves
}

// the pile sitting at a spot in this state, seats don't have one
export function pileAt(s: TableState, spot: Spot) {
  if (spot === 'pot') return potSize(s) - s.seats.reduce((sum, seat) => sum + seat!.bet, 0)
  return spot.startsWith('bet') ? s.seats[Number(spot.slice(4))]!.bet : 0
}

export function payouts(s: TableState) {
  return (s.result ?? []).flatMap((pot) =>
    pot.winners.map(({ seat, amount }): Move => ({ from: 'pot', to: `seat-${seat}`, amount })),
  )
}

export const winnings = (s: TableState, seat: number) =>
  payouts(s).reduce((sum, move) => sum + (move.to === `seat-${seat}` ? move.amount : 0), 0)
