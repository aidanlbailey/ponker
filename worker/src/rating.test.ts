import { describe, expect, it } from 'vitest'
import { BLOCK_HANDS, exchange, K, nyDay, PAIR_CAP, SPREAD } from './rating'

const full = BLOCK_HANDS

describe('exchange', () => {
  it('gives half of K for a full win over an equal, and nothing for breaking even', () => {
    expect(exchange(1000, 1000, full, SPREAD, false, 0)).toBeCloseTo(K / 2)
    expect(exchange(1000, 1000, full, -SPREAD, false, 0)).toBeCloseTo(-K / 2)
    expect(exchange(1000, 1000, full, 0, false, 0)).toBeCloseTo(0)
  })

  it('counts chips, so a tiny lead is a tiny gain', () => {
    expect(exchange(1000, 1000, full, 10, false, 0)).toBeCloseTo((K * 10) / (2 * SPREAD))
  })

  it('expects the better player to be ahead, more so over more hands', () => {
    // breaking even with someone you should beat costs you
    expect(exchange(1100, 1000, full, 0, false, 0)).toBeLessThan(0)
    expect(exchange(1100, 1000, full * 2, 0, false, 0)).toBeCloseTo(2 * exchange(1100, 1000, full, 0, false, 0))
    // a short sitting barely moves anything
    expect(Math.abs(exchange(1100, 1000, 5, 0, false, 0))).toBeLessThan(0.1)
  })

  it('pays more for beating someone better', () => {
    expect(exchange(900, 1100, full, SPREAD, false, 0)).toBeGreaterThan(exchange(1100, 900, full, SPREAD, false, 0))
  })

  it('is zero-sum from either side', () => {
    expect(exchange(1040, 970, 60, 2500, false, 0)).toBeCloseTo(-exchange(970, 1040, 60, -2500, false, 0))
  })

  it('doubles while provisional', () => {
    expect(exchange(1000, 1000, full, SPREAD, true, 0)).toBeCloseTo(K)
  })

  it('stops at the daily cap per pair', () => {
    expect(exchange(1000, 1000, full, SPREAD * 4, true, PAIR_CAP - 3)).toBeCloseTo(3)
    expect(exchange(1000, 1000, full, -SPREAD * 4, true, PAIR_CAP - 3)).toBeCloseTo(-3)
    expect(exchange(1000, 1000, full, SPREAD, false, PAIR_CAP + 5)).toBe(0)
  })

  // the reason it's chips: stopping when you're ahead mustn't pay. Split a block anywhere and the parts add up
  // to the whole, so when you leave can't matter
  it('adds up the same however the hands are split', () => {
    const whole = exchange(1030, 990, 100, 1800, false, 0)
    const parts = exchange(1030, 990, 37, 2600, false, 0) + exchange(1030, 990, 63, -800, false, 0)
    expect(parts).toBeCloseTo(whole)
  })
})

describe('nyDay', () => {
  it('turns over at New York midnight, summer and winter', () => {
    // 03:59 UTC in July is 23:59 EDT, 04:00 is midnight
    expect(nyDay(Date.UTC(2026, 6, 10, 3, 59))).toBe('2026-07-09')
    expect(nyDay(Date.UTC(2026, 6, 10, 4, 0))).toBe('2026-07-10')
    // EST in January, an hour later
    expect(nyDay(Date.UTC(2026, 0, 10, 4, 59))).toBe('2026-01-09')
    expect(nyDay(Date.UTC(2026, 0, 10, 5, 0))).toBe('2026-01-10')
  })
})
