// The actual chips on the felt. The engine only knows amounts, so this keeps the chips
// people threw in, and every move picks real chips up off one pile and puts them on another.

import type { TableState } from '../engine/engine'
import { breakdown, MAX_PILE } from './betting'
import { pileAt, type Move, type Spot } from './solo'

export type Piles = Partial<Record<Spot, number[]>> // chip values, bottom first
// where a chip sits in a pile's layout. hidden is under the chips a pile draws, so it waits behind the bottom one
export type At = { stack: number; of: number; level: number; hidden?: boolean }
export type Trip = { value: number; from: Spot; to: Spot; fromAt: At | null; toAt: At | null; order: number; move: number }

export const MAX_LEVEL = 11 // bet piles show 12 chips at most, more just lands on top. Payout piles show them all
export const MAX_STACK = 15 // a pot stack this tall starts another of the same chip beside it

export const total = (pile: number[] = []) => pile.reduce((sum, value) => sum + value, 0)

// the pot's stacks left to right, biggest chip first. A chip with more than MAX_STACK of it gets more stacks,
// each full but the last
export function potLayout(chips: number[]) {
  const counts = new Map<number, number>()
  for (const value of chips) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts]
    .sort(([a], [b]) => b - a)
    .flatMap(([value, n]) =>
      Array.from({ length: Math.ceil(n / MAX_STACK) }, (_, part) => ({ value, part, count: Math.min(MAX_STACK, n - part * MAX_STACK) })),
    )
}

// where the nth chip of a value in the pot sits, 0 being the bottom of its first stack
const potAt = (stacks: ReturnType<typeof potLayout>, value: number, n: number): At => ({
  stack: Math.max(stacks.findIndex((stack) => stack.value === value), 0) + Math.floor(n / MAX_STACK),
  of: Math.max(stacks.length, 1),
  level: n % MAX_STACK,
})

const level = (n: number) => Math.min(Math.max(n, 0), MAX_LEVEL)
// piles only draw their top chips, so a chip's level counts from the lowest one drawn.
// anything under that is hidden and sets off from the bottom of the pile
const drawn = (i: number, height: number) => level(i - Math.max(height - MAX_LEVEL - 1, 0))

// Which chips in the pile make exactly amount, as indexes, or null if no set of them does. Top chips get first claim
// on every sum, so the top of the pile goes when there's a choice. A plain top-down grab missed sets that were
// there (35 off 5, 25, 10, 5 took the 5, 10 and 5 and then had to change the 25).
// ponytail: subset sum over every amount up to this one, chips times amount. Fine for a table's piles
function exact(pile: number[], amount: number) {
  const from = new Int32Array(amount + 1).fill(-1) // the chip that first reached each sum
  from[0] = pile.length
  for (let i = pile.length - 1; i >= 0; i--) {
    const value = pile[i]!
    for (let sum = amount; sum >= value; sum--) if (from[sum]! < 0 && from[sum - value]! >= 0) from[sum] = i
  }
  if (from[amount]! < 0) return null
  const picked: number[] = []
  for (let sum = amount; sum > 0; sum -= pile[from[sum]!]!) picked.push(from[sum]!)
  return picked.sort((a, b) => b - a)
}

// where the run of chips off the top that makes exactly amount starts, or -1 if no run from the top does
export function topRun(pile: number[], amount: number) {
  let sum = 0
  for (let i = pile.length - 1; i >= 0 && sum < amount; i--) if ((sum += pile[i]!) === amount) return i
  return amount ? -1 : pile.length
}

// Takes exactly amount off the pile, the real chips whenever some set of them makes it. Straight off the top if
// the top chips make it, so nothing under them moves, then any set of them, top chips first. Only if none do does
// the smallest chip that covers the rest get changed, and the change stays behind.
export function take(pile: number[], amount: number) {
  const run = topRun(pile, amount)
  const picked = run >= 0 ? pile.map((_, i) => i).slice(run).reverse() : exact(pile, amount)
  if (picked) {
    return {
      taken: picked.map((index) => ({ value: pile[index]!, index, was: pile[index]! })),
      left: pile.filter((_, index) => !picked.includes(index)),
    }
  }
  const left = pile.map((value, index) => ({ value, index }))
  const taken: { value: number; index: number; was: number }[] = []
  let need = amount
  for (let i = left.length - 1; i >= 0 && need > 0; i--) {
    if (left[i]!.value > need) continue
    need -= left[i]!.value
    const [chip] = left.splice(i, 1)
    taken.push({ ...chip!, was: chip!.value })
  }
  if (need > 0) {
    let big = -1
    left.forEach((chip, i) => {
      if (chip.value > need && (big < 0 || chip.value < left[big]!.value)) big = i
    })
    if (big < 0) return { taken: [...taken, ...left.map((chip) => ({ ...chip, was: chip.value }))], left: [] }
    const [chip] = left.splice(big, 1)
    taken.push(...breakdown(need).map((value) => ({ value, index: chip!.index, was: chip!.value })))
    left.push(...breakdown(chip!.value - need).map((value) => ({ value, index: -1 })))
  }
  return { taken, left: left.map((chip) => chip.value) }
}

// An uncalled bet only stays on its pile if the called part comes straight off the top, so the chips that stay
// don't move. Otherwise the whole pile goes in and the uncalled part comes back out of the pot with the payout, the
// way a dealer makes change from the pot. Splitting it there meant changing a chip in front of the player: a 1000
// all in called for 300 turned into a 500 and two 100s on the spot, with the change's pieces leaving from under it
export function splitKept(piles: Piles, sweep: Move[], kept: Move[]) {
  const whole = kept.filter((k) => {
    const called = sweep.find((move) => move.from === k.from)
    return called && topRun(piles[k.from] ?? [], called.amount) < 0
  })
  const back = (spot: Spot) => whole.find((k) => k.from === spot)?.amount ?? 0
  return {
    sweep: sweep.map((move) => ({ ...move, amount: move.amount + back(move.from) })),
    kept: kept.map((k): Move => (whole.includes(k) ? { ...k, from: 'pot' } : k)),
  }
}

// The payout, in an order that means nobody gets change who doesn't need it. One handful per pile, so a side pot,
// the main pot and an uncalled bet back to one seat come out together. Then whichever the pot's own chips make
// exactly go first, and the last takes whatever's left, which always adds up. Paid in table order, a 785 back off
// a short call broke the 1000 into 100s for both piles when the other 305 could be made from the small chips and
// the 1000 go to its owner whole
export function payOrder(pot: number[], moves: Move[]) {
  const merged: Move[] = []
  for (const move of moves) {
    const same = merged.find((m) => m.from === move.from && m.to === move.to)
    if (same) same.amount += move.amount
    else merged.push({ ...move })
  }
  const owed = merged.filter((move) => move.from === 'pot')
  const ordered: Move[] = []
  let left = pot
  while (owed.length) {
    const [move] = owed.splice(Math.max(owed.findIndex((m) => exact(left, m.amount)), 0), 1)
    left = take(left, move!.amount).left
    ordered.push(move!)
  }
  return [...merged.filter((move) => move.from !== 'pot'), ...ordered]
}

// Every chip's trip for a set of moves. Chips leaving a pile come off it now, chips
// arriving join their pile as they land, so inbound is whatever's already in the air.
export function plan(piles: Piles, moves: Move[], inbound: Piles) {
  const next: Piles = { ...piles }
  let trips: Trip[] = []
  const potBefore = potLayout([...(piles.pot ?? []), ...(inbound.pot ?? [])])

  moves.forEach((move, m) => {
    let chips: { value: number; fromAt: At | null }[]
    if (move.from.startsWith('seat')) {
      // a flick lets go of a pile that only draws MAX_PILE chips, so a bigger bet spreads
      // its chips up that pile instead of all the extras leaving from the top
      const values = breakdown(move.amount)
      const spread = Math.min(values.length - 1, MAX_PILE - 1) / Math.max(values.length - 1, 1)
      chips = values.map((value, i) => ({ value, fromAt: { stack: 0, of: 1, level: Math.round(i * spread) } }))
    } else {
      const pile = next[move.from] ?? []
      const { taken, left } = take(pile, move.amount)
      const heights: Record<number, number> = {}
      for (const value of pile) heights[value] = (heights[value] ?? 0) + 1
      const counts = { ...heights }
      chips = taken.map(({ value, index, was }) => {
        const i = index < 0 ? pile.length - 1 : index
        return {
          value,
          fromAt:
            move.from === 'pot'
              ? potAt(potBefore, was, Math.max((counts[was] = (counts[was] ?? 1) - 1), 0))
              : { stack: 0, of: 1, level: drawn(i, pile.length), hidden: i < pile.length - MAX_LEVEL - 1 },
        }
      })
      next[move.from] = left
    }
    chips.forEach((chip, order) => trips.push({ ...chip, from: move.from, to: move.to, toAt: null, order, move: m }))
  })

  // A winner's pile goes up in bands, biggest chip at the bottom, so it can be banked a colour at a time. That's
  // across everything headed there, the pot and their own uncalled bet alike, thrown as one move in that order so
  // the bottom lands first
  const wins = [...new Set(trips.filter((trip) => trip.to.startsWith('win')).map((trip) => trip.to))]
  trips = [
    ...trips.filter((trip) => !trip.to.startsWith('win')),
    ...wins.flatMap((spot) => {
      const group = trips.filter((trip) => trip.to === spot).sort((a, b) => b.value - a.value)
      const move = Math.min(...group.map((trip) => trip.move))
      return group.map((trip, order) => ({ ...trip, order, move }))
    }),
  ]

  // destinations once every chip heading for the pot is known, so its stacks are laid out for all of them
  const potAfter = potLayout([
    ...(next.pot ?? []),
    ...(inbound.pot ?? []),
    ...trips.filter((trip) => trip.to === 'pot').map((trip) => trip.value),
  ])
  const heights: Record<string, number> = {}
  for (const trip of trips) {
    if (trip.to.startsWith('seat')) continue
    const there = [...(next[trip.to] ?? []), ...(inbound[trip.to] ?? [])]
    const pot = trip.to === 'pot'
    const key = pot ? `pot-${trip.value}` : trip.to
    const height = heights[key] ?? (pot ? there.filter((value) => value === trip.value).length : there.length)
    heights[key] = height + 1
    // ponytail: a payout pile draws every chip, however tall. Cap it like a bet's if a big pot is too much
    const at = trip.to.startsWith('win') ? height : level(height)
    trip.toAt = pot ? potAt(potAfter, trip.value, height) : { stack: 0, of: 1, level: at }
  }
  return { piles: next, trips }
}

// Levels are handed out in plan order but chips land by timing, and a later seat's chips start before an
// earlier seat's stagger is done. A pile draws by count, so a chip that beat the one under it would drop into
// its slot and turn to that level's stripes. So a landed chip only joins its pile once nothing headed under it
// is still in the air, bottom first. Until then it just sits where it landed
export function ready<T extends Trip>(flights: T[], landed: (flight: T) => boolean) {
  const under = (a: T, b: T) =>
    a.to === b.to &&
    (a.to !== 'pot' || a.value === b.value) &&
    !!a.toAt &&
    !!b.toAt &&
    (a.toAt.stack < b.toAt.stack || (a.toAt.stack === b.toAt.stack && a.toAt.level < b.toAt.level))
  return flights
    .filter((f) => landed(f) && !flights.some((o) => !landed(o) && under(o, f)))
    .sort((a, b) => (a.toAt?.stack ?? 0) - (b.toAt?.stack ?? 0) || (a.toAt?.level ?? 0) - (b.toAt?.level ?? 0))
}

// What should be on the felt when nothing's moving. Only steps in when the chips don't add up
// to what the engine says, which is a reload or something gone wrong, never normal play.
// kept is uncalled bets the engine's already handed back, still sitting on their piles for the payout
export function settle(piles: Piles, s: TableState, paid: boolean, kept: Move[] = []): Piles {
  const out: Piles = { ...piles }
  const spots: Spot[] = ['pot', ...s.seats.map((_, i): Spot => `bet-${i}`)]
  for (const spot of spots) {
    const waiting = kept.reduce((sum, move) => sum + (move.from === spot ? move.amount : 0), 0)
    const expected = spot === 'pot' && paid ? 0 : pileAt(s, spot) + waiting
    if (total(out[spot]) !== expected) out[spot] = breakdown(expected)
  }
  return out
}
