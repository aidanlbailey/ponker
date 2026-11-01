import { useEffect, useRef, type CSSProperties } from 'react'
import { dodgeTarget, stepSpring, type Spring } from '../lib/dodge'

const LETTERS = [...'PONKER']
const AVOID_RANGE = 70

const WAVES = LETTERS.map((_, i) => ({
  animationDelay: `${Math.abs(i - 2.5) * 0.5}s`, // ripples out from the middle
  '--wave-start': `${(Math.random() - 0.5) * 6}deg`,
  '--wave-end': `${(Math.random() - 0.5) * 12}deg`,
})) as CSSProperties[]

export function Title() {
  const title = useRef<HTMLHeadingElement>(null)
  const letters = useRef<HTMLSpanElement[]>([])
  const springs = useRef<Spring[]>(LETTERS.map(() => ({ x: 0, y: 0, vx: 0, vy: 0 })))

  useEffect(() => {
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
    let pointer: { x: number; y: number } | null = null
    let frame = 0
    let lastTime = 0

    const tick = (now: number) => {
      const seconds = (now - lastTime) / 1000
      lastTime = now
      const box = title.current!.getBoundingClientRect()
      let moving = false

      letters.current.forEach((letter, i) => {
        // offset rather than a live rect, so the wave and the dodge itself don't shift the home spot
        const dx = (pointer?.x ?? Infinity) - (box.left + letter.offsetLeft + letter.offsetWidth / 2)
        const dy = (pointer?.y ?? Infinity) - (box.top + letter.offsetTop + letter.offsetHeight / 2)
        const radius = Math.max(letter.offsetWidth, letter.offsetHeight) * 0.6 + AVOID_RANGE
        const spring = springs.current[i]!

        if (!stepSpring(spring, dodgeTarget(dx, dy, radius), seconds)) moving = true
        letter.style.translate = `${spring.x}px ${spring.y}px`
      })

      frame = moving ? requestAnimationFrame(tick) : 0
    }

    const wake = () => {
      if (frame || reducedMotion.matches) return
      lastTime = performance.now()
      frame = requestAnimationFrame(tick)
    }

    // on the window, not the title. letters dodge out of the title's box, and losing the cursor there
    // released them straight back into it, over and over
    const track = (e: PointerEvent) => {
      const target = e.target as Element
      const offTitle = e.pointerType !== 'mouse' && !title.current?.contains(target)
      pointer = offTitle || target.closest?.('dialog') ? null : { x: e.clientX, y: e.clientY }
      wake()
    }

    const release = () => {
      pointer = null
      wake()
    }

    const liftFinger = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') release()
    }

    window.addEventListener('pointermove', track, { passive: true })
    window.addEventListener('pointerup', liftFinger)
    window.addEventListener('pointercancel', release)
    document.documentElement.addEventListener('pointerleave', release)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', track)
      window.removeEventListener('pointerup', liftFinger)
      window.removeEventListener('pointercancel', release)
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
