import { useEffect, useRef, useState, type AnimationEvent, type CSSProperties, type MouseEvent } from 'react'
import { haptic } from '../lib/haptics'
import { sound } from '../lib/sound'

// ︎ keeps these as text, otherwise phones swap in emoji suits
export const SPADES = '♠︎'
export const HEARTS = '♥︎'
export const DIAMONDS = '♦︎'
export const CLUBS = '♣︎'

type CardProps = { rank: string; suit: string; label: string }

function CardFace({ rank, suit, label }: CardProps) {
  const isRed = suit === HEARTS || suit === DIAMONDS

  return (
    <span className="card-flip">
      <span className="card-back" />
      <span className={`card-face ${isRed ? 'red' : ''}`}>
        <span className="card-label">{label}</span>
        <span className="card-pip" aria-hidden="true">
          {suit}
        </span>
        <span className="card-index" aria-hidden="true">
          {rank}
          <br />
          {suit}
        </span>
        <span className="card-index upside-down" aria-hidden="true">
          {rank}
          <br />
          {suit}
        </span>
      </span>
    </span>
  )
}

// opensPanel: the card hands the backdrop to a dialog instead of fading it out
export type MenuCard = CardProps & { run?: () => void; opensPanel?: boolean; href?: string }

export function CardMenu({ deck, cards, onClose }: { deck: DOMRect; cards: MenuCard[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const afterCollect = useRef<() => void>(undefined)
  const [leaving, setLeaving] = useState(false)
  const [dealt, setDealt] = useState(false)
  const [pointerMoved, setPointerMoved] = useState(false)
  const [handingOff, setHandingOff] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal()
  }, [])

  useEffect(() => sound('fan'), [])

  const collect = (index: number | null = null, then?: () => void) => {
    sound('slide')
    afterCollect.current = then
    setPicked(index)
    setLeaving(true)
  }

  const pick = (index: number, run?: () => void) => {
    if (leaving) return
    haptic('light')
    collect(index, run)
  }

  const closeOnBackdrop = (e: MouseEvent) => {
    if (!(e.target as Element).closest('.playing-card')) collect()
  }

  // the last card goes back on top of the deck, so its animation ending means the hand is gone
  const finish = (e: AnimationEvent, index: number) => {
    // card 0 is dealt last
    if (index === 0 && e.target === e.currentTarget && e.animationName === 'deal') setDealt(true)
    if (leaving && index === cards.length - 1 && e.target === e.currentTarget) {
      onClose()
      afterCollect.current?.()
    }
  }

  const origin = {
    '--last': cards.length - 1,
    '--deck-x': `${deck.left + deck.width / 2}px`,
    '--deck-y': `${deck.top + deck.height / 2 - innerHeight / 2}px`,
  } as CSSProperties

  return (
    <dialog
      ref={dialog}
      className={['card-menu', leaving && 'leaving', dealt && 'dealt', pointerMoved && 'pointer-moved', handingOff && 'handing-off']
        .filter(Boolean)
        .join(' ')}
      aria-label="Menu"
      // cards fly under a resting cursor and browsers leave :hover stuck on one until it moves.
      // the movement check matters because browsers also send fake moves after layout changes
      onPointerMove={(e) => {
        if (e.movementX || e.movementY) setPointerMoved(true)
      }}
      onCancel={(e) => {
        e.preventDefault()
        collect()
      }}
      onClose={onClose}
      onClick={closeOnBackdrop}
    >
      <nav className="card-hand" style={origin} data-sound="none">
        {cards.map(({ run, opensPanel, href, ...card }, i) => {
          const shared = {
            className: `playing-card ${picked === i ? 'picked' : ''}`,
            style: { '--i': i } as CSSProperties,
            onAnimationEnd: (e: AnimationEvent) => finish(e, i),
            onClick: () => {
              // the next panel takes over the backdrop, so it stays put instead of dipping out and back
              setHandingOff(Boolean(opensPanel))
              pick(i, run)
            },
          }

          return href ? (
            <a key={card.rank} href={href} target="_blank" rel="noreferrer" {...shared}>
              <CardFace {...card} />
            </a>
          ) : (
            <button key={card.rank} {...shared}>
              <CardFace {...card} />
            </button>
          )
        })}
      </nav>
    </dialog>
  )
}
