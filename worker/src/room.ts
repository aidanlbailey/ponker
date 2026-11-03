// One room, private or public: the engine's table, who sits in each seat, and the clocks. Plain JSON with no
// Cloudflare in it, so the whole thing can sit behind a Node socket server instead. The caller saves
// after every change and wakes tick() at nextWake().

import {
  applyAction,
  createTable,
  shuffledDeck,
  viewFor,
  type PlayerAction,
  type TableState,
} from '../../src/engine/engine'
import { decide } from '../../src/game/bot'
import { botById, randomBots } from '../../src/game/roster'
import { BIG_BLIND, BUY_IN, MAX_SEATS, SMALL_BLIND } from '../../src/game/solo'
import { EMOTES } from '../../src/room/public'

export const TURN_MS = 20_000
export const BANK_MS = 30_000
export const BANK_REFILL_MS = 5_000
export const GRACE_MS = 120_000
// nobody's holding a public chair for a friend, so a dead seat goes sooner
export const PUBLIC_GRACE_MS = 60_000
const BOT_SIMS = 500 // 0.3ms a decision, solo uses 2000
const OUT_MS = 500 // a seat that's sat out still gets its turns played, just quickly
// the clients stage everything the server jumps past, so the next turn waits for that to play
const DEAL_PAUSE_MS = 1000
const STREET_PAUSE_MS = 600
const NEXT_HAND_MS = 4500
const RUN_OUT_MS = 1100 // per card, same as the client's run out
const READY_MS = 1500
const CHAT_KEPT = 30
// ponytail: a flat cap per room per UTC day, so one room (or one script) can't eat the whole free
// allowance. About 570 four handed hands. A per-IP cap would need its own object, add that if rooms get farmed
export const DAILY_ROWS = 20_000
// four of these is 40k, which leaves the rest of the free 100k for private rooms
export const PUBLIC_DAILY_ROWS = 10_000
const CHAT_MAX = 200
const NAME_MAX = 16
// joiners sit across from the host first, so heads-up looks like heads-up
const SEAT_ORDER = [0, 3, 1, 4, 2, 5]

export type Member = {
  token: string | null // null is a bot
  name: string
  bank: number
  leaving: boolean
  topUp: boolean
  outSince: number | null // sat out by the clock, the grace period runs from here
}

export type ChatLine = { name: string; text: string; at: number }
export type Said = PlayerAction | { type: 'timeout' }

export type Room = {
  table: TableState
  members: (Member | null)[]
  host: string | null
  seq: number
  hand: number
  dealt: boolean // the last change was a deal
  last: { seat: number; action: Said } | null
  turn: { seat: number; ends: number; banked: boolean; bot?: PlayerAction } | null
  nextHand: number | null
  chat: ChatLine[]
  stats: { rows: number; hands: number; actions: number }
  budget: { day: string; rows: number } // rows written today, UTC
  public?: boolean // no host, anyone seated adds bots, and bots make way for people
  waiting?: { token: string; name: string }[] // public only, watchers a bot is standing up for
}

export type Command =
  | { t: 'act'; action: { type: string; to?: number } }
  | { t: 'leave' | 'back' | 'topUp' }
  | { t: 'addBot' }
  | { t: 'removeBot'; seat: number }
  | { t: 'chat'; text: string }
  | { t: 'emote'; i: number }

export function newRoom(isPublic = false): Room {
  return {
    public: isPublic,
    waiting: [],
    table: createTable(MAX_SEATS, SMALL_BLIND, BIG_BLIND),
    members: Array<null>(MAX_SEATS).fill(null),
    host: null,
    seq: 0,
    hand: 0,
    dealt: false,
    last: null,
    turn: null,
    nextHand: null,
    chat: [],
    stats: { rows: 0, hands: 0, actions: 0 },
    budget: { day: '', rows: 0 },
  }
}

const reject = (why: string): never => {
  throw new Error(why)
}

const live = (r: Room) => r.table.street !== 'waiting' && r.table.street !== 'complete'
export const seatOf = (r: Room, token: string) => r.members.findIndex((m) => m?.token === token)
const today = (now: number) => new Date(now).toISOString().slice(0, 10)

const grace = (r: Room) => (r.public ? PUBLIC_GRACE_MS : GRACE_MS)
const cap = (r: Room) => (r.public ? PUBLIC_DAILY_ROWS : DAILY_ROWS)

export function spent(r: Room, now: number) {
  return r.budget?.day === today(now) && r.budget.rows >= cap(r)
}

// the caller says what a save cost, it's the one that knows
export function charge(r: Room, rows: number, now: number) {
  if (r.budget?.day !== today(now)) r.budget = { day: today(now), rows: 0 }
  r.budget.rows += rows
  r.stats.rows += rows
}

export function cleanName(name: string) {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, NAME_MAX) || 'Guest'
}

function expired(r: Room, m: Member, now: number) {
  return m.outSince !== null && now >= m.outSince + grace(r)
}

function ready(r: Room, i: number, now: number) {
  const m = r.members[i]
  const seat = r.table.seats[i]
  if (!m || !seat || m.leaving || seat.sittingOut || expired(r, m, now)) return false
  return seat.chips > 0 || m.topUp || !m.token
}

function canDeal(r: Room, now: number) {
  const seats = r.members.flatMap((m, i) => (ready(r, i, now) ? [m!] : []))
  // bots don't play on their own, that's a table burning rows for nobody. A spent room finishes its
  // hand and stops there
  return seats.length >= 2 && seats.some((m) => m.token) && !spent(r, now)
}

function seatBot(view: TableState, seat: number): PlayerAction {
  const bot = botById(view.seats[seat]!.id)
  return decide(view, Math.random, BOT_SIMS, bot?.settings)
}

function startTurn(r: Room, now: number, pause: number) {
  const seat = r.table.toAct
  if (seat < 0) {
    r.turn = null
    return
  }
  const m = r.members[seat]!
  if (!m.token) {
    const bot = seatBot(viewFor(r.table, seat), seat)
    // same pacing as solo, folds come quick
    const think = bot.type === 'fold' ? 350 + Math.random() * 400 : 700 + Math.random() * 900
    r.turn = { seat, ends: now + pause + think, banked: false, bot }
  } else {
    const out = r.table.seats[seat]!.sittingOut
    r.turn = { seat, ends: now + pause + (out ? OUT_MS : TURN_MS), banked: false }
  }
}

// After anything that moved the hand along: start the next turn, or line up the next hand.
function moved(r: Room, now: number, boardBefore: number) {
  const added = r.table.board.length - boardBefore
  if (r.table.street === 'complete') {
    r.turn = null
    r.nextHand = now + NEXT_HAND_MS + (added > 1 ? added * RUN_OUT_MS : added ? STREET_PAUSE_MS : 0)
  } else startTurn(r, now, added ? STREET_PAUSE_MS : 0)
}

function play(r: Room, seat: number, action: Said, now: number) {
  const boardBefore = r.table.board.length
  r.table = applyAction(r.table, action.type === 'timeout' ? action : { ...action, seat })
  r.last = { seat, action }
  r.dealt = false
  r.stats.actions++
  moved(r, now, boardBefore)
}

function remove(r: Room, i: number) {
  r.table = applyAction(r.table, { type: 'leave', seat: i })
  r.members[i] = null
}

// Leavers and anyone past their grace go, but only between hands with nothing lined up,
// or they'd vanish while their winnings were still flying to them.
function sweep(r: Room, now: number) {
  if (live(r) || r.nextHand) return false
  let changed = false
  r.members.forEach((m, i) => {
    if (m && (m.leaving || expired(r, m, now))) {
      remove(r, i)
      changed = true
    }
  })
  // bots go with the last person at a public table, or a watcher keeping it awake leaves them sitting
  // there for whoever turns up next
  if (r.public && !r.members.some((m) => m?.token)) {
    r.members.forEach((m, i) => {
      if (!m) return
      remove(r, i)
      changed = true
    })
  }
  return changed
}

function sit(r: Room, seat: number, token: string, name: string) {
  const id = `guest:${crypto.randomUUID().slice(0, 8)}`
  r.table = applyAction(r.table, { type: 'sit', seat, id, chips: BUY_IN })
  r.members[seat] = { token, name: cleanName(name), bank: BANK_MS, leaving: false, topUp: false, outSince: null }
}

// gone after the hand it's in
function standBot(r: Room, seat: number, now: number) {
  r.members[seat]!.leaving = true
  r.table = applyAction(r.table, { type: 'sitOut', seat })
  sweep(r, now)
}

function deal(r: Room, now: number, online: Set<string>) {
  r.nextHand = null
  sweep(r, now)
  // whoever a bot just stood up for, if they stuck around to watch
  for (const w of (r.waiting ?? []).filter((w) => online.has(w.token))) {
    const seat = SEAT_ORDER.find((i) => !r.members[i])
    if (seat !== undefined) sit(r, seat, w.token, w.name)
  }
  r.waiting = []
  r.members.forEach((m, i) => {
    const seat = r.table.seats[i]
    if (!m || !seat) return
    // free top-ups, and a bust bot buys straight back in
    if ((m.topUp || !m.token) && seat.chips < BUY_IN) {
      r.table = applyAction(r.table, { type: 'topUp', seat: i, chips: BUY_IN - seat.chips })
    }
    m.topUp = false
  })
  if (!canDeal(r, now)) return
  r.table = applyAction(r.table, { type: 'deal', deck: shuffledDeck() })
  r.hand++
  r.dealt = true
  r.last = null
  r.stats.hands++
  r.table.seats.forEach((seat, i) => {
    const m = r.members[i]!
    if (seat?.cards.length && m.token) m.bank = Math.min(BANK_MS, m.bank + BANK_REFILL_MS)
  })
  startTurn(r, now, DEAL_PAUSE_MS)
}

// with nothing lined up, a table that could play gets a hand coming
function settle(r: Room, now: number) {
  if (!live(r) && !r.nextHand && canDeal(r, now)) r.nextHand = now + READY_MS
}

export function nextWake(r: Room) {
  const times = [r.turn?.ends, r.nextHand ?? undefined]
  // a grace that runs out mid-hand can only be acted on once the hand's done, and the deal step
  // sweeps then. Waking for it before that finds nothing to do, then wakes again straight away
  const sweepable = !live(r) && !r.nextHand
  for (const m of r.members) if (sweepable && m?.outSince != null) times.push(m.outSince + grace(r))
  // a resting room gets itself going again at midnight UTC, nobody has to poke it
  if (r.budget?.rows >= cap(r)) times.push(Date.parse(r.budget.day) + 24 * 3600_000)
  const due = times.filter((t): t is number => t !== undefined)
  return due.length ? Math.min(...due) : null
}

// Whatever's come due. online is who has a socket open, the time bank only runs for them.
// The caller bumps seq if anything changed, it compares the room before and after
export function tick(r: Room, now: number, online: Set<string>) {
  let changed = false
  // a new day clears the budget here, or the midnight wake would keep pointing at the old one
  if (r.budget?.rows >= cap(r) && r.budget.day !== today(now)) {
    r.budget = { day: today(now), rows: 0 }
    changed = true
  }
  const turn = r.turn
  if (turn && now >= turn.ends) {
    const m = r.members[turn.seat]!
    const out = r.table.seats[turn.seat]!.sittingOut
    changed = true
    if (turn.bot) {
      let action = turn.bot
      try {
        applyAction(r.table, { ...action, seat: turn.seat })
      } catch {
        action = { type: r.table.currentBet > r.table.seats[turn.seat]!.bet ? 'fold' : 'check', seat: turn.seat }
      }
      play(r, turn.seat, action, now)
    } else if (!out && !turn.banked && m.bank > 0 && online.has(m.token!)) {
      turn.banked = true
      turn.ends = now + m.bank
      m.bank = 0
    } else {
      if (turn.banked) m.bank = 0
      if (!out && !m.leaving) m.outSince = now
      play(r, turn.seat, { type: 'timeout' }, now)
    }
  }
  if (r.nextHand && now >= r.nextHand) {
    deal(r, now, online)
    changed = true
  }
  if (sweep(r, now)) changed = true
  settle(r, now)
  if (stalled(r, online, now)) changed = true
  return changed
}

// A new socket for this token. Their seat if they have one, else the first open seat, else they watch.
// A public seat whose player left while nothing was being dealt would hold its chair for good, since
// only a turn ever times anyone out. So when a socket goes or the table stops dealing, anyone offline
// starts their grace. Says whether it changed anything
export function stalled(r: Room, online: Set<string>, now: number) {
  if (!r.public || live(r) || r.nextHand) return false
  let changed = false
  r.members.forEach((m, i) => {
    if (!m?.token || online.has(m.token) || m.outSince !== null) return
    m.outSince = now
    if (!r.table.seats[i]!.sittingOut) r.table = applyAction(r.table, { type: 'sitOut', seat: i })
    changed = true
  })
  return changed
}

// At a full public table a bot stands up after the hand for each watcher who asks, and the deal seats them.
export function join(r: Room, token: string, name: string, now: number) {
  if (!r.public) r.host ??= token
  const mine = seatOf(r, token)
  if (mine >= 0) {
    r.members[mine]!.name = cleanName(name)
    return
  }
  const seat = SEAT_ORDER.find((i) => !r.members[i])
  if (seat === undefined) {
    const waiting = (r.waiting ??= [])
    // a waiter reconnecting doesn't cost another bot its seat
    if (!r.public || waiting.some((w) => w.token === token)) return
    const bot = r.members.findIndex((m) => m && !m.token && !m.leaving)
    if (bot < 0) return
    standBot(r, bot, now)
    // between hands it's gone already, so no need to wait
    if (r.members[bot]) return void waiting.push({ token, name: cleanName(name) })
    sit(r, bot, token, name)
  } else sit(r, seat, token, name)
  settle(r, now)
}

// Everything a socket can ask for. Throws on anything not allowed. Chat and emotes don't touch the
// table, so it says which it was.
export function command(r: Room, token: string, cmd: Command, now: number): 'chat' | 'emote' | 'table' {
  const seat = seatOf(r, token)
  const m = r.members[seat]

  if (cmd.t === 'emote') {
    if (!m) reject('not seated')
    if (!Number.isInteger(cmd.i) || !EMOTES[cmd.i]) reject('bad emote')
    return 'emote'
  }

  if (cmd.t === 'chat') {
    const text = String(cmd.text ?? '').trim().slice(0, CHAT_MAX)
    if (!text) reject('empty')
    if (spent(r, now)) reject('room is resting')
    const name = m?.name ?? 'Watcher'
    r.chat = [...r.chat, { name, text, at: now }].slice(-CHAT_KEPT)
    return 'chat'
  }

  if (cmd.t === 'addBot' || cmd.t === 'removeBot') {
    // public tables have no host. Anyone seated fills the empty chairs, nobody can send a bot off
    if (r.public ? !m || cmd.t === 'removeBot' : token !== r.host) reject('host only')
    if (cmd.t === 'addBot') {
      const open = SEAT_ORDER.filter((i) => !r.members[i])
      if (!open.length) reject('table full')
      const taken = r.table.seats.flatMap((s) => (s ? [s.id] : []))
      randomBots(r.public ? open.length : 1, taken).forEach((bot, k) => {
        const seat = open[k]!
        r.table = applyAction(r.table, { type: 'sit', seat, id: bot.id, chips: BUY_IN })
        r.members[seat] = { token: null, name: bot.name, bank: 0, leaving: false, topUp: false, outSince: null }
      })
    } else {
      const bot = r.members[cmd.seat]
      if (!bot || bot.token) reject('not a bot')
      standBot(r, cmd.seat, now)
    }
  } else {
    if (!m) reject('not seated')
    const me = m!
    if (cmd.t === 'act') {
      const type = cmd.action?.type
      // showing is after the hand, the engine checks it
      if (type === 'show') r.table = applyAction(r.table, { type, seat })
      else {
        if (r.turn?.seat !== seat || r.table.toAct !== seat) reject('not your turn')
        if (type !== 'fold' && type !== 'check' && type !== 'call' && type !== 'raise') reject('bad action')
        const action = (type === 'raise' ? { type, seat, to: Number(cmd.action.to) } : { type, seat }) as PlayerAction
        applyAction(r.table, action) // throws before the bank gets touched
        if (r.turn!.banked) me.bank = Math.max(r.turn!.ends - now, 0)
        play(r, seat, action, now)
      }
    } else if (cmd.t === 'leave') {
      me.leaving = true
      if (!r.table.seats[seat]!.sittingOut) r.table = applyAction(r.table, { type: 'sitOut', seat })
      // gone means gone, nobody waits out their clock
      if (r.turn?.seat === seat) r.turn.ends = Math.min(r.turn.ends, now + OUT_MS)
      sweep(r, now)
    } else if (cmd.t === 'back') {
      me.outSince = null
      if (r.table.seats[seat]!.sittingOut && !me.leaving) {
        r.table = applyAction(r.table, { type: 'sitIn', seat })
        // back while their turn was being played out for them, so they get a proper clock
        if (r.turn?.seat === seat) r.turn.ends = now + TURN_MS
      }
    } else if (cmd.t === 'topUp') {
      me.topUp = !me.topUp
      const chips = BUY_IN - r.table.seats[seat]!.chips
      if (me.topUp && !live(r) && !r.nextHand && chips > 0) {
        r.table = applyAction(r.table, { type: 'topUp', seat, chips })
        me.topUp = false
      }
    } else reject('unknown')
  }
  settle(r, now)
  return 'table'
}

// What one socket gets. Only ever viewFor, and never anyone's token or a bot's next move.
export function viewOf(r: Room, token: string, online: Set<string>, now: number) {
  const seat = seatOf(r, token)
  const m = r.members[seat]
  const turn = r.turn && r.members[r.turn.seat]?.token ? r.turn : null
  return {
    t: 'state' as const,
    seq: r.seq,
    hand: r.hand,
    acts: r.stats.actions,
    dealt: r.dealt,
    last: r.last,
    table: viewFor(r.table, seat >= 0 ? seat : null),
    seats: r.members.map(
      (x) => x && { name: x.name, bot: !x.token, away: !!x.token && !online.has(x.token), out: x.outSince !== null },
    ),
    me: seat >= 0 ? seat : null,
    host: token === r.host,
    public: !!r.public,
    waiting: !!r.waiting?.some((w) => w.token === token),
    bank: m?.bank ?? 0,
    topUp: m?.topUp ?? false,
    resting: spent(r, now),
    turn: turn && { seat: turn.seat, ms: Math.max(turn.ends - now, 0), banked: turn.banked },
  }
}

export type RoomView = ReturnType<typeof viewOf>
