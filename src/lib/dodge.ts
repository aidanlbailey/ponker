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

const HOP_MS = 260
const WALK_SPEED = 380

export const walkDuration = (distance: number) => Math.min(2600, Math.max(800, (distance / WALK_SPEED) * 1000))

// a letter's pose while it waddles home. each half sine is one hop, and because the sine
// flips sign between hops the same value rocks it side to side
export function waddle(from: { x: number; y: number }, progress: number) {
  const distance = Math.hypot(from.x, from.y)
  const steps = Math.max(3, Math.round(walkDuration(distance) / HOP_MS)) // same rhythm on any length of trip
  const stride = Math.sin(progress * steps * Math.PI)
  const hop = Math.abs(stride) * Math.min(24, 10 + distance * 0.03)
  const travelled = progress * progress * (3 - 2 * progress)
  const squash = (1 - Math.abs(stride)) ** 3 * 0.14 // flattest as it lands

  return {
    x: from.x * (1 - travelled),
    y: from.y * (1 - travelled) - hop,
    tilt: stride * 14,
    scaleX: 1 + squash * 0.7,
    scaleY: 1 - squash,
  }
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
