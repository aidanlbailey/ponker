// One basic bot, always working from viewFor so it plays the same hand a remote
// seat would see. Runs in bot.worker.ts.
// ponytail: flat thresholds on equity vs a random hand. The shared brain with
// per-bot settings comes with the other 23 bots in milestone 4.

import { legalActions, type Card, type PlayerAction, type TableState } from '../engine/engine'
import { evaluate } from '../engine/evaluate'
import { potSize, raiseTo } from './betting'

const SIMS = 2000
const NOISE = 0.06 // keeps it from playing the same spot the same way every time
const OPEN = 0.5 // preflop, roughly the top half of hands
const VALUE_BET = 0.68
const VALUE_RAISE = 0.8
const BLUFF = 0.12

// Deals out the rest of the hand n times against random cards.
export function equity(hero: Card[], board: Card[], opponents: number, n: number, random = Math.random) {
  const known = new Set([...hero, ...board])
  const deck: Card[] = []
  for (let c = 0; c < 52; c++) if (!known.has(c)) deck.push(c)

  const heroCards = new Uint8Array(7)
  const oppCards = new Uint8Array(7)
  heroCards.set(hero)
  heroCards.set(board, 2)
  oppCards.set(board, 2)

  const missing = 5 - board.length
  const draw = missing + opponents * 2
  let won = 0
  for (let i = 0; i < n; i++) {
    for (let d = 0; d < draw; d++) {
      const j = d + Math.floor(random() * (deck.length - d))
      const swap = deck[d]!
      deck[d] = deck[j]!
      deck[j] = swap
    }
    for (let m = 0; m < missing; m++) heroCards[2 + board.length + m] = oppCards[2 + board.length + m] = deck[m]!

    const score = evaluate(heroCards)
    let best = 0
    let ties = 1
    for (let o = 0; o < opponents; o++) {
      oppCards[0] = deck[missing + o * 2]!
      oppCards[1] = deck[missing + o * 2 + 1]!
      const opp = evaluate(oppCards)
      if (opp > best) {
        best = opp
        ties = 1
      } else if (opp === best) ties++
    }
    if (score > best) won += 1
    else if (score === best) won += 1 / (ties + 1)
  }
  return won / n
}

export const liveOpponents = (s: TableState, seat: number) =>
  s.seats.filter((other, i) => i !== seat && other && other.cards.length > 0 && !other.folded).length

export function decide(view: TableState, random = Math.random, sims = SIMS): PlayerAction {
  const legal = legalActions(view)!
  const { seat, toCall, canCheck, canRaise } = legal
  const me = view.seats[seat]!
  const raised = (share: number): PlayerAction =>
    canRaise
      ? { type: 'raise', seat, to: raiseTo(view, legal, share) }
      : { type: canCheck ? 'check' : 'call', seat }

  const pot = potSize(view)
  const price = toCall / (pot + toCall)
  // someone betting into you doesn't hold a random hand, the bigger the bet the less so
  const caution = toCall ? 0.05 + 0.2 * Math.min(price * 2, 1) : 0
  const strength =
    equity(me.cards, view.board, liveOpponents(view, seat), sims, random) - caution + (random() - 0.5) * NOISE

  if (!view.board.length) {
    if (strength >= VALUE_RAISE - 0.12 || (strength >= OPEN && toCall <= view.bigBlind)) return raised(0.75)
    if (canCheck) return { type: 'check', seat }
    return strength >= price ? { type: 'call', seat } : { type: 'fold', seat }
  }

  if (canCheck) {
    if (strength >= VALUE_BET || random() < BLUFF) return raised(0.6)
    return { type: 'check', seat }
  }
  if (strength >= VALUE_RAISE) return raised(0.75)
  return strength >= price ? { type: 'call', seat } : { type: 'fold', seat }
}
