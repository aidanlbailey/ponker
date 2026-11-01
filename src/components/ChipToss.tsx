import type { CSSProperties } from 'react'
import { Chip } from './Chip'

export type Toss = {
  id: number
  direction: 'fall' | 'rise'
  color: string
  style: CSSProperties
}

const CHIP_SIZE = 132
let nextId = 0

const spread = (range: number) => (Math.random() - 0.5) * range

export function createToss(direction: Toss['direction'], color: string, from: DOMRect): Toss {
  const duration = direction === 'fall' ? 1.2 + Math.random() * 0.4 : 2 + Math.random() * 0.6

  return {
    id: nextId++,
    direction,
    color,
    style: {
      left: from.left + from.width / 2 - CHIP_SIZE / 2,
      top: from.top + from.height / 2 - CHIP_SIZE / 2,
      '--toss-duration': `${duration}s`,
      '--toss-x': `${spread(500)}px`,
      '--toss-rotation': `${spread(1440)}deg`,
    } as CSSProperties,
  }
}

type ChipTossProps = { tosses: Toss[]; onDone: (id: number) => void }

export function ChipToss({ tosses, onDone }: ChipTossProps) {
  return tosses.map(({ id, direction, color, style }) => (
    <div key={id} className={`toss ${direction}`} style={style} onAnimationEnd={() => onDone(id)}>
      <Chip color={color} />
    </div>
  ))
}
