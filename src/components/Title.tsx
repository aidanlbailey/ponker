import { useEffect, useRef, type CSSProperties } from 'react'
import { haptic } from '../lib/haptics'
import {
  dodgeTarget,
  fallDirection,
  hasStopped,
  isThrow,
  launch,
  nearestAngle,
  releaseVelocity,
  smack,
  stepFlight,
  stepSpring,
  stumble,
  waddle,
  walkDuration,
  type Flight,
  type Sample,
  type Side,
  type Spring,
} from '../lib/letterPhysics'

const LETTERS = [...'PONKER']
const AVOID_RANGE = 70
const NUDGE = 12 // dropped closer to home than this, it just springs back
const GRAB_REACH = 60
const SMACK_MS = 420
const FALLEN_STUMBLE_MS = 1300
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
  | { kind: 'stumble'; start: number; duration: number; fall: number; x: number; y: number }
  | { kind: 'walk'; start: number; duration: number; from: { x: number; y: number } }

type Hold = { index: number; pointerId: number; grabX: number; grabY: number; x: number; y: number; samples: Sample[] }

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
      letter.classList.remove('held', 'away')
      letter.style.rotate = letter.style.scale = ''
    }

    const pose = (letter: HTMLSpanElement, tilt: number, scaleX = 1, scaleY = 1) => {
      letter.style.rotate = `${tilt}deg`
      letter.style.scale = `${scaleX} ${scaleY}`
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

        if (side) {
          haptic('error')
          trips[i] = {
            kind: 'smack',
            start: now,
            side,
            startAngle: nearestAngle(flight.angle),
            fall: fallDirection(side, flight.vx),
            x: spring.x,
            y: spring.y,
          }
        } else if (hasStopped(flight)) {
          const fall = Math.max(-35, Math.min(35, nearestAngle(flight.angle)))
          trips[i] = { kind: 'stumble', start: now, duration: DIZZY_STUMBLE_MS, fall, x: spring.x, y: spring.y }
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

        if (progress === 1) {
          trips[i] = {
            kind: 'stumble',
            start: now,
            duration: FALLEN_STUMBLE_MS,
            fall: trip.fall,
            x: spring.x,
            y: spring.y,
          }
        }
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
          spring.vx = spring.vy = 0
          spring.x = Math.min(innerWidth - homeX, Math.max(-homeX, held.x - held.grabX))
          spring.y = Math.min(innerHeight - homeY, Math.max(-homeY, held.y - held.grabY))
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
      const spring = springs.current[index]!
      letter.setPointerCapture(e.pointerId)
      trips[index] = null
      stand(letter)
      letter.classList.add('held')
      held = {
        index,
        pointerId: e.pointerId,
        grabX: e.clientX - spring.x,
        grabY: e.clientY - spring.y,
        x: e.clientX,
        y: e.clientY,
        samples: [{ time: e.timeStamp, x: e.clientX, y: e.clientY }],
      }
      wake()
    }

    const drop = (e: PointerEvent) => {
      if (held?.pointerId !== e.pointerId) return

      const { index, samples } = held
      const letter = letters.current[index]!
      const { x, y } = springs.current[index]!
      const velocity = releaseVelocity(samples, e.timeStamp)
      held = null
      stand(letter)

      if (isThrow(velocity)) {
        const box = title.current!.getBoundingClientRect()
        const homeX = box.left + letter.offsetLeft + letter.offsetWidth / 2
        const homeY = box.top + letter.offsetTop + letter.offsetHeight / 2
        trips[index] = { kind: 'flight', flight: launch(homeX + x, homeY + y, velocity) }
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
            style={WAVES[i]}
          >
            {letter}
          </span>
        ))}
      </h1>
      <p className="subtitle">by aidan bailey</p>
    </header>
  )
}
