import type { Card, Legal } from '../engine/engine'
import { evaluate, handName } from '../engine/evaluate'
import { rankName, rankOf, suitOf } from './cards'

const MARGIN = 0.08 // inside this the maths can't honestly call it

const capitalise = (text: string) => text[0]!.toUpperCase() + text.slice(1)
const plural = (name: string) => (name === 'six' ? 'sixes' : `${name}s`)

export function describeHand(cards: Card[], board: Card[]) {
  if (board.length >= 3) return handName(evaluate([...cards, ...board]))
  const [high, low] = [...cards].sort((a, b) => rankOf(b) - rankOf(a)) as [Card, Card]
  if (rankOf(high) === rankOf(low)) return `Pocket ${plural(rankName(high))}`
  return `${capitalise(rankName(high))}-${rankName(low)}${suitOf(high) === suitOf(low) ? ' suited' : ''}`
}

// the share of the final pot you pay, which is also the win chance a call needs to break even
export const priceToCall = (toCall: number, pot: number) => (toCall ? toCall / (pot + toCall) : 0)

export function advice(chance: number, legal: Legal, pot: number) {
  if (legal.canCheck) return chance >= 0.6 ? 'Strong spot, think about betting.' : 'Checking is free here.'
  const price = priceToCall(legal.toCall, pot)
  if (chance >= price + MARGIN) return 'Good price, calling pays.'
  if (chance <= price - MARGIN) return 'Too expensive, folding is fine.'
  return 'Close call, your read decides.'
}

export const HAND_RANKS = [
  ['Royal flush', 'A K Q J 10, all one suit'],
  ['Straight flush', 'Five in a row, all one suit'],
  ['Four of a kind', 'Four cards of one rank'],
  ['Full house', 'Three of a kind plus a pair'],
  ['Flush', 'Five of one suit'],
  ['Straight', 'Five in a row, any suits'],
  ['Three of a kind', 'Three cards of one rank'],
  ['Two pair', 'Two different pairs'],
  ['Pair', 'Two cards of one rank'],
  ['High card', 'None of the above'],
] as const
