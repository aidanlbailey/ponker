import { useRef } from 'react'
import { useChipGestures } from '../hooks/useChipGestures'
import { formatMoney, type Chip as ChipData } from '../lib/chips'
import { Chip } from './Chip'

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
  const rect = () => chipButton.current!.getBoundingClientRect()
  const add = () => onAdd(rect())
  const remove = () => onRemove(rect())

  const gestures = useChipGestures({ onSwipeDown: add, onSwipeUp: remove, onEdit })

  return (
    <article className="chip-card">
      <p className="chip-total">{showValue && formatMoney(chip.value * chip.count)}</p>

      <button
        ref={chipButton}
        className="chip-button"
        aria-label={`${chip.count} chips. Edit chip`}
        title="Click or long press to edit. Swipe down to add, up to remove."
        {...gestures}
      >
        <Chip color={chip.color}>
          <span className="chip-count">{chip.count.toLocaleString('en-US')}</span>
        </Chip>
      </button>

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
