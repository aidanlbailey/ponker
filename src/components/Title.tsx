import { useEffect, useRef, type CSSProperties, type PointerEvent } from 'react'

const LETTERS = [...'PONKER']
const AVOID_RANGE = 80
const MAX_OFFSET = 60
const AVOID_EASE = 0.08
const RETURN_EASE = 0.04

const WAVES = LETTERS.map((_, i) => ({
  animationDelay: `${Math.abs(i - 2.5) * 0.5}s`, // ripples out from the middle
  '--wave-start': `${(Math.random() - 0.5) * 6}deg`,
  '--wave-end': `${(Math.random() - 0.5) * 12}deg`,
})) as CSSProperties[]

export function Title() {
  const letters = useRef<HTMLSpanElement[]>([])
  const offsets = useRef(LETTERS.map(() => ({ x: 0, y: 0 })))
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const frame = useRef(0)

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const tick = () => {
    let moving = false

    letters.current.forEach((letter, i) => {
      const offset = offsets.current[i]!
      const rect = letter.getBoundingClientRect()
      const dx = (pointer.current?.x ?? Infinity) - (rect.left + rect.width / 2 - offset.x)
      const dy = (pointer.current?.y ?? Infinity) - (rect.top + rect.height / 2 - offset.y)
      const distance = Math.hypot(dx, dy)
      const radius = Math.max(rect.width, rect.height) * 0.6 + AVOID_RANGE

      if (distance > 0 && distance < radius) {
        const push = (1 - distance / radius) ** 2 * MAX_OFFSET
        offset.x += (-(dx / distance) * push - offset.x) * AVOID_EASE
        offset.y += (-(dy / distance) * push - offset.y) * AVOID_EASE
      } else {
        offset.x *= 1 - RETURN_EASE
        offset.y *= 1 - RETURN_EASE
      }

      if (Math.abs(offset.x) < 0.1 && Math.abs(offset.y) < 0.1) offset.x = offset.y = 0
      else moving = true

      letter.style.setProperty('--dodge-x', `${offset.x}px`)
      letter.style.setProperty('--dodge-y', `${offset.y}px`)
    })

    frame.current = moving || pointer.current ? requestAnimationFrame(tick) : 0
  }

  const track = (e: PointerEvent) => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    pointer.current = { x: e.clientX, y: e.clientY }
    if (!frame.current) frame.current = requestAnimationFrame(tick)
  }

  const release = () => {
    pointer.current = null
  }

  return (
    <header className="title-section">
      <h1
        className="title"
        aria-label="Ponker"
        onPointerMove={track}
        onPointerLeave={release}
        onPointerUp={release}
        onPointerCancel={release}
      >
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
