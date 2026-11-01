import { useRef } from 'react'
import { useChipGestures } from '../hooks/useChipGestures'
import { contrastColor, formatMoney, type Chip as ChipData } from '../lib/chips'
import { Chip } from './Chip'
import { BOUNCE, BOUNCE_MS, LAND_MS } from './ChipToss'

// scale rather than transform so these don't fight the hover state
const LANDING = [{ scale: '1' }, { scale: '1.1 0.88' }, { scale: '0.97 1.04' }, { scale: '1' }]
const PLUCK = [{ scale: '1' }, { scale: '0.92' }, { scale: '1.03' }, { scale: '1' }]

type ChipCardProps = {
  chip: ChipData
  showValue: boolean
  onAdd: (from: DOMRect) => void
  onRemove: (from: DOMRect) => void
  onEdit: () => void
  onValueChange: (value: number) => void
}

export function ChipCard({ chip, showValue, onAdd, onRemove, onEdit, onValueChange }: ChipCardProps) {
  const chipButton = useRef<HTMLButtonElement>(null)
  const count = useRef<HTMLSpanElement>(null)
  const rect = () => chipButton.current!.getBoundingClientRect()

  const thud = (keyframes: Keyframe[], delay: number) => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    for (const part of [chipButton.current, count.current]) {
      part?.animate(keyframes, { duration: 300, delay, easing: 'ease-out' })
    }
  }

  const add = () => {
    onAdd(rect())
    thud(LANDING, LAND_MS)
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      count.current?.animate(BOUNCE, { duration: BOUNCE_MS, delay: LAND_MS })
    }
  }

  const remove = () => {
    onRemove(rect())
    if (chip.count) thud(PLUCK, 0)
  }

  const gestures = useChipGestures({ onSwipeDown: add, onSwipeUp: remove, onEdit })

  return (
    <article className="chip-card">
      <p className="chip-total">{showValue && formatMoney(chip.value * chip.count)}</p>

      <div className="chip-stack">
        <button
          ref={chipButton}
          className="chip-button"
          aria-label={`${chip.count} chips. Edit chip`}
          title="Click or long press to edit. Swipe down to add, up to remove."
          {...gestures}
        >
          <Chip color={chip.color} />
        </button>
        <span ref={count} className="chip-count" aria-hidden="true" style={{ color: contrastColor(chip.color) }}>
          {chip.count.toLocaleString('en-US')}
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

      <button className="button add" onClick={add}>
        Add
      </button>
      <button className="button danger" onClick={remove}>
        Remove
      </button>
    </article>
  )
}
