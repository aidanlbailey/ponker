import { expect, test } from 'vitest'
import { applyAction, createTable, type TableState } from '../engine/engine'
import { allInLevel, DRUMROLL_MS, isRunout, revealedSeats, RUN_OUT_MS, runoutPause } from './runout'

const act = (table: TableState, type: 'call' | 'check' | 'fold' | 'raise') =>
  applyAction(table, type === 'raise' ? { type, seat: table.toAct, to: table.seats[table.toAct]!.chips + table.seats[table.toAct]!.bet } : { type, seat: table.toAct })

function dealt() {
  let table = createTable(2, 5, 10)
  for (let seat = 0; seat < 2; seat++) table = applyAction(table, { type: 'sit', seat, id: String(seat), chips: 1000 })
  return applyAction(table, { type: 'deal', deck: Array.from({ length: 52 }, (_, i) => i) })
}

test.each(['preflop', 'flop', 'turn', 'river'] as const)('only adds the river build-up with cards left after an all-in on the %s', (street) => {
  let table = dealt()
  while (table.street !== street) table = act(table, table.currentBet > table.seats[table.toAct]!.bet ? 'call' : 'check')
  const shown = table.board.length
  expect(isRunout(table, shown)).toBe(false)
  table = act(act(table, 'raise'), 'call')
  expect(table.street).toBe('complete')
  expect(isRunout(table, shown)).toBe(street !== 'river')
  if (shown < 5) {
    const steps = [0, 3, 4].filter((n) => n >= shown)
    expect(steps.reduce((ms, n) => ms + runoutPause(n), 0)).toBe(steps.length * RUN_OUT_MS + DRUMROLL_MS)
    expect(isRunout(table, 5)).toBe(false)
  }
})

test('folds and normal showdowns get no runout treatment', () => {
  const folded = act(dealt(), 'fold')
  expect(isRunout(folded, 0)).toBe(false)
  let table = dealt()
  while (table.street !== 'complete') table = act(table, table.currentBet > table.seats[table.toAct]!.bet ? 'call' : 'check')
  expect(isRunout(table, 5)).toBe(false)
})

test('the all-in pitch follows the hand state through six players and resets on the next deal', () => {
  let table = createTable(6, 5, 10)
  const deck = Array.from({ length: 52 }, (_, i) => i)
  for (let seat = 0; seat < 6; seat++) table = applyAction(table, { type: 'sit', seat, id: String(seat), chips: 1000 })
  table = applyAction(table, { type: 'deal', deck })
  for (let i = 0; i < 6; i++) {
    expect(allInLevel(table)).toBe(i)
    table = act(table, i ? 'call' : 'raise')
  }
  for (let seat = 0; seat < 6; seat++) {
    if (!table.seats[seat]!.chips) table = applyAction(table, { type: 'topUp', seat, chips: 1000 })
  }
  table = applyAction(table, { type: 'deal', deck })
  expect(allInLevel(table)).toBe(0)
})

test('only includes newly tabled hands in a reveal, including a voluntary show after a fold', () => {
  const before = act(dealt(), 'raise')
  const next = act(before, 'call')
  expect(revealedSeats(before, next)).toEqual([0, 1])
  expect(revealedSeats(next, next)).toEqual([])
  expect(revealedSeats(dealt(), act(dealt(), 'fold'))).toEqual([])
  const folded = act(dealt(), 'fold')
  const winner = folded.seats.findIndex((seat) => seat && !seat.folded)
  const shown = applyAction(folded, { type: 'show', seat: winner })
  expect(revealedSeats(folded, shown)).toEqual([winner])
  const replaced = structuredClone(shown)
  replaced.seats[winner]!.id = 'someone-else'
  expect(revealedSeats(folded, replaced)).toEqual([])
})
