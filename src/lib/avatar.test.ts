import { describe, expect, it } from 'vitest'
import { PALETTE, quantize, SIZE } from './avatar'

const fill = (r: number, g: number, b: number, a = 255) => Array.from({ length: SIZE * SIZE }, () => [r, g, b, a]).flat()

describe('quantize', () => {
  it('maps exact palette colours to themselves', () => {
    PALETTE.forEach((hex, i) => {
      if (!i) return
      const [r, g, b] = [1, 3, 5].map((j) => parseInt(hex.slice(j, j + 2), 16))
      expect(quantize(fill(r!, g!, b!))[0]).toBe(i)
    })
  })

  it('snaps near colours and erases see-through pixels', () => {
    expect(quantize(fill(250, 250, 250))[0]).toBe(2)
    expect(quantize(fill(20, 10, 15))[0]).toBe(1)
    expect(quantize(fill(40, 110, 220))[0]).toBe(11)
    expect(quantize(fill(255, 0, 0, 20))[0]).toBe(0)
    // the bug that sank redmean: dark hair came out felt green
    expect(quantize(fill(50, 40, 35))[0]).toBe(3)
  })
})
