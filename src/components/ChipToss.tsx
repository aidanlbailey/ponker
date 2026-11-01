import type { AnimationEvent, CSSProperties } from 'react'
import { accentColor } from '../lib/chips'
import { Chip } from './Chip'

export type Toss = {
  id: number
  direction: 'fall' | 'rise'
  color: string
  style: CSSProperties
}

const CHIP_SIZE = 132
const EDGE_LAYERS = [-4, -2.5, -1, 1, 2.5, 4]

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

let nextId = 0

export function createToss(direction: Toss['direction'], color: string, from: DOMRect): Toss {
  const side = Math.random() < 0.5 ? -1 : 1
  const turns = 3 + Math.floor(Math.random() * 3)

  return {
    id: nextId++,
    direction,
    color,
    style: {
      left: from.left + from.width / 2 - CHIP_SIZE / 2,
      top: from.top + from.height / 2 - CHIP_SIZE / 2,
      '--toss-duration': `${FLIGHT_MS}ms`,
      // measured from the chip's position so the whole arc stays on screen wherever it sits on the page
      '--toss-drop': `${from.top + CHIP_SIZE * 2}px`,
      '--toss-apex': `${Math.max(120, Math.min(from.top * 0.8, innerHeight * 0.35))}px`,
      '--toss-x': `${side * (120 + Math.random() * 140)}px`,
      '--toss-spin': `${side * turns * 360}deg`,
      '--toss-roll': `${(Math.random() - 0.5) * 180}deg`,
    } as CSSProperties,
  }
}

type ChipTossProps = { tosses: Toss[]; onDone: (id: number) => void }

// sideways drift, gravity and spin each run on their own element, which is what makes the arc a real parabola
export function ChipToss({ tosses, onDone }: ChipTossProps) {
  return tosses.map(({ id, direction, color, style }) => {
    const finish = (e: AnimationEvent) => {
      if (e.target === e.currentTarget) onDone(id)
    }

    return (
      <div key={id} className={`toss ${direction}`} style={style} onAnimationEnd={finish}>
        <div className="toss-height">
          <div className="toss-spin">
            <div className="toss-face back">
              <Chip color={color} />
            </div>
            {EDGE_LAYERS.map((depth) => (
              <i
                key={depth}
                style={{ '--depth': `${depth}px`, '--edge': color, '--stripe': accentColor(color) } as CSSProperties}
              />
            ))}
            <div className="toss-face">
              <Chip color={color} />
            </div>
          </div>
        </div>
      </div>
    )
  })
}
