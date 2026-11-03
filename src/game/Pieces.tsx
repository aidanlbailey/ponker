import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import { Chip } from '../components/Chip'
import { HIDDEN, type Card } from '../engine/engine'
import { chipColors } from './betting'
import { cardName, isRed, rankText, suitText } from './cards'
import { BOT_ID } from './solo'
import type { Flight } from './useSoloTable'

const FLIGHT_MS = 480
// ponytail: only the one bot so far. The art lands in public/ by name, swap the letter for an img here.
const BOT_LETTERS: Record<string, string> = { [BOT_ID]: 'Ξ' }
const DEFAULT_AVATAR = '♠︎'

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export function Avatar({ id }: { id: string }) {
  const letter = BOT_LETTERS[id]
  return (
    <span className={`avatar ${letter ? 'bot' : ''}`} aria-hidden="true">
      {letter ?? DEFAULT_AVATAR}
    </span>
  )
}

export function PlayingCard({ card, delay = 0 }: { card: Card; delay?: number }) {
  const hidden = card === HIDDEN
  const style = { '--delay': `${delay}ms` } as CSSProperties

  return (
    <span
      className={`tcard ${hidden ? 'down' : 'up'}`}
      style={style}
      role="img"
      aria-label={hidden ? 'Face down card' : cardName(card)}
    >
      <span className="tcard-flip">
        <span className="card-back" />
        {!hidden && (
          <span className={`tcard-face ${isRed(card) ? 'red' : ''}`}>
            <span className="tcard-rank">{rankText(card)}</span>
            <span className="tcard-suit">{suitText(card)}</span>
          </span>
        )}
      </span>
    </span>
  )
}

export function ChipPile({ amount }: { amount: number }) {
  return (
    <span className="pile" style={{ '--chips': chipColors(amount).length } as CSSProperties} aria-hidden="true">
      {chipColors(amount).map((color, i) => (
        <span key={i} style={{ '--n': i } as CSSProperties}>
          <Chip color={color} />
        </span>
      ))}
    </span>
  )
}

const rectOf = (spot: Flight['from']) =>
  spot instanceof DOMRect ? spot : document.querySelector(`[data-spot="${spot}"]`)?.getBoundingClientRect()

// seen from above, so height on the throw is just scale
export function ChipFlight({ flight, onLand }: { flight: Flight; onLand: () => void }) {
  const el = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const from = rectOf(flight.from)
    const to = rectOf(flight.to)
    if (!from || !to || reducedMotion()) return onLand()

    const box = el.current!
    const center = ({ left, top, width, height }: DOMRect) => [
      left + width / 2 - box.offsetWidth / 2,
      top + height / 2 - box.offsetHeight / 2,
    ]
    const [ax, ay] = center(from)
    const [bx, by] = center(to)
    const spin = (Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 180)
    const pose = (share: number, scale: number, x = 1, y = 1) =>
      `translate(${ax! + (bx! - ax!) * share}px, ${ay! + (by! - ay!) * share}px) rotate(${spin * share}deg) scale(${scale * x}, ${scale * y})`

    const animation = box.animate(
      [
        { transform: pose(0, 1) },
        { transform: pose(0.5, 1.45), offset: 0.45 },
        { transform: pose(1, 1), offset: 0.82, easing: 'ease-out' },
        { transform: pose(1, 1, 1.14, 0.86), offset: 0.9 },
        { transform: pose(1, 1) },
      ],
      { duration: FLIGHT_MS, easing: 'cubic-bezier(0.25, 0.6, 0.5, 1)', fill: 'both' },
    )
    animation.onfinish = onLand
    return () => animation.cancel()
    // the flight is fixed when it's created, and onLand changes every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={el} className="flight">
      <ChipPile amount={flight.amount} />
    </div>
  )
}
