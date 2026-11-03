// No-limit hold'em for N seats. Everything is (state, action) => newState and
// the state is plain JSON, so a table can be saved after every action. Dealing
// takes the shuffled deck as an action, which means a hand replays exactly from
// its action list.

import { evaluate, handName } from './evaluate'

export type Card = number

// what another player's card looks like in a view
export const HIDDEN = -1

export type Street = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'complete'

export type Seat = {
  id: string
  chips: number
  sittingOut: boolean
  cards: Card[]
  folded: boolean
  bet: number // this street
  committed: number // this hand, this is what side pots are built from
  acted: boolean
  shown: boolean
}

export type Pot = { amount: number; eligible: number[] }

export type PotResult = Pot & {
  // hand is null when the pot had one eligible seat, since those cards stay hidden
  winners: { seat: number; amount: number; hand: string | null }[]
}

export type TableState = {
  smallBlind: number
  bigBlind: number
  seats: (Seat | null)[]
  button: number
  street: Street
  deck: Card[]
  board: Card[]
  toAct: number // -1 when nobody is on the clock
  currentBet: number
  minRaise: number
  result: PotResult[] | null
}

// The only actions a client may send. The table layer fills in seat from the
// socket, never from the message.
export type PlayerAction =
  | { type: 'fold' | 'check' | 'call' | 'show'; seat: number }
  | { type: 'raise'; seat: number; to: number } // to = total bet this street, opening bets too

export type Action =
  | PlayerAction
  | { type: 'sit'; seat: number; id: string; chips: number }
  | { type: 'leave' | 'sitOut' | 'sitIn'; seat: number }
  | { type: 'topUp'; seat: number; chips: number }
  | { type: 'deal'; deck: Card[] }
  | { type: 'timeout' }

export function createTable(seatCount: number, smallBlind: number, bigBlind: number): TableState {
  return {
    smallBlind,
    bigBlind,
    seats: Array<null>(seatCount).fill(null),
    button: -1,
    street: 'waiting',
    deck: [],
    board: [],
    toAct: -1,
    currentBet: 0,
    minRaise: bigBlind,
    result: null,
  }
}

function randomBelow(n: number) {
  // reject the top of the range so the modulo isn't biased
  const limit = Math.floor(2 ** 32 / n) * n
  const out = new Uint32Array(1)
  do crypto.getRandomValues(out)
  while (out[0]! >= limit)
  return out[0]! % n
}

export function shuffledDeck(): Card[] {
  const deck = Array.from({ length: 52 }, (_, i) => i)
  for (let i = 51; i > 0; i--) {
    const j = randomBelow(i + 1)
    ;[deck[i], deck[j]] = [deck[j]!, deck[i]!]
  }
  return deck
}

const reject = (why: string): never => {
  throw new Error(why)
}

const inHand = (s: Seat | null): s is Seat => !!s && s.cards.length > 0 && !s.folded
const canAct = (s: Seat | null) => inHand(s) && s.chips > 0
const handLive = (s: TableState) => s.street !== 'waiting' && s.street !== 'complete'
const validChips = (n: number) => Number.isSafeInteger(n) && n > 0

const pay = (s: Seat, amount: number) => {
  s.chips -= amount
  s.bet += amount
  s.committed += amount
}

// The amount a seat has to match. With nobody left to bet against, that's only
// what's really out there, not a full big blind a short stack couldn't post.
function target(s: TableState, i: number) {
  const others = s.seats.filter((_, j) => j !== i)
  return others.some(canAct) ? s.currentBet : Math.max(...others.map((o) => o?.bet ?? 0))
}

export type Legal = {
  seat: number
  toCall: number // capped at the seat's stack
  canCheck: boolean
  canRaise: boolean
  minTo: number
  maxTo: number
}

// Works on a view as well as the real state.
export function legalActions(s: TableState): Legal | null {
  if (s.toAct < 0) return null
  const me = s.seats[s.toAct]!
  const toCall = Math.min(Math.max(target(s, s.toAct) - me.bet, 0), me.chips)
  const maxTo = me.bet + me.chips
  return {
    seat: s.toAct,
    toCall,
    canCheck: toCall === 0,
    // A short all-in doesn't reopen the betting for anyone who already acted,
    // unless the short raises add up to a full raise since they last moved.
    canRaise:
      me.chips > toCall &&
      s.seats.some((o, j) => j !== s.toAct && canAct(o)) &&
      (!me.acted || s.currentBet - me.bet >= s.minRaise),
    minTo: Math.min(s.currentBet + s.minRaise, maxTo),
    maxTo,
  }
}

// Layers built from live seats' totals. Money from folded seats sits in the
// layers it reaches. It can't go past the top live total: to fold you have to
// be facing more than you put in.
export function pots(s: TableState): Pot[] {
  const seats = s.seats
  const live = seats.flatMap((seat, i) => (inHand(seat) ? [i] : []))
  const levels = [...new Set(live.map((i) => seats[i]!.committed))].filter(Boolean).sort((a, b) => a - b)
  return levels.map((level, n) => {
    const below = levels[n - 1] ?? 0
    const amount = seats.reduce(
      (sum, seat) => sum + (seat ? Math.min(seat.committed, level) - Math.min(seat.committed, below) : 0),
      0,
    )
    return { amount, eligible: live.filter((i) => seats[i]!.committed >= level) }
  })
}

function returnUncalled(s: TableState) {
  const bets = s.seats.flatMap((seat) => (seat ? [seat.bet] : [])).sort((a, b) => b - a)
  const extra = bets[0]! - bets[1]!
  const top = s.seats.find((seat) => seat?.bet === bets[0])
  if (!extra) return
  top!.chips += extra
  top!.bet -= extra
  top!.committed -= extra
}

function finish(s: TableState) {
  const n = s.seats.length
  const fromButton = (i: number) => (i - s.button - 1 + n) % n

  s.result = pots(s).map((pot) => {
    const contested = pot.eligible.length > 1
    const score = (i: number) => evaluate([...s.seats[i]!.cards, ...s.board])
    const best = contested ? Math.max(...pot.eligible.map(score)) : 0
    const winners = contested ? pot.eligible.filter((i) => score(i) === best) : pot.eligible
    const share = Math.floor(pot.amount / winners.length)
    const oddChips = pot.amount - share * winners.length
    // odd chips go one each from the first seat left of the button
    const order = [...winners].sort((a, b) => fromButton(a) - fromButton(b))

    return {
      ...pot,
      winners: order.map((i, place) => {
        const seat = s.seats[i]!
        const amount = share + (place < oddChips ? 1 : 0)
        seat.chips += amount
        if (contested) seat.shown = true
        return { seat: i, amount, hand: contested ? handName(best) : null }
      }),
    }
  })
  s.street = 'complete'
  s.toAct = -1
}

// Moves to the next seat that owes an action, or closes the street.
function advance(s: TableState) {
  const n = s.seats.length
  const live = s.seats.filter(inHand)

  if (live.length > 1) {
    for (let k = 1; k <= n; k++) {
      const i = (s.toAct + k) % n
      const seat = s.seats[i]!
      if (!canAct(seat)) continue
      const owes = target(s, i) > seat.bet
      const firstTurn = !seat.acted && s.seats.some((o, j) => j !== i && canAct(o))
      if (owes || firstTurn) {
        s.toAct = i
        return
      }
    }
  }

  returnUncalled(s)
  for (const seat of s.seats) {
    if (!seat) continue
    seat.bet = 0
    seat.acted = false
  }
  s.currentBet = 0
  s.minRaise = s.bigBlind
  if (live.length === 1) return finish(s)

  const noMoreBetting = s.seats.filter(canAct).length < 2
  if (noMoreBetting) for (const seat of live) seat.shown = true
  if (noMoreBetting || s.board.length === 5) {
    s.board.push(...s.deck.splice(0, 5 - s.board.length))
    return finish(s)
  }

  s.board.push(...s.deck.splice(0, s.board.length ? 1 : 3))
  s.street = s.board.length === 3 ? 'flop' : s.board.length === 4 ? 'turn' : 'river'
  s.toAct = s.button
  advance(s)
}

// ponytail: moving button with no dead button or missed blinds, so sitting out
// past the big blind dodges it. Add owed blinds here if that matters at bankroll tables.
function deal(s: TableState, deck: Card[]) {
  if (handLive(s)) reject('hand in progress')
  const valid = deck.length === 52 && new Set(deck).size === 52
  if (!valid || !deck.every((c) => Number.isInteger(c) && c >= 0 && c < 52)) reject('bad deck')

  const n = s.seats.length
  const players: number[] = []
  s.seats.forEach((seat, i) => {
    if (!seat) return
    Object.assign(seat, { cards: [], folded: false, bet: 0, committed: 0, acted: false, shown: false })
    if (seat.chips > 0 && !seat.sittingOut) players.push(i)
  })
  if (players.length < 2) reject('need two players')

  const next = (from: number) => {
    for (let k = 1; k <= n; k++) if (players.includes((from + k) % n)) return (from + k) % n
    return reject('no next seat')
  }

  s.button = next(s.button)
  // heads-up the button is the small blind
  const sb = players.length === 2 ? s.button : next(s.button)
  const bb = next(sb)

  s.deck = [...deck]
  s.board = []
  s.result = null
  for (let round = 0; round < 2; round++) {
    let i = s.button
    for (let p = 0; p < players.length; p++) {
      i = next(i)
      s.seats[i]!.cards.push(s.deck.shift()!)
    }
  }

  const post = (i: number, blind: number) => pay(s.seats[i]!, Math.min(blind, s.seats[i]!.chips))
  post(sb, s.smallBlind)
  post(bb, s.bigBlind)
  // a short big blind still sets the price at a full big blind
  s.currentBet = s.bigBlind
  s.minRaise = s.bigBlind
  s.street = 'preflop'
  s.toAct = bb
  advance(s)
}

function act(s: TableState, action: PlayerAction) {
  const legal = legalActions(s)
  if (!legal || legal.seat !== action.seat) return reject('not your turn')
  const me = s.seats[legal.seat]!

  if (action.type === 'fold') me.folded = true
  else if (action.type === 'check') {
    if (!legal.canCheck) reject('cannot check')
  } else if (action.type === 'call') {
    if (!legal.toCall) reject('nothing to call')
    pay(me, legal.toCall)
  } else if (action.type === 'raise') {
    const { to } = action
    if (!legal.canRaise) reject('cannot raise')
    if (!Number.isSafeInteger(to) || to < legal.minTo || to > legal.maxTo) reject('bad raise size')
    const size = to - s.currentBet
    if (size >= s.minRaise) s.minRaise = size
    s.currentBet = to
    pay(me, to - me.bet)
  }
  me.acted = true
  advance(s)
}

export function applyAction(state: TableState, action: Action): TableState {
  const s = structuredClone(state)
  const seat = 'seat' in action ? s.seats[action.seat] : null

  switch (action.type) {
    case 'deal':
      deal(s, action.deck)
      break
    case 'fold':
    case 'check':
    case 'call':
    case 'raise':
      act(s, action)
      break
    case 'timeout': {
      const legal = legalActions(s) ?? reject('nobody on the clock')
      s.seats[legal.seat]!.sittingOut = true
      act(s, { type: legal.canCheck ? 'check' : 'fold', seat: legal.seat })
      break
    }
    case 'show':
      if (s.street !== 'complete' || !inHand(seat ?? null)) reject('nothing to show')
      seat!.shown = true
      break
    case 'sit':
      if (!(action.seat in s.seats) || seat) reject('seat taken')
      if (!validChips(action.chips)) reject('bad chip amount')
      s.seats[action.seat] = {
        id: action.id,
        chips: action.chips,
        sittingOut: false,
        cards: [],
        folded: false,
        bet: 0,
        committed: 0,
        acted: false,
        shown: false,
      }
      break
    // leaving mid-hand would take chips out of the pots, so the table layer holds it until the hand ends
    case 'leave':
      if (!seat) reject('empty seat')
      if (handLive(s)) reject('hand in progress')
      s.seats[action.seat] = null
      break
    case 'topUp':
      if (!seat) return reject('empty seat')
      if (handLive(s)) reject('hand in progress')
      if (!validChips(action.chips)) reject('bad chip amount')
      seat.chips += action.chips
      break
    case 'sitOut':
    case 'sitIn':
      if (!seat) return reject('empty seat')
      seat.sittingOut = action.type === 'sitOut'
      break
  }
  return s
}

// What one seat may see, or a spectator with null. Same shape as the real state
// so legalActions and pots work on it.
export function viewFor(state: TableState, seat: number | null): TableState {
  const view = structuredClone(state)
  view.deck = []
  view.seats.forEach((s, i) => {
    if (s && i !== seat && !s.shown) s.cards = s.cards.map(() => HIDDEN)
  })
  return view
}
