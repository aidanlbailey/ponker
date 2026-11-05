import { legalActions, pots, type Action, type Legal, type TableState } from '../engine/engine'
import { CHIP_COLORS } from '../lib/chips'

type Point = { x: number; y: number }

const FLICK_MIN = 24 // px, so a twitchy tap can't bet
const FLICK_SPEED = 450 // px/s
const PUSH_PAST = 120 // px, slid slowly this far it still counts, like pushing chips over the line
export const MAX_PILE = 8 // the flick pile, keep in step with its reserved height in game.css

const hex = (name: string) => CHIP_COLORS.find((color) => color.name === name)!.hex
const DENOMINATIONS = [
  [1000, hex('Yellow')],
  [500, hex('Purple')],
  [100, hex('Black')],
  [25, hex('Green')],
  [10, hex('Blue')],
  [5, hex('Red')],
  [1, hex('White')],
] as const

// every chip in the middle, this street's bets included
export const potSize = (s: TableState) => pots(s).reduce((sum, pot) => sum + pot.amount, 0)

// A pot sized raise: call first, then raise by a share of the pot that makes.
export function raiseTo(s: TableState, legal: Legal, share: number) {
  const matched = s.seats[legal.seat]!.bet + legal.toCall
  const to = matched + share * (potSize(s) + legal.toCall)
  const rounded = Math.round(to / s.smallBlind) * s.smallBlind
  return Math.min(Math.max(rounded, legal.minTo), legal.maxTo)
}

// The chips that make an amount, biggest first so they sit at the bottom of a pile.
export function breakdown(amount: number) {
  const values: number[] = []
  let left = amount
  for (const [value] of DENOMINATIONS) {
    for (; left >= value; left -= value) values.push(value)
  }
  return values
}

export const colorOf = (value: number) => DENOMINATIONS.find(([v]) => v === value)?.[1] ?? DENOMINATIONS.at(-1)![1]

// The flick pile is a picture of the amount, so it stops at a sensible height.
export const chipColors = (amount: number) => breakdown(amount).slice(0, MAX_PILE).map(colorOf)

// aim is the direction to the bet spot, so the same rule works whichever way the table sits from the chips
export function isFlick(moved: Point, velocity: Point, aim: Point) {
  const length = Math.hypot(aim.x, aim.y) || 1
  const along = (p: Point) => (p.x * aim.x + p.y * aim.y) / length
  return (along(moved) >= FLICK_MIN && along(velocity) >= FLICK_SPEED) || along(moved) >= PUSH_PAST
}

// what the seat says out loud, read before the action is applied
// which bubble a said line gets, see .said in game.css. Off the words so rooms, which only get the text, match
const KINDS = [
  ['All in', 'allin'],
  ['Fold', 'fold'],
  ['Check', 'check'],
  ['Call', 'call'],
  ['Bet', 'opens'], // not 'bet', that's the chip pile's class and it dragged the bubble off to the pile
  ['Raise', 'raise'],
] as const
export const saidKind = (text: string) => KINDS.find(([start]) => text.startsWith(start))?.[1] ?? ''

export function actionText(s: TableState, action: Action) {
  const legal = legalActions(s)
  if (!legal) return null
  switch (action.type) {
    case 'fold':
      return 'Fold'
    case 'check':
      return 'Check'
    case 'timeout':
      return legal.canCheck ? 'Check' : 'Fold'
    case 'call':
      return legal.toCall === s.seats[legal.seat]!.chips ? 'All in' : `Call ${legal.toCall}`
    case 'raise':
      if (action.to === legal.maxTo) return 'All in'
      return `${s.currentBet ? 'Raise to' : 'Bet'} ${action.to}`
    default:
      return null
  }
}
