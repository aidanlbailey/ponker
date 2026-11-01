import { useEffect, useRef, useState, type AnimationEvent, type CSSProperties, type MouseEvent } from 'react'
import { haptic } from '../lib/haptics'

export type Theme = 'dark' | 'light' | 'felt'

const NEXT_THEME = {
  dark: { theme: 'light', label: 'Light mode' },
  light: { theme: 'felt', label: 'Felt mode' },
  felt: { theme: 'dark', label: 'Dark mode' },
} as const

// ︎ keeps these as text, otherwise phones swap in emoji suits
const SPADES = '♠︎'
const HEARTS = '♥︎'
const DIAMONDS = '♦︎'
const CLUBS = '♣︎'

type CardProps = { rank: string; suit: string; label: string }

function CardFace({ rank, suit, label }: CardProps) {
  const isRed = suit === HEARTS || suit === DIAMONDS

  return (
    <span className="card-flip">
      <span className="card-back" />
      <span className={`card-face ${isRed ? 'red' : ''}`}>
        <span className="card-index" aria-hidden="true">
          {rank}
          <br />
          {suit}
        </span>
        <span className="card-label">{label}</span>
        <span className="card-pip" aria-hidden="true">
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

type CardMenuProps = {
  deck: DOMRect
  theme: Theme
  showValues: boolean
  userName: string
  onClose: () => void
  onAddChipType: () => void
  onOpenPresets: () => void
  onOpenName: () => void
  onCashout: () => void
  onToggleValues: () => void
  onThemeChange: (theme: Theme) => void
}

export function CardMenu(props: CardMenuProps) {
  const { deck, theme, showValues, userName, onClose, onThemeChange } = props
  const dialog = useRef<HTMLDialogElement>(null)
  const afterCollect = useRef<() => void>(undefined)
  const [leaving, setLeaving] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal()
  }, [])

  const collect = (index: number | null = null, then?: () => void) => {
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

  // card 0 goes back to the deck last, so its animation ending means the hand is gone
  const finish = (e: AnimationEvent, index: number) => {
    if (leaving && index === 0 && e.target === e.currentTarget) {
      onClose()
      afterCollect.current?.()
    }
  }

  const next = NEXT_THEME[theme]
  const cards: (CardProps & { run?: () => void; href?: string })[] = [
    { rank: 'A', suit: SPADES, label: 'Add chip type', run: props.onAddChipType },
    { rank: 'K', suit: DIAMONDS, label: 'Cash out', run: props.onCashout },
    { rank: 'Q', suit: HEARTS, label: userName ? 'Change name' : 'Set your name', run: props.onOpenName },
    { rank: 'J', suit: CLUBS, label: 'Chip presets', run: props.onOpenPresets },
    { rank: '10', suit: SPADES, label: showValues ? 'Hide values' : 'Show values', run: props.onToggleValues },
    { rank: '9', suit: DIAMONDS, label: next.label, run: () => onThemeChange(next.theme) },
    { rank: '8', suit: CLUBS, label: 'About Ponker', href: 'https://github.com/aidanlbailey/ponker#readme' },
    { rank: '7', suit: HEARTS, label: 'Buy me a coffee', href: 'https://ko-fi.com/aidanlbailey' },
  ]

  const origin = {
    '--from-x': `${deck.left + deck.width / 2 - innerWidth / 2}px`,
    '--from-y': `${deck.top + deck.height / 2 - innerHeight / 2}px`,
  } as CSSProperties

  return (
    <dialog
      ref={dialog}
      className="card-menu"
      aria-label="Menu"
      onCancel={(e) => {
        e.preventDefault()
        collect()
      }}
      onClose={onClose}
      onClick={closeOnBackdrop}
    >
      <nav className={`card-hand ${leaving ? 'leaving' : ''}`} style={origin}>
        {cards.map(({ run, href, ...card }, i) => {
          const shared = {
            className: `playing-card ${picked === i ? 'picked' : ''}`,
            style: { '--i': i, '--position': i % 4, '--row': i < 4 ? -1 : 1 } as CSSProperties,
            onAnimationEnd: (e: AnimationEvent) => finish(e, i),
            onClick: () => pick(i, run),
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
