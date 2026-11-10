// Hand history, kept in the browser only. Each hand is the table before the deal and then every step as this
// player saw it, so other people's cards only show if they were shown. Same for solo and rooms.

import { load, save } from '../lib/storage'
import type { Action, TableState } from '../engine/engine'

const KEY = 'ponker-history'
// ponytail: about 20KB a six handed hand, so 50 is around 1MB of localStorage. Trim the states if it ever gets tight
const KEPT = 50

// no action is a jump: a reconnect, or a tab that fell behind and skipped ahead
export type Step = { table: TableState; action?: Action; seat?: number }

export type Hand = {
  id: number
  where: string // Bots, a room's code or a public table's name
  me: number
  names: (string | null)[]
  arts?: (string | null)[] // legacy picture snapshots, no longer used for replay
  users?: (number | null)[] // missing on old hands, whose saved art cannot be checked against reports
  before: TableState
  steps: Step[]
}

const isHands = (data: unknown): data is Hand[] => Array.isArray(data)

export const loadHands = () => load<Hand[]>(KEY, [], isHands)

function store(hand: Hand) {
  save(KEY, [hand, ...loadHands().filter((h) => h.id !== hand.id)].slice(0, KEPT))
}

// what the hand did for you, after the payout
export function netOf(hand: Hand) {
  const end = hand.steps.at(-1)?.table ?? hand.before
  return (end.seats[hand.me]?.chips ?? 0) - (hand.before.seats[hand.me]?.chips ?? 0)
}

export const finished = (hand: Hand) => hand.steps.at(-1)?.table.street === 'complete'

// One per table. Saved once the hand's over and again for anything after it (someone showing), never mid hand,
// so a half played hand you left never turns up in the list
export function recorder(where: string) {
  let hand: Hand | null = null
  const keep = () => hand && finished(hand) && store(hand)
  return {
    // me is null for someone watching, who doesn't get a history
    dealt(before: TableState, next: TableState, me: number | null, names: (string | null)[], users?: (number | null)[]) {
      if (me === null) return void (hand = null)
      // before the deal is the last hand's end, result and all. Only the stacks belong to this one
      const empty: TableState = {
        ...before,
        street: 'waiting',
        board: [],
        toAct: -1,
        currentBet: 0,
        result: null,
        seats: before.seats.map((seat) => seat && { ...seat, cards: [], bet: 0, committed: 0, folded: false, acted: false, shown: false }),
      }
      hand = { id: Date.now(), where, me, names, users, before: empty, steps: [{ table: next, action: { type: 'deal', deck: [] } }] }
    },
    // lost the thread, like a reconnect that lands in a later hand. Whatever's kept stays kept
    drop() {
      hand = null
    },
    step(table: TableState, action: Action, seat: number) {
      if (!hand) return
      hand.steps.push({ table, action, seat })
      keep()
    },
    jump(table: TableState) {
      if (!hand) return
      hand.steps.push({ table })
      keep()
    },
  }
}

export type Recorder = ReturnType<typeof recorder>
