// The actual chips on the felt. The engine only knows amounts, so this keeps the chips
// people threw in, and every move picks real chips up off one pile and puts them on another.

import type { TableState } from '../engine/engine'
import { breakdown, MAX_PILE } from './betting'
import { pileAt, type Move, type Spot } from './solo'

export type Piles = Partial<Record<Spot, number[]>> // chip values, bottom first
export type At = { stack: number; of: number; level: number } // where a chip sits in a pile's layout
export type Trip = { value: number; from: Spot; to: Spot; fromAt: At | null; toAt: At | null; order: number; move: number }

export const MAX_LEVEL = 11 // piles show 12 chips at most, more just lands on top

export const total = (pile: number[] = []) => pile.reduce((sum, value) => sum + value, 0)

// the pot's stacks left to right, one per chip value, biggest first
export const stackValues = (chips: number[]) => [...new Set(chips)].sort((a, b) => b - a)

const level = (n: number) => Math.min(Math.max(n, 0), MAX_LEVEL)
// piles only draw their top chips, so a chip's level counts from the lowest one drawn.
// anything under that is hidden and sets off from the bottom of the pile
const drawn = (i: number, height: number) => level(i - Math.max(height - MAX_LEVEL - 1, 0))

// Takes exactly amount off the pile, top chips first. If the chips there can't make it,
// the smallest chip that covers the rest gets changed, and the change stays behind.
export function take(pile: number[], amount: number) {
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

// Every chip's trip for a set of moves. Chips leaving a pile come off it now, chips
// arriving join their pile as they land, so inbound is whatever's already in the air.
export function plan(piles: Piles, moves: Move[], inbound: Piles) {
  const next: Piles = { ...piles }
  const trips: Trip[] = []
  const potBefore = stackValues([...(piles.pot ?? []), ...(inbound.pot ?? [])])

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
      chips = taken.map(({ value, index, was }) => ({
        value,
        fromAt:
          move.from === 'pot'
            ? {
                stack: Math.max(potBefore.indexOf(was), 0),
                of: Math.max(potBefore.length, 1),
                level: drawn((counts[was] = (counts[was] ?? 1) - 1), heights[was] ?? 0),
              }
            : { stack: 0, of: 1, level: drawn(index < 0 ? pile.length - 1 : index, pile.length) },
      }))
      next[move.from] = left
    }
    chips.forEach((chip, order) => trips.push({ ...chip, from: move.from, to: move.to, toAt: null, order, move: m }))
  })

  // destinations once every chip heading for the pot is known, so its stacks are laid out for all of them
  const potAfter = stackValues([
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
    trip.toAt = pot
      ? { stack: potAfter.indexOf(trip.value), of: potAfter.length, level: level(height) }
      : { stack: 0, of: 1, level: level(height) }
  }
  return { piles: next, trips }
}

// What should be on the felt when nothing's moving. Only steps in when the chips don't add up
// to what the engine says, which is a reload or something gone wrong, never normal play.
export function settle(piles: Piles, s: TableState, paid: boolean): Piles {
  const out: Piles = { ...piles }
  const spots: Spot[] = ['pot', ...s.seats.map((_, i): Spot => `bet-${i}`)]
  for (const spot of spots) {
    const expected = spot === 'pot' && paid ? 0 : pileAt(s, spot)
    if (total(out[spot]) !== expected) out[spot] = breakdown(expected)
  }
  return out
}
