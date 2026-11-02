import { describe, expect, it } from 'vitest'
import { CHIP_RISE, MAX_LAYERS, STACK_ROOM, landedCount, layerJitter, stackLayers, stackLift } from './stack'

describe('chip stack', () => {
  it('has no layers until there is a second chip', () => {
    expect(stackLayers(0)).toBe(0)
    expect(stackLayers(1)).toBe(0)
    expect(stackLayers(2)).toBe(1)
  })

  it('stops growing at the cap and never outgrows the reserved room', () => {
    expect(stackLayers(MAX_LAYERS + 1)).toBe(MAX_LAYERS)
    expect(stackLayers(5000)).toBe(MAX_LAYERS)
    expect(stackLift(5000)).toBe(STACK_ROOM)
  })

  it('lifts one rise per layer', () => {
    expect(stackLift(4)).toBe(3 * CHIP_RISE)
  })

  it('leaves chips in the air out of the pile', () => {
    expect(landedCount(5, 2)).toBe(3)
    // a remove while the only chip is still flying
    expect(landedCount(0, 1)).toBe(0)
  })

  it('jitters every layer less than the chip ring can hide', () => {
    for (let i = 0; i < MAX_LAYERS; i++) expect(Math.abs(layerJitter(i))).toBeLessThanOrEqual(1.2)
  })
})
