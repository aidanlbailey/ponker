const MAX_PUSH = 36
const PEAK = 4 / 27 // highest value of t * (1 - t)^2, reached a third of the way out
const STIFFNESS = 70
const DAMPING = 2 * Math.sqrt(STIFFNESS) // critically damped, so letters settle without wobbling
const MAX_STEP = 1 / 30 // keeps the spring stable after a long frame or a background tab

export type Spring = { x: number; y: number; vx: number; vy: number }

// fades to zero at the center as well as the edge. a push that peaks at the center
// flips direction the instant the cursor crosses it, which snaps the letter across
export function dodgeTarget(dx: number, dy: number, radius: number) {
  const t = Math.hypot(dx, dy) / radius
  if (t >= 1) return { x: 0, y: 0 }

  const strength = ((1 - t) ** 2 * MAX_PUSH) / PEAK
  return { x: (-dx / radius) * strength, y: (-dy / radius) * strength }
}

// runs on elapsed time rather than per frame, so it feels the same at 60Hz and 144Hz
export function stepSpring(spring: Spring, target: { x: number; y: number }, seconds: number) {
  const dt = Math.min(seconds, MAX_STEP)
  spring.vx += (STIFFNESS * (target.x - spring.x) - DAMPING * spring.vx) * dt
  spring.vy += (STIFFNESS * (target.y - spring.y) - DAMPING * spring.vy) * dt
  spring.x += spring.vx * dt
  spring.y += spring.vy * dt

  const settled =
    Math.hypot(target.x - spring.x, target.y - spring.y) < 0.05 && Math.hypot(spring.vx, spring.vy) < 0.5

  if (settled) {
    spring.x = target.x
    spring.y = target.y
    spring.vx = spring.vy = 0
  }

  return settled
}
