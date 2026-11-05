import '@fontsource/roboto/latin-900.css'
import { Fragment, type AnimationEvent, type CSSProperties } from 'react'
import { countStyle } from '../lib/chips'
import { CHIP_RISE, TRACKER_TILT, stackLayers } from '../lib/stack'
import { ChipParts, chipLook, sideStyle } from './Chip'

export type Toss = {
  id: number
  direction: 'fall' | 'rise'
  color: string
  count: number
  style: CSSProperties
}

export const CHIP_SIZE = 132
export const FACE_HEIGHT = CHIP_SIZE * TRACKER_TILT
export const TRACKER_LOOK = chipLook(TRACKER_TILT, CHIP_RISE)

// LAND_MS has to stay in step with the 62% landing in the fall-height keyframes
const FLIGHT_MS = 1100
export const LAND_MS = FLIGHT_MS * 0.62
export const BOUNCE_MS = FLIGHT_MS - LAND_MS

// the tail of fall-height after landing, so the chip count can ride the same bounces
export const BOUNCE: Keyframe[] = [
  { translate: '0 0', easing: 'ease-out' },
  { translate: '0 -26px', offset: 0.368, easing: 'ease-in' },
  { translate: '0 0', offset: 0.684, easing: 'ease-out' },
  { translate: '0 -6px', offset: 0.842, easing: 'ease-in' },
  { translate: '0 0', offset: 0.921 },
  { translate: '0 0' },
]

// the count shrinks evenly past three digits so "1,000" still sits inside the face. Never squashed
export const countLength = (count: number) => ({ '--len': count.toLocaleString('en-US').length }) as CSSProperties

let nextId = 0

// from is the top chip's face. The toss's box is a whole chip square with the face resting along its bottom,
// which is how chips.css draws a .chip-flip at rest
export function createToss(direction: Toss['direction'], color: string, count: number, from: DOMRect): Toss {
  const side = Math.random() < 0.5 ? -1 : 1
  const turns = 3 + Math.floor(Math.random() * 3)
  const top = from.bottom - CHIP_SIZE

  return {
    id: nextId++,
    direction,
    color,
    count,
    style: {
      ...TRACKER_LOOK,
      left: from.left + from.width / 2 - CHIP_SIZE / 2,
      top,
      // the level it lands on or leaves from, for its stripes and to drop its shadow to the pile's foot
      '--n': stackLayers(count),
      '--toss-duration': `${FLIGHT_MS}ms`,
      // measured from the chip's position so the whole arc stays on screen wherever it sits on the page
      '--toss-drop': `${top + CHIP_SIZE * 2}px`,
      '--toss-apex': `${Math.max(120, Math.min(top * 0.8, innerHeight * 0.35))}px`,
      '--toss-x': `${side * (120 + Math.random() * 140)}px`,
      '--toss-spin': `${side * turns * 360}deg`,
      '--toss-roll': `${(Math.random() - 0.5) * 180}deg`,
    } as CSSProperties,
  }
}

type ChipTossProps = { tosses: Toss[]; onDone: (id: number) => void }

// sideways drift, gravity and spin each run on their own element, which is what makes the arc a real parabola
export function ChipToss({ tosses, onDone }: ChipTossProps) {
  return tosses.map(({ id, direction, color, count, style }) => {
    const finish = (e: AnimationEvent) => {
      if (e.target === e.currentTarget) onDone(id)
    }

    return (
      <Fragment key={id}>
        {/* its own layer under the piles, a fixed toss is a stacking context so a shadow inside it would
            darken the pile it lands on. Drifts with the toss but never lifts */}
        <div className={`toss toss-shade ${direction}`} style={style}>
          <span className="flight-shadow" />
        </div>
        <div className={`toss ${direction}`} style={style} onAnimationEnd={finish}>
          <div className="toss-height">
            <div className="toss-spin chip-flip" style={sideStyle(color)}>
              <ChipParts color={color}>
                <span className="toss-count" style={{ ...countStyle(color), ...countLength(count) }}>
                  {count.toLocaleString('en-US')}
                </span>
              </ChipParts>
            </div>
          </div>
        </div>
      </Fragment>
    )
  })
}
