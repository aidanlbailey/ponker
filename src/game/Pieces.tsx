import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { ChipParts, ChipStack, SHADOW_ALPHA, SHADOW_WIDTH, STRIPE_STAGGER, TILT, chipLook, sideStyle } from '../components/Chip'
import { LANDING } from '../components/ChipCard'
import { PixelArt } from '../components/PixelArt'
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
const SWEEP_MS = 700 // a bet pile tossed into the pot, a little quicker since every seat takes its turn
const LAND = 0.62 // share of the throw spent in the air, the rest is the bounce
export const SWEEP_LAND_MS = SWEEP_MS * LAND // useStage starts the next seat's sweep when the last one touches down
const SLIDE_MS = 420
// a banked band's gone from under a payout pile and the rest drop onto the felt. They hit at DROP_HIT, then
// settle with a little hop. useStage waits for the hit before the next band goes
export const DROP_MS = 260
export const DROP_HIT_MS = DROP_MS * 0.7 // keep in step with the 70% in win-fall in game.css
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
const DEFAULT_AVATAR = 'GUEST'

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

// a signed-in player's picture. Tapping someone else's offers to report it
export function Avatar({ id, art, onTap }: { id: string; art?: string | null; onTap?: () => void }) {
  if (art) {
    const picture = <PixelArt art={art} className="avatar-art" />
    return onTap ? (
      <button type="button" className="avatar art" aria-label="Report this picture" onClick={onTap}>
        {picture}
      </button>
    ) : (
      <span className="avatar art">{picture}</span>
    )
  }
  const letter = BOT_LETTERS[id]
  return (
    <span
      className={`avatar ${letter ? 'bot' : 'guest'}`}
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

export function ChipPile({
  amount = 0,
  colors = chipColors(amount),
  shown = SHOWN,
  under = 0,
}: {
  amount?: number
  colors?: string[]
  shown?: number
  under?: number
}) {
  return <ChipStack colors={colors.slice(-shown)} under={under} />
}

// A banked band leaving a winner's pile. Out of thin air with a sound for now. This is the one place to change if
// it should go somewhere instead, it gets the seat and the chips. A big band thuds a bit louder
export function bankOut(_seat: number, chips: number[]) {
  sound('handle', { volume: Math.min(0.6 + chips.length * 0.05, 1) })
}

// same flight as the tracker's toss: drift, gravity and spin each on their own element so the
// arc is a real parabola, and the spin is whole turns that settle flat, matching the pile below
function throwChip(chip: HTMLElement, start: Point, end: Point, startScale: number, delay: number, duration = THROW_MS) {
  // by name, the shadow sits ahead of them in the flight
  const height = chip.querySelector('.toss-height')!
  const spin = chip.querySelector('.toss-spin')!
  const reach = Math.hypot(end.x - start.x, end.y - start.y) * 0.3
  const apex = Math.min(30 + reach, 110)
  const turns = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.floor(Math.random() * 2)) * 360
  const roll = (Math.random() - 0.5) * 120
  const timing = { duration, delay, fill: 'both' } as const

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
        { '--flip': `${turns}deg`, easing: 'cubic-bezier(0.3, 0.5, 0.6, 1)' },
        { '--flip': '16deg', offset: LAND },
        { '--flip': '-9deg', offset: 0.76 },
        { '--flip': '4deg', offset: 0.88 },
        { '--flip': '0deg' },
      ],
      timing,
    ),
    // The roll starts flat and comes in as it leaves the hand. A chip waiting its turn shows this first frame the
    // whole time, and starting it rolled had every waiting chip tip over at once
    spin.animate(
      [
        { transform: 'rotateZ(0deg)', easing: 'ease-out' },
        { transform: `rotateZ(${roll}deg)`, offset: 0.12, easing: 'cubic-bezier(0.3, 0.5, 0.6, 1)' },
        { transform: 'rotateZ(0deg)', offset: LAND },
        { transform: 'rotateZ(0deg)' },
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

// spots and stripes repeat every 60deg, same wrap as --turn in chips.css
const wrap60 = (deg: number) => deg - Math.round(deg / 60) * 60

// From the level it's leaving to the one it lands on. The pile's per-level stripe turn, eased the short way round so
// it doesn't snap on takeoff (ends a multiple of 60 off the landed chip at most, which draws the same). And --foot,
// the level ChipShadows puts its shadow's foot at, so a chip waiting its turn sits on its own shadow, not the one
// it'll have once it's landed
function turnChip(chip: HTMLElement, fromLevel: number, toLevel: number, duration: number, delay: number) {
  const from = wrap60(fromLevel * STRIPE_STAGGER)
  const to = from + wrap60(toLevel * STRIPE_STAGGER - from)
  return chip.animate([{ '--flight-turn': `${from}deg`, '--foot': fromLevel }, { '--flight-turn': `${to}deg`, '--foot': toLevel }], {
    duration,
    delay,
    easing: 'cubic-bezier(0.45, 0, 0.2, 1)',
    fill: 'both',
  })
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

// Every chip shadow on the felt, piles and flying chips alike. They used to be their own elements: a pile's
// ::before and a span riding along in some flights. Overlaps stacked up darker, empty pot slots waiting for a
// stack drew one before it got there, and most flights had none. Now each frame reads where every chip actually
// is and fills its ellipse solid black on one canvas, and the canvas is see-through as a whole, so overlaps merge
// into one even shadow. Same ellipse the CSS drew (chips.css .pile::before and .flight-shadow), in screen px.
// ponytail: redraws every frame the table's up, a few dozen rect reads. Only draw while something moves if it ever shows up in a profile
export function ChipShadows() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    const felt = canvas.parentElement!
    let frame = 0

    // centre x, the pile's (or chip's) foot, its width and one chip's thickness, all on screen
    const ellipse = (left: number, foot: number, w: number, rise: number) => {
      const width = w * SHADOW_WIDTH
      const height = width * TILT
      const bottom = foot - (w * (TILT * (0.5 - SHADOW_WIDTH / 2) - 0.06) - rise)
      ctx.moveTo(left + w * 0.55 + width / 2, bottom - height / 2)
      ctx.ellipse(left + w * 0.55, bottom - height / 2, width / 2, height / 2, 0, 0, Math.PI * 2)
    }

    const draw = () => {
      frame = requestAnimationFrame(draw)
      const box = canvas.getBoundingClientRect()
      const dpr = devicePixelRatio || 1
      const w = Math.round(box.width * dpr)
      const h = Math.round(box.height * dpr)
      if (canvas.width !== w || canvas.height !== h) Object.assign(canvas, { width: w, height: h })
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, w, h)
      if (!box.width) return
      // screen px in, the canvas's own pixels out, whatever the felt is scaled to
      const sx = w / box.width
      const sy = h / box.height
      ctx.setTransform(sx, 0, 0, sy, -box.left * sx, -box.top * sy)

      ctx.beginPath()
      for (const pile of felt.querySelectorAll<HTMLElement>('.pile')) {
        // a pot slot with nothing landed in it yet has no chips to cast anything
        if (!pile.childElementCount || !(pile.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) ?? true)) continue
        const r = pile.getBoundingClientRect()
        ellipse(r.left, r.bottom, r.width, PILE_RISE * (r.width / (pile.offsetWidth || r.width)))
      }
      ctx.fillStyle = '#000'
      ctx.fill()

      // a flying chip's box is the chip at its slide's place and scale, before any toss lifts it, so its shadow
      // stays on the felt under it. --foot is the pile level under it, the one it left easing to the one it lands on
      for (const chip of felt.querySelectorAll<HTMLElement>('.flight')) {
        const r = chip.getBoundingClientRect()
        const size = parseFloat(chip.style.getPropertyValue('--chip-size'))
        if (!r.width || !size) continue
        const s = r.width / size
        const rise = PILE_RISE * (parseFloat(chip.style.getPropertyValue('--face-scale')) || 1)
        const style = getComputedStyle(chip)
        const n = parseFloat(style.getPropertyValue('--foot')) || 0
        ctx.globalAlpha = parseFloat(style.opacity)
        ctx.beginPath()
        ellipse(r.left, r.top + (size + n * rise) * s, r.width, rise * s)
        ctx.fill()
        ctx.globalAlpha = 1
      }

      // and everything else on the felt that casts one, so no shadow ever lands on something sitting under it.
      // Their own box-shadows are off at the table (looks.css). 3px 4px down and right like --hard-shadow
      const k = felt.getBoundingClientRect().width / (felt.offsetWidth || 1)
      for (const el of felt.querySelectorAll<HTMLElement>(CASTS)) {
        if (!(el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) ?? true)) continue
        const { matrix, opacity } = toFelt(el, felt)
        if (!opacity) continue
        const r = el.getBoundingClientRect()
        const w = el.offsetWidth
        const h = el.offsetHeight
        const radius = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, w / 2, h / 2)
        ctx.save()
        // a box's bounding rect is centred on the box however it's turned, so that's the centre. The turn, any
        // scale and a card's flip come from the transforms between it and the felt
        ctx.translate(r.left + r.width / 2 + 3 * k, r.top + r.height / 2 + 4 * k)
        ctx.transform(matrix.a * k, matrix.b * k, matrix.c * k, matrix.d * k, 0, 0)
        ctx.globalAlpha = opacity
        ctx.beginPath()
        ctx.roundRect(-w / 2, -h / 2, w, h, radius)
        // a quick message's speech bubble tail, 6px, pointing down or up the way looks.css turned it
        if (el.matches('.said.emote')) {
          const down = parseFloat(getComputedStyle(el, '::after').borderTopWidth) > 0 ? 1 : -1
          ctx.moveTo(-6, (down * h) / 2)
          ctx.lineTo(0, (down * h) / 2 + down * 6)
          ctx.lineTo(6, (down * h) / 2)
        }
        ctx.fill()
        ctx.restore()
      }
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [])

  return <canvas ref={ref} className="chip-shadows" style={{ opacity: SHADOW_ALPHA }} aria-hidden="true" />
}

// everything on the felt with a shadow besides the chips. Keep in step with the --hard-shadow rules in looks.css
const CASTS = [
  '.tcard-face',
  '.tcard .card-back',
  '.seat-plate',
  '.said',
  '.dealer',
  '.total',
  '.chip-total:not(:empty)',
  '.chip-value',
  '.result',
  '.seat-blind',
  '.seat-tag',
  '.pile-label',
].join(', ')

// how an element is turned, scaled and faded relative to the felt, from its own rotate, scale and transform and
// every parent's. Translation's left out, the bounding rect's centre already has it
function toFelt(el: HTMLElement, felt: HTMLElement) {
  let matrix = new DOMMatrix()
  let opacity = 1
  for (let at: HTMLElement | null = el; at && at !== felt; at = at.parentElement) {
    const style = getComputedStyle(at)
    opacity *= parseFloat(style.opacity)
    const own = new DOMMatrix()
    if (style.rotate !== 'none') own.rotateSelf(0, 0, parseFloat(style.rotate.split(' ').at(-1)!))
    if (style.scale !== 'none') {
      const [x, y = x] = style.scale.split(' ').map(parseFloat)
      own.scaleSelf(x, y)
    }
    if (style.transform !== 'none') own.multiplySelf(new DOMMatrix(style.transform))
    matrix = own.multiply(matrix)
  }
  return { matrix, opacity }
}

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

    // a chip's top left corner at its place in a pile, or on the avatar for a seat. A payout pile has no slot of
    // its own, it builds in the bet's
    const spotOf = (spot: Spot, at: At | null): Point | null => {
      const box = document
        .querySelector(spot.startsWith('seat') ? `[data-spot="${spot}"] .avatar` : `[data-spot="${spot.replace('win', 'bet')}"]`)
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

    // everything's tossed onto its pile, bets, the pot and a winner's pile alike. Only chips going home slide
    const thrown = !flight.to.startsWith('seat')
    const throwMs = flight.to === 'pot' ? SWEEP_MS : THROW_MS
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
    // a chip off a seat has no level of its own, so it just starts at the one it lands on
    const fromLevel = flight.from.startsWith('seat') ? (flight.toAt?.level ?? 0) : (flight.fromAt?.level ?? 0)
    const turn = (duration: number) => turnChip(chip, fromLevel, flight.toAt?.level ?? 0, duration, flight.delay)
    if (thrown) {
      animations = [...throwChip(chip, start, end, startScale, flight.delay, throwMs), turn(throwMs * LAND)]
      sound(onChip, { delay: flight.delay + throwMs * LAND, volume: flight.to === 'pot' ? 0.7 : 1 })
    } else {
      const way = slide(end)
      animations = [slideChip(chip, way, startScale, flight.delay, true), turn(slideMs(way))]
      // one grab per stack, a payout chip by chip would be a rattle
      if (flight.order === 0) sound('handle', { delay: flight.delay })
    }
    // Chips come off the top first, so the first flight made is the top chip and DOM order would draw
    // a waiting stack upside down. Until it goes it layers by its place in the pile, then it rises
    // over everything still waiting, and the ones in the air keep DOM order so later ones land on top.
    // Except chips going home, nothing lands, and past the stagger cap a whole stack leaves at once. DOM order
    // drew that sliding stack upside down, so those keep their pile order in the air too. A chip from under the
    // ones a pile draws waits behind its bottom chip, not over it
    const level = flight.fromAt?.hidden ? -1 : (flight.fromAt?.level ?? 0)
    animations.push(
      chip.animate([{ zIndex: 35 + level }, { zIndex: flight.to.startsWith('seat') ? 100 + level : 100 }], {
        duration: 1,
        delay: flight.delay,
        fill: 'both',
      }),
    )
    const slot = flight.to.startsWith('bet') && flight.order === 0 ? document.querySelector(`[data-spot="${flight.to}"]`) : null
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
      <div className="toss-height">
        <div className="toss-spin chip-flip" style={sideStyle(color)}>
          <ChipParts color={color} />
        </div>
      </div>
    </div>
  )
}
