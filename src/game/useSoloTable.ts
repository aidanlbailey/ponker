import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { applyAction, shuffledDeck, viewFor, type Action, type PlayerAction } from '../engine/engine'
import { useStoredState } from '../hooks/useStoredState'
import { haptic } from '../lib/haptics'
import { save } from '../lib/storage'
import { actionText } from './betting'
import { liveOpponents } from './bot'
import { plan, settle, stackValues, total, type Piles, type Trip } from './piles'
import {
  BOT,
  botAction,
  chipMoves,
  endOfHand,
  HERO,
  isSolo,
  newSolo,
  payouts,
  setLeaving,
  startHand,
  winnings,
  type Move,
  type Solo,
  type Spot,
  type WorkerRequest,
} from './solo'

const STORAGE_KEY = 'ponker-solo'
const FRESH = newSolo()
const STREET_MS = 550
const RUN_OUT_MS = 1100 // an all-in is the good bit, so let each card land
const PAY_MS = 900
const THINK_MS = 700
const THINK_SPREAD_MS = 900
const SITTING_OUT_MS = 500

// one chip in the air. start is where a flick let go of it, if it was flicked
export type Flight = Trip & { id: number; delay: number; start?: DOMRect }

const STAGGER_MS = 40
const MAX_STAGGER_MS = 420
const MOVE_GAP_MS = 90

let nextId = 0

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms))

function ask<T>(worker: Worker | null, request: WorkerRequest) {
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

// The engine jumps straight to a state, so everything between two states is
// staged here. An all-in comes back with the whole board and the chips already
// paid, and the table walks up to that one street at a time.
export function useSoloTable() {
  const [solo, setSolo] = useStoredState<Solo>(STORAGE_KEY, FRESH, isSolo)
  const { table } = solo
  const view = useMemo(() => viewFor(table, HERO), [table])

  const [hand, setHand] = useState(0)
  const [shown, setShown] = useState(table.board.length)
  const [paid, setPaid] = useState(false)
  const [said, setSaid] = useState<Record<number, string>>({})
  const [flights, setFlights] = useState<Flight[]>([])
  const [piles, setPiles] = useState<Piles>({})
  const [odds, setOdds] = useState<{ key: string; chance: number } | null>(null)
  const worker = useRef<Worker>(null)

  const dealing = shown < table.board.length
  const over = table.street === 'complete'
  const idle = table.street === 'waiting' || (over && paid)
  const board = view.board.slice(0, shown)
  const me = view.seats[HERO]!
  const inHand = me.cards.length > 0 && !me.folded

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
        start: from && trip.move === 0 && trip.from === `seat-${HERO}` ? from : undefined,
      })),
    ])
  }

  const land = (flight: Flight) => {
    setFlights((prev) => prev.filter((f) => f.id !== flight.id))
    if (!flight.to.startsWith('seat')) setPiles((prev) => ({ ...prev, [flight.to]: [...(prev[flight.to] ?? []), flight.value] }))
  }

  const run = (action: Action, seat: number, from?: DOMRect) => {
    const text = actionText(table, action)
    const next = applyAction(table, action)
    setSolo((prev) => ({ ...prev, table: next }))
    fly(chipMoves(table, next), from)
    if (text) setSaid((prev) => (next.street === table.street ? { ...prev, [seat]: text } : { [seat]: text }))
  }

  const act = (action: PlayerAction, from?: DOMRect) => {
    haptic('light')
    run(action, HERO, from)
  }

  const deal = () => {
    if (!idle) return
    const next = startHand(table, shuffledDeck())
    setHand((n) => n + 1)
    setShown(0)
    setPaid(false)
    setSaid({})
    setOdds(null)
    setSolo((prev) => ({ ...prev, table: next }))
    fly(chipMoves(table, next), undefined, {})
    haptic('light')
  }

  const toggleTopUp = () => {
    if (idle) setSolo((prev) => endOfHand({ ...prev, topUp: true }))
    else setSolo((prev) => ({ ...prev, topUp: !prev.topUp }))
  }

  // saved by hand: the hash change unmounts this before useStoredState's effect gets to run,
  // and a stale leaving flag would throw you straight back out next time you sit down
  const exit = () => {
    save(STORAGE_KEY, FRESH)
    location.hash = ''
  }

  const toggleLeaving = () => {
    if (idle) exit()
    else setSolo((prev) => setLeaving(prev, !prev.leaving))
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

  const onBotAnswer = useEffectEvent((answer: PlayerAction | null) => run(botAction(table, answer), BOT))
  const onSittingOut = useEffectEvent(() => run({ type: 'timeout' }, table.toAct))
  const onSettled = useEffectEvent(() => {
    fly(payouts(table))
    setPaid(true)
    if (solo.leaving) exit()
    else setSolo(endOfHand)
    haptic(winnings(table, HERO) ? 'success' : 'light')
  })

  // Nobody acts and nothing pays out while a chip is moving. Every move picks up the chips that
  // are sitting somewhere, so one that starts before the last lands would miss the late ones
  const moving = flights.length > 0
  const toAct = dealing || moving ? -1 : table.toAct

  useEffect(() => {
    if (toAct !== BOT) return
    let stale = false
    const started = performance.now()
    const think = THINK_MS + Math.random() * THINK_SPREAD_MS
    ask<PlayerAction>(worker.current, { kind: 'decide', view: viewFor(table, BOT) })
      .catch(() => null)
      .then(async (answer) => {
        await wait(think - (performance.now() - started))
        if (!stale) onBotAnswer(answer)
      })
    return () => {
      stale = true
    }
  }, [toAct, table])

  useEffect(() => {
    if (toAct < 0 || !table.seats[toAct]!.sittingOut) return
    const timer = setTimeout(onSittingOut, SITTING_OUT_MS)
    return () => clearTimeout(timer)
  }, [toAct, table])

  useEffect(() => {
    if (!over || dealing || paid || moving) return
    const timer = setTimeout(onSettled, PAY_MS)
    return () => clearTimeout(timer)
  }, [over, dealing, paid, moving])

  // from what's on screen, or the helper would give away a run out. Stops once the hand's
  // over too, a number against a random hand is nonsense with both hands face up
  const cards = inHand ? me.cards : null
  const oddsKey = cards && !over && !idle ? `${cards.join()}/${board.join()}` : null
  const opponents = liveOpponents(view, HERO)
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
    leaving: solo.leaving,
    topUp: solo.topUp,
    chance: odds?.key === oddsKey ? (odds?.chance ?? null) : null,
    // nothing counts at its destination until the flight has landed it there
    stack: (seat: number) => view.seats[seat]!.chips - (over && !paid ? winnings(table, seat) : 0) - total(inbound[`seat-${seat}`]),
    pile: (spot: Spot) => onFelt[spot] ?? [],
    // stacks are laid out for chips still on their way too, so the row opens up as they set off
    potStacks: stackValues([...(onFelt.pot ?? []), ...(inbound.pot ?? [])]).map((value) => ({
      value,
      count: (onFelt.pot ?? []).filter((v) => v === value).length,
    })),
    land,
    act,
    deal,
    toggleTopUp,
    toggleLeaving,
  }
}
