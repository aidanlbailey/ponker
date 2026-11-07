import { describe, expect, it } from 'vitest'
import { exchange, K, nyDay, PAIR_CAP } from './rating'

describe('exchange', () => {
  it('gives half of K for beating an equal', () => {
    expect(exchange(1000, 1000, 1, false, 0)).toBeCloseTo(K / 2)
    expect(exchange(1000, 1000, 0, false, 0)).toBeCloseTo(-K / 2)
    expect(exchange(1000, 1000, 0.5, false, 0)).toBeCloseTo(0)
  })

  it('pays more for an upset than for the expected win', () => {
    expect(exchange(900, 1100, 1, false, 0)).toBeGreaterThan(exchange(1100, 900, 1, false, 0))
  })

  it('is zero-sum from either side', () => {
    expect(exchange(1040, 970, 1, false, 0)).toBeCloseTo(-exchange(970, 1040, 0, false, 0))
  })

  it('doubles while provisional', () => {
    expect(exchange(1000, 1000, 1, true, 0)).toBeCloseTo(K)
  })

  it('stops at the daily cap per pair', () => {
    expect(exchange(1000, 1000, 1, true, PAIR_CAP - 3)).toBeCloseTo(3)
    expect(exchange(1000, 1000, 0, true, PAIR_CAP - 3)).toBeCloseTo(-3)
    expect(exchange(1000, 1000, 1, false, PAIR_CAP + 5)).toBe(0)
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
