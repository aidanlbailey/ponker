// The one bot brain. Every bot is this code with its own settings (roster.ts), always working from
// viewFor so it plays the same hand a remote seat would see. Runs in bot.worker.ts.
// ponytail: thresholds on equity vs random hands, nudged by price, position and who's betting.
// Solver tables replace this for the Elite bots in milestone 10.

import { legalActions, type Card, type PlayerAction, type Seat, type TableState } from '../engine/engine'
import { evaluate } from '../engine/evaluate'
import { potSize, raiseTo } from './betting'

const SIMS = 2000
const MULTIWAY = 0.03 // each extra opponent asks this much more of a value hand

export type BotSettings = {
  open: number // preflop strength to raise an unopened pot
  valueBet: number
  valueRaise: number
  bluff: number // chance to bet with nothing when checked to, split between opponents
  bluffRaise: number // chance to raise a bet with nothing
  callSlack: number // calls this much worse than the price says
  read: number // how much a bet says the hand isn't random, 1 is Xi
  trap: number // chance to just check or call a big hand before the river
  betShare: number
  raiseShare: number
  noise: number // keeps it from playing the same spot the same way every time
  position: number // tighter opens for each seat still to act behind, past the first
  blunder: number // chance of a plain wrong move, the novices' mistake
}

// Regular Grinder, the original bot. Its numbers are measured, see bot.test.ts before changing them
export const XI: BotSettings = {
  open: 0.5, // roughly the top half of hands
  valueBet: 0.68,
  valueRaise: 0.74,
  bluff: 0.12,
  bluffRaise: 0,
  callSlack: 0,
  read: 1,
  trap: 0,
  betShare: 0.6,
  raiseShare: 0.75,
  noise: 0.06,
  position: 0.02,
  blunder: 0,
}

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

const live = (s: TableState, seat: number) =>
  s.seats.filter((other, i): other is Seat => i !== seat && !!other && other.cards.length > 0 && !other.folded)

export const liveOpponents = (s: TableState, seat: number) => live(s, seat).length

// Seats that act after this one on this street and could still put chips in.
function behind(s: TableState, seat: number) {
  const n = s.seats.length
  // postflop the first to act is left of the button, preflop it's left of the big blind
  const blinds = s.seats.filter(Boolean).length === 2 ? 1 : 2
  const first = s.board.length ? s.button + 1 : s.button + blinds + 1
  const order = (i: number) => (i - first + 2 * n) % n
  return live(s, seat).filter((o) => o.chips > 0 && order(s.seats.indexOf(o)) > order(seat)).length
}

export function decide(view: TableState, random = Math.random, sims = SIMS, bot = XI): PlayerAction {
  const legal = legalActions(view)!
  const { seat, toCall, canCheck, canRaise } = legal
  const me = view.seats[seat]!
  const raised = (share: number): PlayerAction =>
    canRaise
      ? { type: 'raise', seat, to: raiseTo(view, legal, share) }
      : { type: canCheck ? 'check' : 'call', seat }
  const check: PlayerAction = { type: 'check', seat }
  const call: PlayerAction = { type: 'call', seat }
  const fold: PlayerAction = { type: 'fold', seat }
  const chance = (p: number) => p > 0 && random() < p // no dice rolled when it can't happen, keeps Xi's seeds lined up

  // preflop the players still to act will mostly fold, so only count the ones already in
  const others = live(view, seat)
  const opponents = Math.max((view.board.length ? others : others.filter((o) => o.acted)).length, 1)
  const pot = potSize(view)
  const price = toCall / (pot + toCall)
  // someone betting into you doesn't hold a random hand, the bigger the bet the less so. kept light,
  // the price already charges for the size, and a heavier version folded 62% to a pot sized bet
  // a big blind is forced, so an unopened pot says nothing about anyone's hand
  const unopened = !view.board.length && view.currentBet <= view.bigBlind
  const caution = toCall && !unopened ? bot.read * (0.02 + 0.1 * Math.min(price * 2, 1)) : 0
  const won = equity(me.cards, view.board, opponents, sims, random)
  const shake = (random() - 0.5) * bot.noise
  // calls go on the real multiway equity, the thresholds are set against one opponent
  const toWin = won - caution + shake
  const strength =
    (opponents > 1 ? equity(me.cards, view.board, 1, sims, random) : won) -
    caution +
    shake -
    MULTIWAY * (opponents - 1)

  if (chance(bot.blunder)) {
    const options = [canCheck ? check : fold, canCheck ? check : call, raised(0.5 + random())]
    return options[Math.floor(random() * options.length)]!
  }

  const calls = toWin >= price - bot.callSlack
  if (!view.board.length) {
    const open = bot.open + bot.position * Math.max(behind(view, seat) - 1, 0)
    if (strength >= bot.valueRaise - 0.12 || (strength >= open && toCall <= view.bigBlind)) return raised(bot.raiseShare)
    if (canCheck) return check
    return calls ? call : fold
  }

  const early = view.board.length < 5
  if (canCheck) {
    if (strength >= bot.valueBet) return early && chance(bot.trap) ? check : raised(bot.betShare)
    return chance(bot.bluff / opponents) ? raised(bot.betShare) : check
  }
  if (strength >= bot.valueRaise) return early && chance(bot.trap) ? call : raised(bot.raiseShare)
  if (!calls && chance(bot.bluffRaise / opponents)) return raised(bot.raiseShare)
  return calls ? call : fold
}
