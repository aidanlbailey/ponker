import { describe, expect, it } from 'vitest'
import {
  dodgeTarget,
  fallDirection,
  hasStopped,
  isThrow,
  launch,
  nearestAngle,
  releaseVelocity,
  smack,
  stepFlight,
  stepSpring,
  stumble,
  waddle,
  walkDuration,
  type Spring,
} from './letterPhysics'

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

describe('waddle', () => {
  const from = { x: 400, y: 300 }

  it('starts where it was dropped and ends exactly home, upright', () => {
    expect(waddle(from, 0)).toMatchObject({ x: 400, y: 300, tilt: 0 })
    const end = waddle(from, 1)
    expect(end.x).toBeCloseTo(0)
    expect(end.y).toBeCloseTo(0)
    expect(end.tilt).toBeCloseTo(0)
  })

  it('hops above its straight path and rocks both ways', () => {
    const poses = Array.from({ length: 201 }, (_, i) => waddle({ x: 400, y: 0 }, i / 200))
    expect(Math.min(...poses.map((p) => p.y))).toBeLessThan(-20)
    expect(Math.max(...poses.map((p) => p.y))).toBeCloseTo(0)
    expect(Math.min(...poses.map((p) => p.tilt))).toBeLessThan(-10)
    expect(Math.max(...poses.map((p) => p.tilt))).toBeGreaterThan(10)
  })

  it('takes longer the further it has to go, within limits', () => {
    expect(walkDuration(20)).toBe(800)
    expect(walkDuration(500)).toBeGreaterThan(walkDuration(350))
    expect(walkDuration(5000)).toBe(2600)
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

describe('releaseVelocity', () => {
  it('measures speed over the last moment of the drag', () => {
    const samples = [
      { time: 0, x: 0, y: 0 },
      { time: 950, x: 0, y: 0 },
      { time: 1000, x: 100, y: -50 },
    ]
    expect(releaseVelocity(samples, 1000)).toEqual({ x: 2000, y: -1000 })
  })

  it('reads a pause before letting go as no throw', () => {
    expect(releaseVelocity([{ time: 0, x: 0, y: 0 }, { time: 10, x: 300, y: 0 }], 500)).toEqual({ x: 0, y: 0 })
  })

  it('caps absurd speeds and tells throws from gentle drops', () => {
    const fast = releaseVelocity([{ time: 0, x: 0, y: 0 }, { time: 1, x: 900, y: 0 }], 1)
    expect(fast.x).toBe(4000)
    expect(isThrow(fast)).toBe(true)
    expect(isThrow({ x: 100, y: 100 })).toBe(false)
  })
})

describe('stepFlight', () => {
  const box = { left: 0, right: 1000, top: 0, bottom: 800 }
  const fly = (vx: number, vy = 0, x = 500, y = 400) => {
    const flight = launch(x, y, { x: vx, y: vy })
    for (let i = 0; i < 2000; i++) {
      const side = stepFlight(flight, box, 1 / 60)
      if (side || hasStopped(flight)) return { flight, side }
    }
    return { flight, side: null }
  }

  it('smacks the wall it was thrown at when going fast', () => {
    expect(fly(3000).side).toBe('right')
    expect(fly(-3000).side).toBe('left')
    expect(fly(0, -3000).side).toBe('top')
    expect(fly(0, 3000).side).toBe('bottom')
  })

  it('bounces off softly on a weak hit and stays on screen', () => {
    const { flight, side } = fly(750, 0, 900)
    expect(side).toBeNull()
    expect(flight.x).toBeLessThanOrEqual(1000)
    expect(flight.vx).toBeLessThanOrEqual(0)
  })

  it('stops by itself when thrown across open space', () => {
    expect(fly(700).side).toBeNull()
  })

  it('stays in bounds at top speed even through long frames', () => {
    const flight = launch(990, 790, { x: 4000, y: 4000 })
    for (let i = 0; i < 50; i++) {
      stepFlight(flight, box, 1)
      expect(flight.x).toBeLessThanOrEqual(1000)
      expect(flight.y).toBeLessThanOrEqual(800)
    }
  })
})

describe('getting back up', () => {
  it('unwinds spins the short way', () => {
    expect(nearestAngle(725)).toBe(5)
    expect(nearestAngle(-725)).toBe(-5)
    expect(nearestAngle(190)).toBe(-170)
  })

  it('falls away from the wall', () => {
    expect(fallDirection('left', 0)).toBeGreaterThan(0)
    expect(fallDirection('right', 0)).toBeLessThan(0)
    expect(fallDirection('top', -500)).toBeLessThan(0)
  })

  it('squashes into the wall and hands over to the stumble at the same tilt', () => {
    expect(smack('right', 20, -80, 0).scaleX).toBeCloseTo(0.45)
    expect(smack('top', 20, -80, 0).scaleY).toBeCloseTo(0.45)
    expect(smack('right', 20, -80, 1).scaleX).toBeCloseTo(1)
    expect(smack('right', 20, -80, 1).tilt).toBeCloseTo(stumble(-80, 0).tilt)
  })

  it('slumps part way through, then ends upright with no squash', () => {
    const tilts = Array.from({ length: 101 }, (_, i) => Math.abs(stumble(80, i / 100).tilt))
    const lowest = tilts.indexOf(Math.min(...tilts.slice(0, 45)))
    expect(Math.max(...tilts.slice(lowest, 60))).toBeGreaterThan(tilts[lowest]! + 20)

    const end = stumble(80, 1)
    expect(end.tilt).toBeCloseTo(0)
    expect(end.lift).toBeCloseTo(0)
    expect(end.scaleX).toBeCloseTo(1)
    expect(end.scaleY).toBeCloseTo(1)
  })
})
