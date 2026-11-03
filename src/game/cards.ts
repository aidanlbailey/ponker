import type { Card } from '../engine/engine'

const NAMES = ['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king', 'ace']
const SUITS = ['clubs', 'diamonds', 'hearts', 'spades']
// ︎ keeps these as text, otherwise phones swap in emoji suits
const SUIT_GLYPHS = ['♣︎', '♦︎', '♥︎', '♠︎']

export const rankOf = (card: Card) => card >> 2
export const suitOf = (card: Card) => card & 3

export const rankText = (card: Card) => {
  const rank = rankOf(card)
  return rank < 9 ? String(rank + 2) : 'JQKA'[rank - 9]!
}

export const suitText = (card: Card) => SUIT_GLYPHS[suitOf(card)]!
export const isRed = (card: Card) => suitOf(card) === 1 || suitOf(card) === 2
export const rankName = (card: Card) => NAMES[rankOf(card)]!
export const cardName = (card: Card) => `${rankName(card)} of ${SUITS[suitOf(card)]}`
