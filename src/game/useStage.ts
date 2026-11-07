// The engine jumps straight to a state, so everything between two states is staged here: chips
// flying, the board turning one street at a time, the payout. Solo and rooms both drive the table
// through this, which is what makes a remote player's bet look exactly like a bot's.

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { viewFor, type Action, type PlayerAction, type TableState } from '../engine/engine'
import { haptic } from '../lib/haptics'
import { sound } from '../lib/sound'
import { actionText, saidKind } from './betting'
import { liveOpponents } from './bot'
import { MAX_STACK, payOrder, plan, potLayout, ready, settle, splitKept, total, type Piles, type Trip } from './piles'
import { chipMoves, payouts, winnings, type Move, type Spot, type WorkerRequest } from './solo'
import { bankOut, DROP_HIT_MS, SWEEP_LAND_MS } from './Pieces'

const STREET_MS = 550
const RUN_OUT_MS = 1100 // an all-in is the good bit, so let each card land
const PAY_MS = 900
const STAGGER_MS = 40
const MAX_STAGGER_MS = 420
const MOVE_GAP_MS = 90
const BANK_GAP_MS = 250 // after a payout pile settles, before its next band goes

const stagger = (order: number) => Math.min(order * STAGGER_MS, MAX_STAGGER_MS)

const BUZZ: Record<string, 'light' | 'medium' | 'heavy' | null> = { check: 'light', call: 'light', opens: 'medium', raise: 'medium', allin: 'heavy', fold: null }

// one chip in the air. start is where a flick let go of it, if it was flicked
export type Flight = Trip & { id: number; delay: number; start?: DOMRect }

let nextId = 0

export function ask<T>(worker: Worker | null, request: WorkerRequest) {
  return new Promise<T>((resolve, reject) => {
    if (!worker) return reject(new Error('no worker'))
    const id = nextId++
    const finish = (run: () => void) => {
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
      run()
    }
    const onMessage = ({ data }: MessageEvent<{ id: number; result: T }>) => {
      if (data.id === id) finish(() => resolve(data.result))
    }
    const onError = () => finish(() => reject(new Error('worker failed')))
    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onError)
    worker.postMessage({ ...request, id })
  })
}

// me is null for someone watching. startPaid is whether a reload landed after the payout already ran
export function useStage(table: TableState, me: number | null, startPaid: boolean, onPaid: () => void) {
  const view = useMemo(() => viewFor(table, me), [table, me])

  const [hand, setHand] = useState(0)
  const [shown, setShown] = useState(table.board.length)
  const [paid, setPaid] = useState(startPaid)
  const [said, setSaid] = useState<Record<number, string>>({})
  const [flights, setFlights] = useState<Flight[]>([])
  const [piles, setPiles] = useState<Piles>({})
  // bets waiting to go into the pot once what's in the air has landed
  const [sweep, setSweep] = useState<Move[]>([])
  // uncalled bets sitting on their piles until the payout takes them onto their owner's payout pile
  const [kept, setKept] = useState<Move[]>([])
  // each payout pile's last banked band: n counts them, by is how many chips the rest fell, gone is every chip
  // banked so far, band is the chips that just went so they can shrink away instead of blinking out
  const [drops, setDrops] = useState<Record<number, { n: number; by: number; gone: number; band: number[] }>>({})
  // ponytail: never pruned, ids are unique and it's a few hundred numbers a session
  const [landed, setLanded] = useState<ReadonlySet<number>>(new Set())
  const [odds, setOdds] = useState<{ key: string; chance: number } | null>(null)
  // seats someone new sat down in since the last state
  const [arrivals, setArrivals] = useState<number[]>([])
  const worker = useRef<Worker>(null)

  const dealing = shown < table.board.length
  const over = table.street === 'complete'
  const idle = table.street === 'waiting' || (over && paid)
  const board = view.board.slice(0, shown)
  const mine = me === null ? null : view.seats[me]
  const inHand = !!mine && mine.cards.length > 0 && !mine.folded

  // the chips really on the felt. Only falls back to the engine's amounts with nothing moving or waiting to.
  // Payout piles aren't the engine's at all, settle leaves them be
  const onFelt = flights.length || sweep.length ? piles : settle(piles, table, paid, kept)
  const inbound: Piles = {}
  for (const flight of flights) (inbound[flight.to] ??= []).push(flight.value)
  const paying = Object.entries(onFelt).filter(([spot, chips]) => spot.startsWith('win') && chips?.length) as [Spot, number[]][]

  // turns has each move wait for the one before to touch down, the sweep going round the table a seat at a time
  const fly = (moves: Move[], { from, felt = onFelt, turns = false }: { from?: DOMRect; felt?: Piles; turns?: boolean } = {}) => {
    const { piles: left, trips } = plan(felt, moves, inbound)
    const starts = moves.map((_, m) => m * MOVE_GAP_MS)
    if (turns) {
      for (let m = 1; m < moves.length; m++) {
        const last = Math.max(0, ...trips.filter((trip) => trip.move === m - 1).map((trip) => trip.order))
        starts[m] = starts[m - 1]! + stagger(last) + SWEEP_LAND_MS
      }
    }
    setPiles(left)
    setFlights((prev) => [
      ...prev,
      ...trips.map((trip) => ({
        ...trip,
        id: nextId++,
        delay: stagger(trip.order) + starts[trip.move]!,
        start: from && trip.move === 0 && trip.from === `seat-${me}` ? from : undefined,
      })),
    ])
  }

  // ChipFlight holds on to the first onLand it gets, so this can't read flights. The effect below moves
  // landed chips onto their piles
  const land = (flight: Flight) => setLanded((prev) => new Set(prev).add(flight.id))

  useEffect(() => {
    const done = ready(flights, (f) => landed.has(f.id))
    if (!done.length) return
    // on purpose. The landing timing was matched frame by frame with this running after paint
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFlights((prev) => prev.filter((f) => !done.includes(f)))
    setPiles((prev) => {
      const next = { ...prev }
      for (const f of done) if (!f.to.startsWith('seat')) next[f.to] = [...(next[f.to] ?? []), f.value]
      return next
    })
  }, [flights, landed])

  const arrived = (next: TableState) =>
    setArrivals(next.seats.flatMap((seat, i) => (seat && seat.id !== table.seats[i]?.id ? [i] : [])))

  // table is about to become next because seat did action. Call it before the table changes
  const acted = (next: TableState, action: Action, seat: number, from?: DOMRect) => {
    const text = actionText(table, action)
    const kind = text ? saidKind(text) : ''
    // your own moves only, bots buzzing your phone all hand would get old fast. A fold gets nothing
    if (seat === me) {
      const buzz = BUZZ[kind]
      if (buzz !== null) haptic(buzz ?? 'light')
    }
    // everyone's though, the table should sound like a table. Bets make their noise when the chips land
    // the fold borrows the deal's card sound for now, lower so it doesn't read as a card arriving
    if (kind === 'fold') sound('fold', { rate: 0.8, volume: 0.8 })
    if (kind === 'check') sound('check')
    const moves = chipMoves(table, next)
    fly(moves.now, { from })
    if (moves.sweep.length) setSweep((prev) => [...prev, ...moves.sweep])
    if (moves.kept.length) setKept((prev) => [...prev, ...moves.kept])
    if (text) setSaid((prev) => (next.street === table.street ? { ...prev, [seat]: text } : { [seat]: text }))
  }

  const dealt = (next: TableState) => {
    arrived(next)
    setHand((n) => n + 1)
    setShown(0)
    setPaid(false)
    setSaid({})
    setOdds(null)
    setDrops({})
    setKept([])
    const moves = chipMoves(table, next, true)
    fly(moves.now, { felt: {} })
    setSweep(moves.sweep)
    haptic('light')
  }

  // straight to a state with nothing staged, for a reconnect. Cards and piles just are where they are
  const reset = (next: TableState) => {
    setFlights([])
    setPiles({})
    setSweep([])
    setKept([])
    setDrops({})
    setShown(next.board.length)
    setPaid(next.street === 'complete')
  }

  useEffect(() => {
    const created = new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module' })
    worker.current = created
    return () => created.terminate()
  }, [])

  useEffect(() => {
    if (!dealing) return
    const timer = setTimeout(() => setShown((n) => (n ? n + 1 : 3)), over ? RUN_OUT_MS : STREET_MS)
    return () => clearTimeout(timer)
  }, [dealing, shown, over])

  // the bets go in once everything in the air is down. Which chips of an uncalled bet stay put is only known now,
  // with the closing call on its pile
  const onSweep = useEffectEvent(() => {
    const split = splitKept(piles, sweep, kept)
    fly(split.sweep, { turns: true })
    setKept(split.kept)
    setSweep([])
  })
  useEffect(() => {
    // the last landing is a state change too, there's no event to hang this on
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!flights.length && sweep.length) onSweep()
  }, [flights.length, sweep.length])

  // A payout pile banks from the bottom a band at a time: the band goes, the rest fall onto the felt, and once
  // they've hit and had BANK_GAP_MS to settle the next one goes. Every winner's pile at once
  const onBank = useEffectEvent(() => {
    const next = { ...piles }
    const fell = { ...drops }
    let thud = false
    for (const [spot, chips] of paying) {
      const seat = Number(spot.slice(4))
      const band = chips.findIndex((value) => value !== chips[0])
      const by = band < 0 ? chips.length : band
      next[spot] = chips.slice(by)
      fell[seat] = { n: (drops[seat]?.n ?? 0) + 1, by, gone: (drops[seat]?.gone ?? 0) + by, band: chips.slice(0, by) }
      bankOut(seat, chips.slice(0, by))
      if (by < chips.length) thud = true
    }
    if (thud) sound('chip', { delay: DROP_HIT_MS })
    setPiles(next)
    setDrops(fell)
  })
  const banking = paying.length > 0
  useEffect(() => {
    if (flights.length || !banking) return
    const started = Object.keys(drops).length > 0
    const timer = setTimeout(onBank, (started ? DROP_HIT_MS : 0) + BANK_GAP_MS)
    return () => clearTimeout(timer)
  }, [flights.length, banking, drops])

  const moving = flights.length > 0 || sweep.length > 0 || banking

  const onSettled = useEffectEvent(() => {
    fly(payOrder(onFelt.pot ?? [], [...kept, ...payouts(table)]))
    setKept([])
    setPaid(true)
    onPaid()
    const won = me !== null && winnings(table, me) > 0
    haptic(won ? 'success' : 'light')
    sound('collide', { volume: won ? 1 : 0.5 })
  })

  useEffect(() => {
    if (!over || dealing || paid || moving) return
    const timer = setTimeout(onSettled, PAY_MS)
    return () => clearTimeout(timer)
  }, [over, dealing, paid, moving])

  // from what's on screen, or the helper would give away a run out. Stops once the hand's
  // over too, a number against a random hand is nonsense with both hands face up
  const cards = inHand ? mine.cards : null
  const oddsKey = cards && !over && !idle ? `${cards.join()}/${board.join()}` : null
  const opponents = me === null ? 0 : liveOpponents(view, me)
  const onOdds = useEffectEvent(() => cards && { kind: 'equity' as const, cards, board, opponents })

  useEffect(() => {
    const request = oddsKey ? onOdds() : null
    if (!request) return
    let stale = false
    ask<number>(worker.current, request)
      .then((chance) => {
        if (!stale) setOdds({ key: oddsKey!, chance })
      })
      .catch(() => {}) // the helper just stays blank
    return () => {
      stale = true
    }
  }, [oddsKey])

  return {
    view,
    hand,
    board,
    said,
    flights,
    paid,
    over,
    idle,
    dealing,
    moving,
    arrivals,
    // nothing new should start while this is true, every move picks up the chips that are sitting
    // somewhere, so one that starts before the last lands would miss the late ones
    busy: dealing || moving || (over && !paid),
    worker,
    chance: odds?.key === oddsKey ? (odds?.chance ?? null) : null,
    // nothing counts at its destination until the flight has landed it there, and winnings only once they're banked
    stack: (seat: number) =>
      (view.seats[seat]?.chips ?? 0) -
      (over && !paid ? winnings(table, seat) : 0) -
      kept.reduce((sum, move) => sum + (move.to === `win-${seat}` ? move.amount : 0), 0) -
      total(inbound[`seat-${seat}`]) -
      total(inbound[`win-${seat}`]) -
      total(onFelt[`win-${seat}`]),
    pile: (spot: Spot) => onFelt[spot] ?? [],
    drop: (seat: number) => drops[seat] ?? { n: 0, by: 0, gone: 0, band: [] },
    // stacks are laid out for chips still on their way too, so the row opens up as they set off
    potStacks: potLayout([...(onFelt.pot ?? []), ...(inbound.pot ?? [])]).map(({ value, part }) => ({
      value,
      part,
      count: Math.min(Math.max((onFelt.pot ?? []).filter((v) => v === value).length - part * MAX_STACK, 0), MAX_STACK),
    })),
    land,
    acted,
    dealt,
    reset,
  }
}

export type Stage = ReturnType<typeof useStage>

// what the table needs on top of the staging, from whichever loop is driving it
export type TableGame = Stage & {
  me: number | null
  act: (action: PlayerAction, from?: DOMRect) => void
  nameOf: (seat: number) => string
  tagOf?: (seat: number) => string | null
  artOf?: (seat: number) => string | null // a signed-in player's pixel art
  reportArt?: (seat: number) => void // only for other people's pictures
  emoteOf?: (seat: number) => { text: string; key: number } | null // a room's emote, shown over the seat
  // of is the whole length the bar drains from, key restarts it
  clock?: { seat: number; ms: number; of: number; banked: boolean; key: number } | null
  deal?: () => void
  bustLeaves?: boolean // solo swaps a bust bot out, a room keeps everyone seated
  topUp: boolean
  toggleTopUp?: () => void // a room keeps its top up in the room panel, the bar's full
  leave: () => void
}
