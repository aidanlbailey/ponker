import { describe, expect, it } from 'vitest'
import { dodgeTarget, stepSpring, type Spring } from './dodge'

const size = ({ x, y }: { x: number; y: number }) => Math.hypot(x, y)
const rest = (): Spring => ({ x: 0, y: 0, vx: 0, vy: 0 })

describe('dodgeTarget', () => {
  it('pushes away from the cursor', () => {
    expect(dodgeTarget(30, 0, 100).x).toBeLessThan(0)
    expect(dodgeTarget(0, -30, 100).y).toBeGreaterThan(0)
  })

  it('does nothing out of range', () => {
    expect(dodgeTarget(100, 0, 100)).toEqual({ x: 0, y: 0 })
    expect(dodgeTarget(500, 500, 100)).toEqual({ x: 0, y: 0 })
  })

  it('never pushes past the limit', () => {
    for (let d = 0; d <= 100; d++) expect(size(dodgeTarget(d, 0, 100))).toBeLessThanOrEqual(36.001)
  })

  it('has no jump when the cursor crosses the letter or the edge of its range', () => {
    // the steepest part of the curve moves 1.215px per half pixel of cursor travel
    let previous = dodgeTarget(-110, 0, 100).x
    for (let d = -110; d <= 110; d += 0.5) {
      const current = dodgeTarget(d, 0, 100).x
      expect(Math.abs(current - previous)).toBeLessThan(1.25)
      previous = current
    }
  })
})

describe('stepSpring', () => {
  const settleTime = (hz: number) => {
    const spring = rest()
    let frames = 0
    while (!stepSpring(spring, { x: 30, y: 0 }, 1 / hz) && frames < 5000) frames++
    return frames / hz
  }

  it('settles exactly on target without overshooting', () => {
    const spring = rest()
    let furthest = 0
    for (let i = 0; i < 300; i++) {
      stepSpring(spring, { x: 30, y: 0 }, 1 / 60)
      furthest = Math.max(furthest, spring.x)
    }
    expect(spring.x).toBe(30)
    expect(furthest).toBeLessThanOrEqual(30.05)
  })

  it('takes about the same time at 60Hz and 144Hz', () => {
    expect(Math.abs(settleTime(60) - settleTime(144))).toBeLessThan(0.1)
  })

  it('stays stable through a huge frame gap', () => {
    const spring = rest()
    for (let i = 0; i < 20; i++) stepSpring(spring, { x: 30, y: 0 }, 5)
    expect(Math.abs(spring.x)).toBeLessThan(45)
  })
})
