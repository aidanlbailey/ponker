import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useChipGestures } from '../hooks/useChipGestures'
import { countStyle, formatMoney, type Chip as ChipData } from '../lib/chips'
import { CHIP_RISE, STACK_ROOM, landedCount, stackLayers, stackLift } from '../lib/stack'
import { ChipStack } from './Chip'
import { BOUNCE, BOUNCE_MS, CHIP_SIZE, FACE_HEIGHT, LAND_MS, TRACKER_LOOK, countLength } from './ChipToss'

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

// scale rather than transform so these don't fight the hover state
export const LANDING = [{ scale: '1' }, { scale: '1.1 0.88' }, { scale: '0.97 1.04' }, { scale: '1' }]
const PLUCK = [{ scale: '1' }, { scale: '0.92' }, { scale: '1.03' }, { scale: '1' }]

type ChipCardProps = {
  id: string
  chip: ChipData
  showValue: boolean
  onAdd: (from: DOMRect) => void
  onRemove: (from: DOMRect) => void
  onEdit: () => void
  onValueChange: (value: number) => void
}

export function ChipCard({ id, chip, showValue, onAdd, onRemove, onEdit, onValueChange }: ChipCardProps) {
  const stack = useRef<HTMLDivElement>(null)
  const chipButton = useRef<HTMLButtonElement>(null)
  const count = useRef<HTMLSpanElement>(null)
  const landings = useRef(new Set<number>())
  const [inFlight, setInFlight] = useState(0)

  const landed = landedCount(chip.count, inFlight)
  const layers = stackLayers(landed)

  useEffect(() => {
    const pending = landings.current
    return () => pending.forEach(clearTimeout)
  }, [])

  // measured off the stack's box, not the button, which grows with the pile and scales on hover
  const topOfPile = (chips: number) => {
    const { left, bottom } = stack.current!.getBoundingClientRect()
    return new DOMRect(left, bottom - FACE_HEIGHT - stackLift(chips), CHIP_SIZE, FACE_HEIGHT)
  }

  const thud = (keyframes: Keyframe[], delay: number) => {
    if (reducedMotion()) return
    for (const part of [chipButton.current, count.current]) {
      part?.animate(keyframes, { duration: 300, delay, easing: 'ease-out' })
    }
  }

  const add = () => {
    onAdd(topOfPile(chip.count + 1))
    thud(LANDING, LAND_MS)
    if (reducedMotion()) return
    count.current?.animate(BOUNCE, { duration: BOUNCE_MS, delay: LAND_MS })
    setInFlight((n) => n + 1)
    const timer = window.setTimeout(() => {
      landings.current.delete(timer)
      setInFlight((n) => n - 1)
    }, LAND_MS)
    landings.current.add(timer)
  }

  const remove = () => {
    onRemove(topOfPile(landed))
    if (chip.count) thud(PLUCK, 0)
  }

  const gestures = useChipGestures({ onSwipeDown: add, onSwipeUp: remove, onEdit })

  return (
    <article className="chip-card" style={{ ...TRACKER_LOOK, '--morph-name': `chip-${id}` } as CSSProperties}>
      <p className="chip-total">{showValue && formatMoney(chip.value * chip.count)}</p>

      <div
        ref={stack}
        className="chip-stack"
        style={{ '--stack-room': `${STACK_ROOM}px`, '--stack-lift': `${layers * CHIP_RISE}px` } as CSSProperties}
      >
        <button
          ref={chipButton}
          className="chip-button"
          aria-label={`${chip.count} chips. Edit chip`}
          title="Click or long press to edit. Swipe down to add, up to remove."
          {...gestures}
        >
          <ChipStack colors={Array<string>(layers + 1).fill(chip.color)} />
        </button>
        <span ref={count} className="chip-count" aria-hidden="true" style={{ ...countStyle(chip.color), ...countLength(landed) }}>
          {landed.toLocaleString('en-US')}
        </span>
      </div>

      <label className="chip-value">
        <span>$</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          aria-label="Chip value in dollars"
          value={chip.value}
          onChange={(e) => onValueChange(Math.max(0, parseFloat(e.target.value) || 0))}
          onClick={(e) => e.currentTarget.select()}
        />
      </label>

      <div className="chip-actions">
        <button className="button danger" aria-label="Remove chip" onClick={remove} />
        <button className="button add" aria-label="Add chip" onClick={add} />
      </div>
    </article>
  )
}
