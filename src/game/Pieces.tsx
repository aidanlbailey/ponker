import '@fontsource/press-start-2p/greek-400.css'
import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { ChipParts, ChipStack, TILT, chipLook, sideStyle } from '../components/Chip'
import { LANDING } from '../components/ChipCard'
import { HIDDEN, type Card } from '../engine/engine'
import { sound } from '../lib/sound'
import { chipColors, colorOf } from './betting'
import { cardName, isRed, rankText, suitText } from './cards'
import { progress, route, type Box, type Point } from './route'
import type { At } from './piles'
import { BOTS } from './roster'
import type { Spot } from './solo'
import type { Flight } from './useStage'

const THROW_MS = 850
const LAND = 0.62 // share of the throw spent in the air, the rest is the bounce
const SLIDE_MS = 420
const HOP_MS = 560
const PILE_RISE = 4 // keep in step with .pile in game.css
const STACK_GAP = 4 // keep in step with .pot-slot in game.css
export const SHOWN = 12 // keep in step with MAX_LEVEL in piles.ts. Pot stacks go to MAX_STACK there

// the flick pile's chips are twice the felt's, so their thickness goes with their size. About the felt's 4px on its chips
const FLICK_RISE = 0.1
// handed to game.css and chips.css as variables on the table
export const PILE_LOOK = { ...chipLook(TILT, PILE_RISE), '--flick-rise': FLICK_RISE } as CSSProperties
// ponytail: plain letters for now. The art lands in public/ by name (alpha, beta...), swap the letter for an img here.
const BOT_LETTERS = Object.fromEntries(BOTS.map((bot) => [bot.id, bot.letter]))
// round the wheel in alphabet order so a colour says nothing about how it plays, light and dark
// alternate since 15° apart alone reads as the same colour
const BOT_COLORS = Object.fromEntries(
  [...BOTS]
    .sort((a, b) => a.letter.localeCompare(b.letter))
    .map((bot, i) => [bot.id, `oklch(${i % 2 ? 0.42 : 0.58} 0.17 ${25 + i * 15})`]),
)
const DEFAULT_AVATAR = '♠︎'

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export function Avatar({ id }: { id: string }) {
  const letter = BOT_LETTERS[id]
  return (
    <span
      className={`avatar ${letter ? 'bot' : ''} ${letter && 'ΓΙΤΥΨ'.includes(letter) ? 'centred' : ''}`}
      style={letter ? ({ '--bot-color': BOT_COLORS[id] } as CSSProperties) : undefined}
      aria-hidden="true"
    >
      {letter ?? DEFAULT_AVATAR}
    </span>
  )
}

export function PlayingCard({ card, delay = 0 }: { card: Card; delay?: number }) {
  const hidden = card === HIDDEN
  const style = { '--delay': `${delay}ms` } as CSSProperties

  // cards are keyed by hand and face, so a mount is a deal, a turn or a show
  useEffect(() => sound('card', { delay }), [delay])

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

export function ChipPile({ amount = 0, colors = chipColors(amount), shown = SHOWN }: { amount?: number; colors?: string[]; shown?: number }) {
  return <ChipStack colors={colors.slice(-shown)} />
}

// same flight as the tracker's toss: drift, gravity and spin each on their own element so the
// arc is a real parabola, and the spin is whole turns that settle flat, matching the pile below
// A hop is the little flip up onto a pot stack after a slide. It only fills forwards so the
// slide keeps hold of the chip until it starts, and does one turn with no roll so it doesn't jump.
function throwChip(chip: HTMLElement, start: Point, end: Point, startScale: number, delay: number, hop = false) {
  // by name, the shadow sits ahead of them in the flight
  const height = chip.querySelector('.toss-height')!
  const spin = chip.querySelector('.toss-spin')!
  const reach = Math.hypot(end.x - start.x, end.y - start.y) * 0.3
  const apex = hop ? Math.min(18 + reach, 56) : Math.min(30 + reach, 110)
  const turns = (Math.random() < 0.5 ? -1 : 1) * (hop ? 1 : 2 + Math.floor(Math.random() * 2)) * 360
  const roll = hop ? 0 : (Math.random() - 0.5) * 120
  const timing = { duration: hop ? HOP_MS : THROW_MS, delay, fill: hop ? 'forwards' : 'both' } as const

  return [
    chip.animate(
      [
        { transform: `translate(${start.x}px, ${start.y}px)` },
        { transform: `translate(${end.x}px, ${end.y}px)`, offset: LAND },
        { transform: `translate(${end.x}px, ${end.y}px)` },
      ],
      timing,
    ),
    height.animate(
      [
        { transform: `translateY(0) scale(${startScale})`, easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)' },
        { transform: `translateY(${-apex}px) scale(1.25)`, offset: LAND / 2, easing: 'cubic-bezier(0.6, 0, 0.9, 0.5)' },
        { transform: 'translateY(0) scale(1)', offset: LAND, easing: 'ease-out' },
        { transform: 'translateY(-9px) scale(1)', offset: 0.76, easing: 'ease-in' },
        { transform: 'translateY(0) scale(1)', offset: 0.88, easing: 'ease-out' },
        { transform: 'translateY(-2px) scale(1)', offset: 0.94, easing: 'ease-in' },
        { transform: 'translateY(0) scale(1)', offset: 0.97 },
        { transform: 'translateY(0) scale(1)' },
      ],
      timing,
    ),
    spin.animate(
      [
        // --flip is how far it's turned end over end. game.css draws the face, side and edge from it, so it
        // opens out to a full circle as it faces you and lands as exactly the chip it becomes
        { '--flip': `${turns}deg`, transform: `rotateZ(${roll}deg)`, easing: 'cubic-bezier(0.3, 0.5, 0.6, 1)' },
        { '--flip': '16deg', transform: 'rotateZ(0deg)', offset: LAND },
        { '--flip': '-9deg', transform: 'rotateZ(0deg)', offset: 0.76 },
        { '--flip': '4deg', transform: 'rotateZ(0deg)', offset: 0.88 },
        { '--flip': '0deg', transform: 'rotateZ(0deg)' },
      ],
      timing,
    ),
  ]
}

// sweeping chips across the felt, no air and no spin, and round the board rather than over it
function slideChip(chip: HTMLElement, path: Point[], startScale: number, delay: number, fades: boolean) {
  const endScale = fades ? 0.7 : 1
  const keyframes = progress(path).map((t, i) => ({
    offset: t,
    transform: `translate(${path[i]!.x}px, ${path[i]!.y}px) scale(${startScale + (endScale - startScale) * t})`,
    opacity: fades ? Math.min(1, (1 - t) / 0.3) : 1,
  }))
  return chip.animate(keyframes, { duration: slideMs(path), delay, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'both' })
}

const slideMs = (path: Point[]) => SLIDE_MS * (path.length > 2 ? 1.3 : 1) // the long way round takes a little longer

// the board in chip top-left coordinates, with a little clearance
function boardObstacle(size: number): Box | null {
  const board = document.querySelector('.board')
  if (!board?.querySelector('.tcard')) return null
  const { left, top, right, bottom } = board.getBoundingClientRect()
  const clearance = size * 0.35
  return { left: left - size - clearance, top: top - size - clearance, right: right + clearance, bottom: bottom + clearance }
}

// unscaled and unrounded. offsetWidth rounds to a whole pixel, and that was enough to put the flying chip a
// fraction off the one it lands as, so it twitched as it came to rest
const layoutWidth = (el: HTMLElement) => parseFloat(getComputedStyle(el).width)

export function ChipFlight({ flight, onLand }: { flight: Flight; onLand: () => void }) {
  const el = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    // any bet slot is exactly one chip
    const sample = document.querySelector<HTMLElement>('.bet .pile-slot')
    if (!sample || reducedMotion()) return onLand()

    // the chip lives inside the scaled felt, under or over the seats. This undoes the felt's scale and offset,
    // so everything below can keep working in screen pixels wherever the chip is drawn
    const layer = el.current!.closest<HTMLElement>('.under-seats, .over-seats')
    if (layer) {
      const felt = layer.parentElement!
      const box = felt.getBoundingClientRect()
      layer.style.transform = `scale(${layoutWidth(felt) / box.width}) translate(${-box.left}px, ${-box.top}px)`
    }

    // measured, so the flying chip is exactly the size of the resting one whatever the felt is scaled to
    const size = sample.getBoundingClientRect().width
    const scale = size / (layoutWidth(sample) || size)
    const rise = PILE_RISE * scale
    el.current!.style.setProperty('--chip-size', `${size}px`)
    // the face is drawn at the pile's own size and scaled like the felt, or its lacquer and edge come
    // out thinner than the chips it lands on
    el.current!.style.setProperty('--face-size', `${size / scale}px`)
    el.current!.style.setProperty('--face-scale', `${scale}`)
    // its side's stripes are turned for the level it lands on, the same as the chip that'll be sitting there
    el.current!.style.setProperty('--n', `${flight.toAt?.level ?? 0}`)

    // a chip's top left corner at its place in a pile, or on the avatar for a seat
    const spotOf = (spot: Spot, at: At | null): Point | null => {
      const box = document
        .querySelector(spot.startsWith('seat') ? `[data-spot="${spot}"] .avatar` : `[data-spot="${spot}"]`)
        ?.getBoundingClientRect()
      if (!box) return null
      const x = box.left + box.width / 2 - size / 2
      if (!at) return { x, y: box.top + box.height / 2 - size / 2 }
      return { x: x + (at.stack - (at.of - 1) / 2) * (size + STACK_GAP * scale), y: box.bottom - size - at.level * rise }
    }

    const flick = flight.start
    const startScale = flick ? flick.width / size : flight.from.startsWith('seat') ? 0.7 : 1
    const start = flick
      ? {
          x: flick.left + flick.width / 2 - size / 2,
          y: flick.bottom - flick.width / 2 - size / 2 - (flight.fromAt?.level ?? 0) * flick.width * FLICK_RISE,
        }
      : spotOf(flight.from, flight.from.startsWith('seat') ? null : flight.fromAt)
    const end = spotOf(flight.to, flight.toAt)
    if (!start || !end) return onLand()

    const thrown = flight.to.startsWith('bet')
    // level 0 is the bottom of a new pile, so it hits the felt. Anything higher clinks on the chip under it
    const onChip = flight.toAt?.level ? 'stack' : 'chip'
    const chip = el.current!
    const obstacle = thrown ? null : boardObstacle(size)
    // on a phone the board is nearly as wide as the felt, so the way round ran off the edge of the screen.
    // Over the cards beats off the table
    const felt = document.querySelector('.felt')?.getBoundingClientRect()
    const slide = (to: Point) => {
      const way = obstacle ? route(start, to, obstacle) : [start, to]
      const onFelt = !felt || way.every((p) => p.x >= felt.left && p.x + size <= felt.right)
      return onFelt ? way : [start, to]
    }
    let animations: Animation[]
    if (thrown) {
      animations = throwChip(chip, start, end, startScale, flight.delay)
      sound(onChip, { delay: flight.delay + THROW_MS * LAND })
    }
    else if (flight.to === 'pot') {
      // slide up next to the foot of its stack, then flip up onto the top
      const base = spotOf('pot', { ...flight.toAt!, level: 0 })!
      const way = slide(base)
      const from = way.at(-2)!
      const back = Math.min((size * 0.8) / (Math.hypot(from.x - base.x, from.y - base.y) || 1), 1)
      const near = { x: base.x + (from.x - base.x) * back, y: base.y + (from.y - base.y) * back }
      const path = [...way.slice(0, -1), near]
      animations = [
        slideChip(chip, path, startScale, flight.delay, false),
        ...throwChip(chip, near, end, 1, flight.delay + slideMs(path), true),
      ]
      sound(onChip, { delay: flight.delay + slideMs(path) + HOP_MS * LAND, volume: 0.7 })
    } else {
      animations = [slideChip(chip, slide(end), startScale, flight.delay, true)]
      // one grab per stack, a payout chip by chip would be a rattle
      if (flight.order === 0) sound('handle', { delay: flight.delay })
    }
    // Chips come off the top first, so the first flight made is the top chip and DOM order would draw
    // a waiting stack upside down. Until it goes it layers by its place in the pile, then it rises
    // over everything still waiting, and the ones in the air keep DOM order so later ones land on top.
    // Except a payout, nothing lands, and past the stagger cap a whole stack leaves at once. DOM order
    // drew that sliding stack upside down, so those keep their pile order in the air too
    const level = flight.fromAt?.level ?? 0
    animations.push(
      chip.animate([{ zIndex: 35 + level }, { zIndex: flight.to.startsWith('seat') ? 100 + level : 100 }], {
        duration: 1,
        delay: flight.delay,
        fill: 'both',
      }),
    )
    const slot = thrown && flight.order === 0 ? document.querySelector(`[data-spot="${flight.to}"]`) : null
    const thud = slot?.animate(LANDING, { duration: 300, delay: flight.delay + THROW_MS * LAND, easing: 'ease-out' })

    Promise.all(animations.map((animation) => animation.finished)).then(onLand, () => {})
    return () => {
      animations.forEach((animation) => animation.cancel())
      thud?.cancel()
    }
    // the flight is fixed when it's created, and onLand changes every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const color = colorOf(flight.value)
  return (
    <div ref={el} className="flight" aria-hidden="true">
      {/* on the felt under it, so outside .toss-height: it slides with the chip but never lifts. Only for a
          chip starting a new pile, one landing on a pile has that pile's shadow under it already */}
      {flight.toAt?.level === 0 && <span className="flight-shadow" />}
      <div className="toss-height">
        <div className="toss-spin chip-flip" style={sideStyle(color)}>
          <ChipParts color={color} />
        </div>
      </div>
    </div>
  )
}
