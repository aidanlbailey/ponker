import { useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import type { Legal, PlayerAction, TableState } from '../engine/engine'
import { releaseVelocity, type Sample } from '../lib/letterPhysics'
import { actionText, isFlick, raiseTo } from './betting'
import { ChipPile, reducedMotion } from './Pieces'


const PRESETS = [
  ['½ pot', 0.5],
  ['Pot', 1],
] as const

type Drag = { id: number; x: number; y: number; samples: Sample[] }

type BetControlsProps = {
  view: TableState
  legal: Legal
  onAct: (action: PlayerAction, from?: DOMRect) => void
}

// remounted for every decision, so the size always starts from a fresh half pot
export function BetControls({ view, legal, onAct }: BetControlsProps) {
  const { toCall, canCheck, canRaise, minTo, maxTo } = legal
  const seat = legal.seat
  const me = view.seats[seat]!
  const [text, setText] = useState(() => String(raiseTo(view, legal, 0.5)))
  const [held, setHeld] = useState<{ x: number; y: number } | null>(null)
  const pile = useRef<HTMLButtonElement>(null)
  const drag = useRef<Drag>(null)

  const to = Number(text)
  const clamped = Math.min(Math.max(Math.round(to) || minTo, minTo), maxTo)
  const valid = Number.isInteger(to) && to >= minTo && to <= maxTo

  const raise: PlayerAction = { type: 'raise', seat, to: clamped }
  const call: PlayerAction = { type: 'call', seat }
  const thrown = canRaise ? raise : call
  const throwable = canRaise ? valid : toCall > 0
  const inThePile = canRaise ? clamped - me.bet : toCall

  const start = (e: PointerEvent<HTMLButtonElement>) => {
    if (!throwable) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      samples: [{ time: performance.now(), x: e.clientX, y: e.clientY }],
    }
    setHeld({ x: 0, y: 0 })
  }

  const move = (e: PointerEvent) => {
    const now = drag.current
    if (now?.id !== e.pointerId) return
    now.samples.push({ time: performance.now(), x: e.clientX, y: e.clientY })
    setHeld({ x: e.clientX - now.x, y: e.clientY - now.y })
  }

  const release = (e: PointerEvent<HTMLButtonElement>) => {
    const now = drag.current
    if (now?.id !== e.pointerId) return
    drag.current = null

    // the chips themselves, not the button, which keeps empty room above them for a taller pile
    const box = e.currentTarget.querySelector('.pile')!.getBoundingClientRect()
    const target = document.querySelector(`[data-spot="bet-${seat}"]`)!.getBoundingClientRect()
    const aim = { x: target.left - box.left, y: target.top - box.top }
    const moved = { x: e.clientX - now.x, y: e.clientY - now.y }
    if (isFlick(moved, releaseVelocity(now.samples, performance.now()), aim)) {
      // the pile's flight takes over from wherever the hand let go of it
      onAct(thrown, reducedMotion() ? undefined : box)
    } else setHeld(null)
  }

  return (
    <form
      className="bet-controls"
      onSubmit={(e) => {
        e.preventDefault()
        if (canRaise && valid) onAct(raise)
      }}
    >
      <div className="bet-size">
        <div className={`flick ${throwable ? '' : 'off'}`}>
          <button
            ref={pile}
            type="button"
            className={`flick-pile ${held ? 'held' : ''}`}
            style={{ '--x': `${held?.x ?? 0}px`, '--y': `${held?.y ?? 0}px` } as CSSProperties}
            // the labelled buttons below do the same job for keyboards and screen readers
            tabIndex={-1}
            aria-hidden="true"
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={release}
            onPointerCancel={() => {
              drag.current = null
              setHeld(null)
            }}
          >
            <ChipPile amount={inThePile} />
          </button>
          <span className="flick-hint">Flick</span>
        </div>

        {canRaise && (
          <div className="bet-sizing">
            <div className="bet-presets">
              {PRESETS.map(([label, share]) => (
                <button key={label} type="button" onClick={() => setText(String(raiseTo(view, legal, share)))}>
                  {label}
                </button>
              ))}
              <button type="button" onClick={() => setText(String(maxTo))}>
                All in
              </button>
              <label className="bet-exact">
                <span className="sr-only">Exact amount</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={minTo}
                  max={maxTo}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onBlur={() => setText(String(clamped))}
                />
              </label>
            </div>
            {minTo < maxTo && (
              <input
                className="bet-slider"
                type="range"
                aria-label="Bet size"
                min={minTo}
                max={maxTo}
                step={view.smallBlind}
                value={clamped}
                onChange={(e) => setText(e.target.value)}
              />
            )}
          </div>
        )}
      </div>

      <div className="bet-actions">
        {!canCheck && (
          <button type="button" className="button danger" onClick={() => onAct({ type: 'fold', seat })}>
            Fold
          </button>
        )}
        <button type="button" className="button add" onClick={() => onAct(canCheck ? { type: 'check', seat } : call)}>
          {canCheck ? 'Check' : actionText(view, call)}
        </button>
        {canRaise && (
          <button type="submit" className="button primary" disabled={!valid}>
            {valid ? actionText(view, raise) : `${minTo} to ${maxTo}`}
          </button>
        )}
      </div>
    </form>
  )
}
