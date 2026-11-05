import { useEffect, useRef, useState, type AnimationEvent, type CSSProperties, type PointerEvent } from 'react'
import { ChipParts, sideStyle } from '../components/Chip'
import type { Legal, PlayerAction, TableState } from '../engine/engine'
import { releaseVelocity, type Sample } from '../lib/letterPhysics'
import { actionText, chipColors, isFlick, MAX_PILE, raiseTo } from './betting'
import { reducedMotion } from './Pieces'


const PRESETS = [
  ['½ pot', 0.5],
  ['Pot', 1],
] as const

const POP_STAGGER = 25 // top chip off first
const DROP_STAGGER = 40 // bottom chip on first
const DROP_SPREAD = 200 // most a whole new pile takes to arrive, so the stagger shrinks for big ones
const DROP_LEAD = 50 // lets the old chips start lifting before new ones fall into their spot
const SHOWN_FOR = 80 // a chip that's been visible less than this just vanishes, ghosting it read as a flicker

type PileChip = { id: number; color: string; n: number; out: boolean; drop: boolean; delay: number; shows: number }

// Diffs the pile from the bottom. Chips below the first difference stay put, everything above it pops off and the
// new chips drop on. Breakdown goes biggest first so a nudge usually only touches the top few
export function restack(chips: PileChip[], colors: string[], ids: { current: number }, now: number, still: boolean) {
  const live = chips.filter((chip) => !chip.out)
  let same = 0
  while (same < live.length && live[same]!.color === colors[same]) same++
  if (same === live.length && same === colors.length) return chips

  const going = new Map(live.slice(same).map((chip) => [chip.id, chip]))
  const kept = chips.flatMap((chip) => {
    if (!going.has(chip.id)) return [chip]
    // never really landed, or nothing animates, so there's nothing to pop
    if (still || now < chip.shows + SHOWN_FOR) return []
    return [{ ...chip, out: true, delay: (live.length - 1 - chip.n) * POP_STAGGER }]
  })
  const lead = going.size ? DROP_LEAD : 0
  const stagger = Math.min(DROP_STAGGER, DROP_SPREAD / Math.max(colors.length - same, 1))
  const coming = colors.slice(same).map((color, i) => {
    const delay = still ? 0 : lead + i * stagger
    return { id: ids.current++, color, n: same + i, out: false, drop: !still, delay, shows: now + delay }
  })
  return [...kept, ...coming]
}

// the flick pile, with chips that pop off and drop on as the bet changes rather than the whole pile swapping
// A thumb swipe crosses dozens of values a second and restacking on any of them looked jagged, so while the
// slider's held the pile doesn't move at all and restacks once on let go. Presets, typing and arrow keys are
// one deliberate change each, those restack straight away
function LivePile({ amount, held }: { amount: number; held: boolean }) {
  // the first pile takes ids 0 up, which never passes MAX_PILE
  const ids = useRef(MAX_PILE)
  const [chips, setChips] = useState(() => restack([], chipColors(amount), { current: 0 }, 0, true))

  useEffect(() => {
    if (!held) setChips((pile) => restack(pile, chipColors(amount), ids, performance.now(), reducedMotion()))
  }, [amount, held])

  const gone = (e: AnimationEvent, id: number) => {
    if (e.target === e.currentTarget) setChips((now) => now.filter((chip) => chip.id !== id))
  }

  return (
    <span className="pile live" style={{ '--chips': chips.filter((chip) => !chip.out).length } as CSSProperties} aria-hidden="true">
      {chips.map((chip) => (
        <span
          key={chip.id}
          className={chip.out ? 'out' : chip.drop ? 'in' : undefined}
          style={{ '--n': chip.n, '--delay': `${chip.delay}ms`, ...sideStyle(chip.color) } as CSSProperties}
          onAnimationEnd={chip.out ? (e) => gone(e, chip.id) : undefined}
        >
          <ChipParts color={chip.color} />
        </span>
      ))}
    </span>
  )
}

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
  const [sliding, setSliding] = useState(false)
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
            <LivePile amount={inThePile} held={sliding} />
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
                style={{ '--p': (clamped - minTo) / (maxTo - minTo) } as CSSProperties}
                type="range"
                aria-label="Bet size"
                min={minTo}
                max={maxTo}
                step={view.smallBlind}
                value={clamped}
                onChange={(e) => setText(e.target.value)}
                onPointerDown={() => {
                  setSliding(true)
                  // on the window, a thumb that wanders off the track still lets go
                  const up = () => {
                    setSliding(false)
                    removeEventListener('pointerup', up)
                    removeEventListener('pointercancel', up)
                  }
                  addEventListener('pointerup', up)
                  addEventListener('pointercancel', up)
                }}
              />
            )}
          </div>
        )}
      </div>

      <div className="bet-actions">
        {!canCheck && (
          <button type="button" className="button danger act fold" onClick={() => onAct({ type: 'fold', seat })}>
            Fold
          </button>
        )}
        <button
          type="button"
          className={`button add act ${canCheck ? 'check' : 'call'}`}
          onClick={() => onAct(canCheck ? { type: 'check', seat } : call)}
        >
          {canCheck ? 'Check' : actionText(view, call)}
        </button>
        {canRaise && (
          <button
            type="submit"
            // keeps its raise class either way, that's what stacks the labels
            className={`button primary raise act ${clamped === maxTo ? 'allin' : view.currentBet ? '' : 'opens'}`}
            disabled={!valid}
          >
            {/* sized for the longest label this decision can show, so dragging the slider through 99 to 100 doesn't
                shove Fold and Call around. Digits are tabular, so any number of the same length fits */}
            <span className="raise-room" aria-hidden="true">
              {`${view.currentBet ? 'Raise to' : 'Bet'} ${String(maxTo).replace(/\d/g, '0')}`}
            </span>
            <span className="raise-room" aria-hidden="true">{`${minTo} to ${maxTo}`}</span>
            <span>{valid ? actionText(view, raise) : `${minTo} to ${maxTo}`}</span>
          </button>
        )}
      </div>
    </form>
  )
}
