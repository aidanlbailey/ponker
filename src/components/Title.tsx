import { useEffect, useRef, type CSSProperties } from 'react'
import { dodgeTarget, stepSpring, waddle, walkDuration, type Spring } from '../lib/dodge'

const LETTERS = [...'PONKER']
const AVOID_RANGE = 70
const NUDGE = 12 // dropped closer to home than this, it just springs back

const WAVES = LETTERS.map((_, i) => ({
  animationDelay: `${Math.abs(i - 2.5) * 0.5}s`, // ripples out from the middle
  '--wave-start': `${(Math.random() - 0.5) * 6}deg`,
  '--wave-end': `${(Math.random() - 0.5) * 12}deg`,
})) as CSSProperties[]

type Walk = { from: { x: number; y: number }; start: number; duration: number }
type Hold = { index: number; pointerId: number; grabX: number; grabY: number; x: number; y: number }

export function Title() {
  const title = useRef<HTMLHeadingElement>(null)
  const letters = useRef<HTMLSpanElement[]>([])
  const springs = useRef<Spring[]>(LETTERS.map(() => ({ x: 0, y: 0, vx: 0, vy: 0 })))

  useEffect(() => {
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
    const walks: (Walk | null)[] = LETTERS.map(() => null)
    let held: Hold | null = null
    let pointer: { x: number; y: number } | null = null
    let frame = 0
    let lastTime = 0

    const stand = (letter: HTMLSpanElement) => {
      letter.classList.remove('held', 'walking')
      letter.style.rotate = letter.style.scale = ''
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
        const walk = walks[i]

        if (held?.index === i) {
          spring.vx = spring.vy = 0
          spring.x = Math.min(innerWidth - homeX, Math.max(-homeX, held.x - held.grabX))
          spring.y = Math.min(innerHeight - homeY, Math.max(-homeY, held.y - held.grabY))
          moving = true
        } else if (walk) {
          const progress = (now - walk.start) / walk.duration
          if (progress < 1) {
            const pose = waddle(walk.from, Math.max(0, progress))
            spring.x = pose.x
            spring.y = pose.y
            letter.style.rotate = `${pose.tilt}deg`
            letter.style.scale = `${pose.scaleX} ${pose.scaleY}`
            moving = true
          } else {
            spring.x = spring.y = 0
            walks[i] = null
            stand(letter)
          }
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

    const grab = (e: PointerEvent) => {
      const index = letters.current.indexOf(e.target as HTMLSpanElement)
      if (index < 0 || held || reducedMotion.matches) return

      const letter = letters.current[index]!
      const spring = springs.current[index]!
      letter.setPointerCapture(e.pointerId)
      walks[index] = null
      stand(letter)
      letter.classList.add('held')
      held = {
        index,
        pointerId: e.pointerId,
        grabX: e.clientX - spring.x,
        grabY: e.clientY - spring.y,
        x: e.clientX,
        y: e.clientY,
      }
      wake()
    }

    const drop = (e: PointerEvent) => {
      if (held?.pointerId !== e.pointerId) return

      const { index } = held
      const letter = letters.current[index]!
      const { x, y } = springs.current[index]!
      const distance = Math.hypot(x, y)
      held = null
      stand(letter)

      if (distance > NUDGE) {
        walks[index] = { from: { x, y }, start: performance.now(), duration: walkDuration(distance) }
        letter.classList.add('walking')
      }
      wake()
    }

    // on the window, not the title. letters dodge out of the title's box, and losing the cursor there
    // released them straight back into it, over and over
    const track = (e: PointerEvent) => {
      if (held?.pointerId === e.pointerId) {
        held.x = e.clientX
        held.y = e.clientY
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
