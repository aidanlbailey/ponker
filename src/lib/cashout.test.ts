import { describe, expect, it } from 'vitest'
import { cashoutBreakdown, cashoutText } from './cashout'
import { formatMoney, nearestColor } from './chips'

const chip = (value: number, count = 1, color = '#dc3545') => ({ value, count, color })

describe('cashoutBreakdown', () => {
  it('uses bills once any chip is worth a dollar or more', () => {
    expect(cashoutBreakdown(136.5, [chip(100), chip(0.25)])).toEqual([
      '1 $100 bill',
      '1 $20 bill',
      '1 $10 bill',
      '1 $5 bill',
      '1 $1 bill',
      '2 quarters',
    ])
  })

  it('treats an all $1 table as bills, not 400 quarters', () => {
    expect(cashoutBreakdown(100, [chip(1, 100)])).toEqual(['1 $100 bill'])
  })

  it('stays in coins for penny stakes, however big the pile', () => {
    expect(cashoutBreakdown(2.41, [chip(0.25), chip(0.01)])).toEqual(['9 quarters', '1 dime', '1 nickel', '1 penny'])
  })

  it('pluralizes pennies', () => {
    expect(cashoutBreakdown(0.03, [chip(0.01, 3)])).toEqual(['3 pennies'])
  })

  it('survives float noise', () => {
    expect(cashoutBreakdown(0.1 + 0.2, [chip(0.1, 3)])).toEqual(['1 quarter', '1 nickel'])
  })
})

describe('cashoutText', () => {
  it('returns null with nothing to cash out', () => {
    expect(cashoutText({ red: chip(5, 0) }, 'Sam')).toBeNull()
  })

  it('writes the full message, leaving out empty stacks', () => {
    const chips = { red: chip(5, 2), blue: chip(10, 0, '#007bff'), black: chip(0.25, 1000, '#343a40') }
    expect(cashoutText(chips, 'Sam')).toBe(
      [
        "Sam's chips:",
        '🔴 2 Red chips ($5 each)',
        '⚫ 1,000 Black chips (25¢ each)',
        '',
        'Total: $260',
        'Cashout: 2 $100 bills, 1 $50 bill, 1 $10 bill',
      ].join('\n'),
    )
  })

  it('names custom colors after the closest swatch instead of the chip id', () => {
    expect(cashoutText({ chip_1712345678: chip(1, 1, '#0000ee') }, '')).toContain('🔵 1 Blue chips')
  })
})

describe('formatting helpers', () => {
  it('only shows cents when there are some', () => {
    expect(formatMoney(100000)).toBe('$100,000')
    expect(formatMoney(0.05)).toBe('$0.05')
    expect(formatMoney(1234.5)).toBe('$1,234.50')
  })

  it('matches palette colors exactly', () => {
    expect(nearestColor('#FFC107').name).toBe('Yellow')
  })
})
