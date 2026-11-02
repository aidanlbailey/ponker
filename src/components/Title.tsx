import { useEffect, useRef, type CSSProperties } from 'react'
import { haptic } from '../lib/haptics'
import {
  dodgeTarget,
  fallDirection,
  hangingOffset,
  hasStopped,
  isThrow,
  launch,
  nearestAngle,
  pivotShift,
  releaseVelocity,
  smack,
  SPRING_HOP,
  springUp,
  stepFlight,
  stepSpring,
  stepSwing,
  stumble,
  swingSpin,
  swingTilt,
  swingVelocity,
  waddle,
  walkDuration,
  type Flight,
  type Sample,
  type Side,
  type Spring,
  type Swing,
} from '../lib/letterPhysics'
import { Chip } from './Chip'

const LETTERS = [...'PONKER']
const AVOID_RANGE = 70
const NUDGE = 12 // dropped closer to home than this, it just springs back
const GRAB_REACH = 60
const HELD_SCALE = 1.15 // keep in step with .held in styles.css
const SWING_LENGTH = 0.55 // how far down the letter its weight sits, as a share of its height
const SLACK_EASE = 12 // how quickly the letter slides from where it was grabbed to hanging by its top
const PIVOT_SMOOTHING = 40 // mice report far less often than the screen draws, so the pivot is smoothed
const UPRIGHT = 3 // degrees of lean that still counts as standing
const SMACK_MS = 420
const SPRING_MS = 1600
const DIZZY_STUMBLE_MS = 700

const WAVES = LETTERS.map((_, i) => ({
  animationDelay: `${Math.abs(i - 2.5) * 0.5}s`, // ripples out from the middle
  '--wave-start': `${(Math.random() - 0.5) * 6}deg`,
  '--wave-end': `${(Math.random() - 0.5) * 12}deg`,
})) as CSSProperties[]

// what a letter is doing while it's away from home, in the order it happens
type Trip =
  | { kind: 'flight'; flight: Flight }
  | { kind: 'smack'; start: number; side: Side; startAngle: number; fall: number; x: number; y: number }
  | { kind: 'spring'; start: number; fall: number; x: number; y: number }
  | { kind: 'stumble'; start: number; duration: number; fall: number; x: number; y: number }
  | { kind: 'walk'; start: number; duration: number; from: { x: number; y: number } }

type Hold = {
  index: number
  pointerId: number
  x: number
  y: number
  samples: Sample[]
  swing: Swing
  pivot: { x: number; y: number; vx: number; vy: number }
  slack: { x: number; y: number } | null
}

const WALL_DIRECTION: Record<Side, { x: number; y: number }> = {
  left: { x: 1, y: 0 },
  right: { x: -1, y: 0 },
  top: { x: 0, y: 1 },
  bottom: { x: 0, y: -1 },
}

export function Title() {
  const title = useRef<HTMLHeadingElement>(null)
  const letters = useRef<HTMLSpanElement[]>([])
  const springs = useRef<Spring[]>(LETTERS.map(() => ({ x: 0, y: 0, vx: 0, vy: 0 })))

  useEffect(() => {
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
    const trips: (Trip | null)[] = LETTERS.map(() => null)
    let held: Hold | null = null
    let pointer: { x: number; y: number } | null = null
    let frame = 0
    let lastTime = 0

    const stand = (letter: HTMLSpanElement) => {
      letter.classList.remove('held', 'away', 'flying')
      letter.style.rotate = letter.style.scale = ''
      letter.style.removeProperty('--tilt')
      letter.style.removeProperty('--mirror')
    }

    // --tilt is what keeps the cast shadow pointing the same way on screen, see .title in styles.css.
    // the wave is paused while a letter's away but it's still leaning, so that counts too
    const setTilt = (letter: HTMLSpanElement, tilt: number) => {
      const { a, b } = new DOMMatrix(getComputedStyle(letter).transform)
      letter.style.rotate = `${tilt}deg`
      letter.style.setProperty('--tilt', `${tilt + (Math.atan2(b, a) * 180) / Math.PI}deg`)
    }

    const pose = (letter: HTMLSpanElement, tilt: number, scaleX = 1, scaleY = 1) => {
      setTilt(letter, tilt)
      letter.style.scale = `${scaleX} ${scaleY}`
      letter.style.setProperty('--mirror', scaleX < 0 ? '-1' : '1')
    }

    const startWalk = (i: number, now: number, from: { x: number; y: number }) => {
      trips[i] = { kind: 'walk', start: now, duration: walkDuration(Math.hypot(from.x, from.y)), from }
    }

    // moves a letter along its trip, and returns false once it's home
    const advance = (i: number, trip: Trip, now: number, seconds: number, homeX: number, homeY: number) => {
      const letter = letters.current[i]!
      const spring = springs.current[i]!

      if (trip.kind === 'flight') {
        const { flight } = trip
        const halfWidth = letter.offsetWidth / 2
        const halfHeight = letter.offsetHeight / 2
        const side = stepFlight(
          flight,
          { left: halfWidth, right: innerWidth - halfWidth, top: halfHeight, bottom: innerHeight - halfHeight },
          seconds,
        )
        spring.x = flight.x - homeX
        spring.y = flight.y - homeY
        pose(letter, flight.angle)

        if (side || hasStopped(flight)) {
          // back to pivoting on its base, moved so the letter stays exactly where it is
          const tilt = nearestAngle(flight.angle)
          const shift = pivotShift(letter.offsetHeight, tilt)
          spring.x -= shift.x
          spring.y -= shift.y
          letter.classList.remove('flying')
          const landed = { start: now, x: spring.x, y: spring.y }

          if (side) {
            haptic('error')
            trips[i] = { kind: 'smack', ...landed, side, startAngle: tilt, fall: fallDirection(side, flight.vx) }
          } else {
            trips[i] = { kind: 'stumble', ...landed, duration: DIZZY_STUMBLE_MS, fall: tilt }
          }
        }
        return true
      }

      if (trip.kind === 'smack') {
        const progress = Math.min(1, (now - trip.start) / SMACK_MS)
        const { tilt, scaleX, scaleY, offWall } = smack(trip.side, trip.startAngle, trip.fall, progress)
        const away = WALL_DIRECTION[trip.side]
        spring.x = trip.x + away.x * offWall
        spring.y = trip.y + away.y * offWall
        pose(letter, tilt, scaleX, scaleY)

        if (progress === 1) trips[i] = { kind: 'spring', start: now, fall: trip.fall, x: spring.x, y: spring.y }
        return true
      }

      if (trip.kind === 'spring') {
        const progress = Math.min(1, (now - trip.start) / SPRING_MS)
        const { tilt, lift, scaleX, scaleY } = springUp(trip.fall, progress)
        // a letter knocked into the top of the screen can't jump the full height without leaving it
        const room = homeY + trip.y - letter.offsetHeight / 2
        spring.x = trip.x
        spring.y = trip.y - lift * Math.max(0, Math.min(SPRING_HOP, room))
        pose(letter, tilt, scaleX, scaleY)
        if (progress === 1) startWalk(i, now, { x: trip.x, y: trip.y })
        return true
      }

      if (trip.kind === 'stumble') {
        const progress = Math.min(1, (now - trip.start) / trip.duration)
        const { tilt, lift, scaleX, scaleY } = stumble(trip.fall, progress)
        spring.x = trip.x
        spring.y = trip.y - lift
        pose(letter, tilt, scaleX, scaleY)
        if (progress === 1) startWalk(i, now, { x: trip.x, y: trip.y })
        return true
      }

      const progress = (now - trip.start) / trip.duration
      if (progress >= 1) {
        spring.x = spring.y = 0
        trips[i] = null
        stand(letter)
        return false
      }

      const { x, y, tilt, scaleX, scaleY } = waddle(trip.from, Math.max(0, progress))
      spring.x = x
      spring.y = y
      pose(letter, tilt, scaleX, scaleY)
      return true
    }

    // hangs by its top from the cursor, swinging like a pendulum
    const carry = (hold: Hold, letter: HTMLSpanElement, spring: Spring, homeX: number, homeY: number, seconds: number) => {
      const dt = Math.max(seconds, 0.001)
      const { pivot, swing } = hold
      const follow = 1 - Math.exp(-PIVOT_SMOOTHING * dt)
      const vx = ((hold.x - pivot.x) * follow) / dt
      const vy = ((hold.y - pivot.y) * follow) / dt
      const acceleration = { x: (vx - pivot.vx) / dt, y: (vy - pivot.vy) / dt }
      pivot.x += vx * dt
      pivot.y += vy * dt
      pivot.vx = vx
      pivot.vy = vy

      const height = letter.offsetHeight * HELD_SCALE
      stepSwing(swing, acceleration, height * SWING_LENGTH, dt)

      const tilt = swingTilt(swing)
      const bottom = { x: homeX, y: homeY + letter.offsetHeight / 2 }
      const pointer = {
        x: Math.max(0, Math.min(innerWidth, hold.x)),
        y: Math.max(0, Math.min(innerHeight, hold.y)),
      }
      const hanging = hangingOffset(pointer, bottom, height, tilt)

      hold.slack ??= { x: spring.x - hanging.x, y: spring.y - hanging.y }
      const fade = Math.exp(-SLACK_EASE * dt)
      hold.slack.x *= fade
      hold.slack.y *= fade

      spring.vx = spring.vy = 0
      spring.x = hanging.x + hold.slack.x
      spring.y = hanging.y + hold.slack.y
      setTilt(letter, tilt)
    }

    const tick = (now: number) => {
      const seconds = (now - lastTime) / 1000
      lastTime = now
      const box = title.current!.getBoundingClientRect()
      let moving = false

      letters.current.forEach((letter, i) => {
        // offset rather than a live rect, so the wave and the dodge itself don't shift the home spot
        const homeX = box.left + letter.offsetLeft + letter.offsetWidth / 2
        const homeY = box.top + letter.offsetTop + letter.offsetHeight / 2
        const spring = springs.current[i]!
        const trip = trips[i]

        if (held?.index === i) {
          carry(held, letter, spring, homeX, homeY, seconds)
          moving = true
        } else if (trip) {
          if (advance(i, trip, now, seconds, homeX, homeY)) moving = true
        } else {
          const radius = Math.max(letter.offsetWidth, letter.offsetHeight) * 0.6 + AVOID_RANGE
          const target = dodgeTarget((pointer?.x ?? Infinity) - homeX, (pointer?.y ?? Infinity) - homeY, radius)
          if (!stepSpring(spring, target, seconds)) moving = true
        }

        letter.style.translate = `${spring.x}px ${spring.y}px`
      })

      frame = moving ? requestAnimationFrame(tick) : 0
    }

    const wake = () => {
      if (frame || reducedMotion.matches) return
      lastTime = performance.now()
      frame = requestAnimationFrame(tick)
    }

    // letters dodge the cursor, so one can slip out from under it just as you press
    const nearestLetter = (e: PointerEvent) => {
      const direct = letters.current.indexOf(e.target as HTMLSpanElement)
      if (direct >= 0) return direct

      let nearest = -1
      let shortest = GRAB_REACH
      letters.current.forEach((letter, i) => {
        const { left, top, width, height } = letter.getBoundingClientRect()
        const distance = Math.hypot(e.clientX - left - width / 2, e.clientY - top - height / 2)
        if (distance < shortest) {
          shortest = distance
          nearest = i
        }
      })
      return nearest
    }

    const grab = (e: PointerEvent) => {
      const index = nearestLetter(e)
      if (index < 0 || held || reducedMotion.matches) return

      e.preventDefault() // otherwise a press in the gaps starts selecting page text
      const letter = letters.current[index]!
      const currentTilt = parseFloat(letter.style.rotate) || 0
      letter.setPointerCapture(e.pointerId)
      trips[index] = null
      stand(letter)
      letter.classList.add('held')
      held = {
        index,
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        samples: [{ time: e.timeStamp, x: e.clientX, y: e.clientY }],
        swing: { angle: (-nearestAngle(currentTilt) * Math.PI) / 180, speed: 0 },
        pivot: { x: e.clientX, y: e.clientY, vx: 0, vy: 0 },
        slack: null,
      }
      wake()
    }

    const drop = (e: PointerEvent) => {
      if (held?.pointerId !== e.pointerId) return

      const { index, samples, swing } = held
      const letter = letters.current[index]!
      const { x, y } = springs.current[index]!
      const hand = releaseVelocity(samples, e.timeStamp)
      const flung = swingVelocity(swing, letter.offsetHeight * HELD_SCALE * SWING_LENGTH)
      const velocity = { x: hand.x + flung.x, y: hand.y + flung.y }
      const tilt = swingTilt(swing)
      const fall = nearestAngle(tilt)
      held = null
      stand(letter)

      if (isThrow(velocity)) {
        const box = title.current!.getBoundingClientRect()
        const homeX = box.left + letter.offsetLeft + letter.offsetWidth / 2
        const homeY = box.top + letter.offsetTop + letter.offsetHeight / 2
        // spins around its own middle in the air, so launch from where the middle is right now
        const shift = pivotShift(letter.offsetHeight * HELD_SCALE, tilt)
        trips[index] = {
          kind: 'flight',
          flight: launch(homeX + x + shift.x, homeY + y + shift.y, velocity, tilt, swingSpin(swing)),
        }
        letter.classList.add('away', 'flying')
      } else if (Math.abs(fall) > UPRIGHT) {
        // still swung over, so it rights itself first rather than snapping upright to walk
        trips[index] = { kind: 'stumble', start: performance.now(), duration: DIZZY_STUMBLE_MS, fall, x, y }
        pose(letter, fall)
        letter.classList.add('away')
      } else if (Math.hypot(x, y) > NUDGE) {
        startWalk(index, performance.now(), { x, y })
        letter.classList.add('away')
      }
      wake()
    }

    // on the window, not the title. letters dodge out of the title's box, and losing the cursor there
    // released them straight back into it, over and over
    const track = (e: PointerEvent) => {
      if (held?.pointerId === e.pointerId) {
        held.x = e.clientX
        held.y = e.clientY
        held.samples.push({ time: e.timeStamp, x: e.clientX, y: e.clientY })
        if (held.samples.length > 30) held.samples.shift()
      }
      const target = e.target as Element
      const offTitle = e.pointerType !== 'mouse' && !title.current?.contains(target)
      pointer = offTitle || target.closest?.('dialog') ? null : { x: e.clientX, y: e.clientY }
      wake()
    }

    const release = () => {
      pointer = null
      wake()
    }

    const pointerUp = (e: PointerEvent) => {
      drop(e)
      if (e.pointerType !== 'mouse') release()
    }

    const pointerCancel = (e: PointerEvent) => {
      drop(e)
      release()
    }

    const heading = title.current!
    heading.addEventListener('pointerdown', grab)
    window.addEventListener('pointermove', track, { passive: true })
    window.addEventListener('pointerup', pointerUp)
    window.addEventListener('pointercancel', pointerCancel)
    document.documentElement.addEventListener('pointerleave', release)

    return () => {
      cancelAnimationFrame(frame)
      heading.removeEventListener('pointerdown', grab)
      window.removeEventListener('pointermove', track)
      window.removeEventListener('pointerup', pointerUp)
      window.removeEventListener('pointercancel', pointerCancel)
      document.documentElement.removeEventListener('pointerleave', release)
    }
  }, [])

  return (
    <header className="title-section">
      <h1 ref={title} className="title" aria-label="Ponker">
        {LETTERS.map((letter, i) => (
          <span
            key={i}
            ref={(el) => {
              if (el) letters.current[i] = el
            }}
            aria-hidden="true"
            className={letter === 'O' ? 'title-chip' : undefined}
            data-letter={letter}
            style={WAVES[i]}
          >
            {letter === 'O' ? <Chip color="var(--title-chip)" /> : letter}
          </span>
        ))}
      </h1>
      <p className="subtitle">by aidan bailey</p>
    </header>
  )
}
