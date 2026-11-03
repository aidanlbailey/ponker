// The engine jumps straight to a state, so everything between two states is staged here: chips
// flying, the board turning one street at a time, the payout. Solo and rooms both drive the table
// through this, which is what makes a remote player's bet look exactly like a bot's.

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { viewFor, type Action, type PlayerAction, type TableState } from '../engine/engine'
import { haptic } from '../lib/haptics'
import { actionText } from './betting'
import { liveOpponents } from './bot'
import { plan, settle, stackValues, total, type Piles, type Trip } from './piles'
import { chipMoves, payouts, winnings, type Move, type Spot, type WorkerRequest } from './solo'

const STREET_MS = 550
const RUN_OUT_MS = 1100 // an all-in is the good bit, so let each card land
const PAY_MS = 900
const STAGGER_MS = 40
const MAX_STAGGER_MS = 420
const MOVE_GAP_MS = 90

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

  // the chips really on the felt. Only falls back to the engine's amounts with nothing moving
  const onFelt = flights.length ? piles : settle(piles, table, paid)
  const inbound: Piles = {}
  for (const flight of flights) (inbound[flight.to] ??= []).push(flight.value)

  const fly = (moves: Move[], from?: DOMRect, felt = onFelt) => {
    const { piles: left, trips } = plan(felt, moves, inbound)
    setPiles(left)
    setFlights((prev) => [
      ...prev,
      ...trips.map((trip) => ({
        ...trip,
        id: nextId++,
        delay: Math.min(trip.order * STAGGER_MS, MAX_STAGGER_MS) + trip.move * MOVE_GAP_MS,
        start: from && trip.move === 0 && trip.from === `seat-${me}` ? from : undefined,
      })),
    ])
  }

  const land = (flight: Flight) => {
    setFlights((prev) => prev.filter((f) => f.id !== flight.id))
    if (!flight.to.startsWith('seat')) setPiles((prev) => ({ ...prev, [flight.to]: [...(prev[flight.to] ?? []), flight.value] }))
  }

  const arrived = (next: TableState) =>
    setArrivals(next.seats.flatMap((seat, i) => (seat && seat.id !== table.seats[i]?.id ? [i] : [])))

  // table is about to become next because seat did action. Call it before the table changes
  const acted = (next: TableState, action: Action, seat: number, from?: DOMRect) => {
    const text = actionText(table, action)
    fly(chipMoves(table, next), from)
    if (text) setSaid((prev) => (next.street === table.street ? { ...prev, [seat]: text } : { [seat]: text }))
  }

  const dealt = (next: TableState) => {
    arrived(next)
    setHand((n) => n + 1)
    setShown(0)
    setPaid(false)
    setSaid({})
    setOdds(null)
    fly(chipMoves(table, next, true), undefined, {})
    haptic('light')
  }

  // straight to a state with nothing staged, for a reconnect. Cards and piles just are where they are
  const reset = (next: TableState) => {
    setFlights([])
    setPiles({})
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

  const moving = flights.length > 0

  const onSettled = useEffectEvent(() => {
    fly(payouts(table))
    setPaid(true)
    onPaid()
    haptic(me !== null && winnings(table, me) ? 'success' : 'light')
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
    // nothing counts at its destination until the flight has landed it there
    stack: (seat: number) =>
      (view.seats[seat]?.chips ?? 0) - (over && !paid ? winnings(table, seat) : 0) - total(inbound[`seat-${seat}`]),
    pile: (spot: Spot) => onFelt[spot] ?? [],
    // stacks are laid out for chips still on their way too, so the row opens up as they set off
    potStacks: stackValues([...(onFelt.pot ?? []), ...(inbound.pot ?? [])]).map((value) => ({
      value,
      count: (onFelt.pot ?? []).filter((v) => v === value).length,
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
  // of is the whole length the bar drains from, key restarts it
  clock?: { seat: number; ms: number; of: number; banked: boolean; key: number } | null
  deal?: () => void
  bustLeaves?: boolean // solo swaps a bust bot out, a room keeps everyone seated
  leaving: boolean
  topUp: boolean
  toggleTopUp?: () => void // a room keeps its top up in the room panel, the bar's full
  toggleLeaving: () => void
}
