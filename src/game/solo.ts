// The table loop for a solo game. This is the caller the engine leaves things to:
// deal, topUp and timeout start here, and topUp waits here until the hand ends.

import { applyAction, createTable, type Action, type Card, type PlayerAction, type TableState } from '../engine/engine'
import { potSize } from './betting'
import { randomBots } from './roster'

export const HERO = 0
export const MAX_SEATS = 6
export const STORAGE_KEY = 'ponker-solo'
export const SMALL_BLIND = 5
export const BIG_BLIND = 10
export const BUY_IN = 100 * BIG_BLIND

export type Solo = { table: TableState; topUp: boolean }

export type WorkerRequest =
  | { kind: 'decide'; view: TableState; bot: string }
  | { kind: 'equity'; cards: Card[]; board: Card[]; opponents: number }

// win is a winner's payout pile. It sits where their bet does, bets are all in by then
export type Spot = `seat-${number}` | `bet-${number}` | `win-${number}` | 'pot'
export type Move = { from: Spot; to: Spot; amount: number }

// you in seat 0, then the bots clockwise from your left
export function newSolo(bots = ['bot:xi']): Solo {
  const ids = ['you', ...bots]
  const table = ids
    .map((id, seat): Action => ({ type: 'sit', seat, id, chips: BUY_IN }))
    .reduce(applyAction, createTable(ids.length, SMALL_BLIND, BIG_BLIND))
  return { table, topUp: false }
}

export const isSolo = (data: unknown): data is Solo => {
  const table = (data as Solo | null)?.table
  return (
    Array.isArray(table?.seats) &&
    table.seats.length >= 2 &&
    table.seats.length <= MAX_SEATS &&
    table.seats.every((seat) => Number.isFinite(seat?.chips) && Array.isArray(seat?.cards)) &&
    Array.isArray(table.board) &&
    Array.isArray(table.deck) &&
    // left over from when leaving mid hand sat you out for the rest of it. Nothing sits you back in now
    !table.seats[HERO]?.sittingOut
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
export const busted = (s: TableState, seat: number, me: number | null = HERO) =>
  s.street === 'complete' && seat !== me && s.seats[seat]?.chips === 0

export function endOfHand(solo: Solo): Solo {
  const table = solo.topUp && solo.table.seats[HERO]!.chips < BUY_IN ? refill(solo.table, HERO) : solo.table
  return { ...solo, table, topUp: false }
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

// Where the chips went between two states, for the flights. now flies straight away. sweep is the bets going
// into the pot once the street's closed, and only starts once now has landed, so a closing call hits its bet
// pile first like any other. It's in table order from the dealer's left, the stage takes it a seat at a time.
// kept is the part of a bet nobody called. It stays on its pile until the payout, then goes on that seat's
// payout pile with anything they won, so it gets banked like the rest.
// The caller says when it dealt, the street can't: a blind can put someone all in and finish the hand on the
// deal, complete to complete. An open seat, or one that just changed hands, has nothing to move
export function chipMoves(prev: TableState, next: TableState, newHand = false) {
  const now: Move[] = []
  const sweep: Move[] = []
  const kept: Move[] = []
  const closed = !newHand && prev.street !== next.street
  const n = next.seats.length
  for (let k = 1; k <= n; k++) {
    const i = (next.button + k) % n
    const seat = next.seats[i]
    const before = prev.seats[i]
    if (!seat) continue
    if (newHand) {
      if (seat.committed) now.push({ from: `seat-${i}`, to: `bet-${i}`, amount: seat.committed })
      if (seat.committed > seat.bet) sweep.push({ from: `bet-${i}`, to: 'pot', amount: seat.committed - seat.bet })
      continue
    }
    if (before?.id !== seat.id) continue
    const added = seat.committed - before.committed
    // nobody called the top of the bet, so that part goes back to them instead of into the pot
    const returned = Math.max(-added, 0)
    if (returned > 0) kept.push({ from: `bet-${i}`, to: `win-${i}`, amount: returned })
    if (added > 0) now.push({ from: `seat-${i}`, to: `bet-${i}`, amount: added })
    const swept = before.bet - returned + Math.max(added, 0)
    if (closed && swept > 0) sweep.push({ from: `bet-${i}`, to: 'pot', amount: swept })
  }
  return { now, sweep, kept }
}

// the pile sitting at a spot in this state, seats don't have one
export function pileAt(s: TableState, spot: Spot) {
  if (spot === 'pot') return potSize(s) - s.seats.reduce((sum, seat) => sum + (seat?.bet ?? 0), 0)
  return spot.startsWith('bet') ? (s.seats[Number(spot.slice(4))]?.bet ?? 0) : 0
}

// one pile per winner, a side pot and the main pot to the same seat make one pile
export function payouts(s: TableState) {
  const won = new Map<number, number>()
  for (const pot of s.result ?? []) for (const { seat, amount } of pot.winners) won.set(seat, (won.get(seat) ?? 0) + amount)
  return [...won].map(([seat, amount]): Move => ({ from: 'pot', to: `win-${seat}`, amount }))
}

export const winnings = (s: TableState, seat: number) =>
  payouts(s).reduce((sum, move) => sum + (move.to === `win-${seat}` ? move.amount : 0), 0)
