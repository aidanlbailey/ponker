import type { TableState } from '../engine/engine'

export const RUN_OUT_MS = 1100
export const DRUMROLL_MS = 1500
export const REVEAL_MS = 1800
export const REVEAL_FLIP_MS = 450
export const CARD_FLIP_MS = 450

export const allInLevel = (table: TableState) =>
  table.seats.filter((seat) => seat && seat.cards.length > 0 && !seat.folded && seat.chips === 0).length

export function revealedSeats(before: TableState, next: TableState) {
  return next.seats.flatMap((seat, i) =>
    seat?.shown && seat.cards.length === 2 && before.seats[i]?.id === seat.id && !before.seats[i]?.shown ? [i] : [],
  )
}

export const isRunout = (table: TableState, shown: number) =>
  table.street === 'complete' && table.board.length === 5 && shown < 5 &&
  table.seats.filter((seat) => seat && seat.cards.length && !seat.folded).length > 1

export const runoutPause = (shown: number) => RUN_OUT_MS + (shown === 4 ? DRUMROLL_MS : 0)
