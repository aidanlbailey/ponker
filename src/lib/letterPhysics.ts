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

const DRAG = 1.8
const WALL_BOUNCE = 0.45
const STOP_SPEED = 70
const SMACK_SPEED = 650
const MAX_THROW = 4000
const THROW_SPEED = 600
const VELOCITY_WINDOW_MS = 90
const SPIN = 0.5 // degrees per second for every px/s thrown sideways

export type Sample = { time: number; x: number; y: number }
export type Side = 'left' | 'right' | 'top' | 'bottom'
export type Flight = { x: number; y: number; vx: number; vy: number; angle: number; spin: number }
export type Box = { left: number; right: number; top: number; bottom: number }

// speed over the last moment of the drag. holding still before letting go reads as zero, not a throw
export function releaseVelocity(samples: Sample[], now: number) {
  const recent = samples.filter((sample) => now - sample.time <= VELOCITY_WINDOW_MS)
  const first = recent[0]
  const last = recent.at(-1)
  if (!first || !last || last.time === first.time) return { x: 0, y: 0 }

  const seconds = (last.time - first.time) / 1000
  const x = (last.x - first.x) / seconds
  const y = (last.y - first.y) / seconds
  const limit = Math.min(1, MAX_THROW / (Math.hypot(x, y) || 1))
  return { x: x * limit, y: y * limit }
}

export const isThrow = (velocity: { x: number; y: number }) => Math.hypot(velocity.x, velocity.y) >= THROW_SPEED

export const launch = (x: number, y: number, velocity: { x: number; y: number }, angle = 0, spin = 0): Flight => ({
  x,
  y,
  vx: velocity.x,
  vy: velocity.y,
  angle,
  spin: Math.max(-1440, Math.min(1440, velocity.x * SPIN + spin)),
})

// moves a thrown letter one frame. soft hits bounce and carry on, a hard one returns the wall it smacked
export function stepFlight(flight: Flight, box: Box, seconds: number): Side | null {
  const dt = Math.min(seconds, MAX_STEP)
  const slowdown = Math.exp(-DRAG * dt)
  flight.vx *= slowdown
  flight.vy *= slowdown
  flight.spin *= slowdown
  flight.x += flight.vx * dt
  flight.y += flight.vy * dt
  flight.angle += flight.spin * dt

  let side: Side | null = null
  let hardest = 0
  const hit = (wall: Side, speed: number) => {
    if (speed > hardest) {
      hardest = speed
      side = wall
    }
  }

  if (flight.x < box.left || flight.x > box.right) {
    hit(flight.x < box.left ? 'left' : 'right', Math.abs(flight.vx))
    flight.x = Math.max(box.left, Math.min(box.right, flight.x))
    flight.vx *= -WALL_BOUNCE
  }
  if (flight.y < box.top || flight.y > box.bottom) {
    hit(flight.y < box.top ? 'top' : 'bottom', Math.abs(flight.vy))
    flight.y = Math.max(box.top, Math.min(box.bottom, flight.y))
    flight.vy *= -WALL_BOUNCE
  }

  return hardest >= SMACK_SPEED ? side : null
}

export const hasStopped = (flight: Flight) => Math.hypot(flight.vx, flight.vy) < STOP_SPEED

// shortest way round, so a letter that spun twice doesn't unwind both turns
export const nearestAngle = (angle: number) => ((((angle + 180) % 360) + 360) % 360) - 180

const SMACK_TILT = 80

// tips away from the wall it hit
export const fallDirection = (side: Side, vx: number) =>
  (side === 'left' ? 1 : side === 'right' ? -1 : vx < 0 ? -1 : 1) * SMACK_TILT

// flat against the wall, then peeling off it
export function smack(side: Side, startAngle: number, fall: number, progress: number) {
  const flat = 1 - 0.55 * (1 - progress) ** 3
  const wide = 1 + (1 - flat) * 0.7
  const sideways = side === 'left' || side === 'right'
  const eased = progress * progress * (3 - 2 * progress)

  return {
    tilt: startAngle + (fall - startAngle) * eased,
    scaleX: sideways ? flat : wide,
    scaleY: sideways ? wide : flat,
    offWall: Math.sin((progress * Math.PI) / 2) * 16,
  }
}

// how far over it's leaning through a stumble: tries to get up, slumps, then makes it
const LEAN: [time: number, lean: number][] = [
  [0, 1],
  [0.3, 0.3],
  [0.5, 0.75],
  [0.8, -0.12],
  [1, 0],
]

export function stumble(fall: number, progress: number) {
  const next = Math.max(1, LEAN.findIndex(([time]) => time >= progress))
  const [startTime, startLean] = LEAN[next - 1]!
  const [endTime, endLean] = LEAN[next]!
  const t = (progress - startTime) / (endTime - startTime)
  const eased = t * t * (3 - 2 * t)
  const lean = startLean + (endLean - startLean) * eased
  const effort = Math.sin(progress * Math.PI * 3) ** 2

  return {
    tilt: fall * lean,
    lift: effort * 6 * (1 - progress),
    scaleX: 1 + (1 - effort) * 0.05 * (1 - progress),
    scaleY: 1 - (1 - effort) * 0.08 * (1 - progress),
  }
}

const GRAVITY = 2500
const SWING_DAMPING = 2.2
const INERTIA = 0.6 // share of the cursor's motion that reaches the letter, lower feels heavier
const MAX_SWING_SPEED = 40
const MAX_PIVOT_ACCELERATION = 30000

// radians from hanging straight down, positive when swung out to the right
export type Swing = { angle: number; speed: number }

const clampAcceleration = (value: number) => Math.max(-MAX_PIVOT_ACCELERATION, Math.min(MAX_PIVOT_ACCELERATION, value))

// a pendulum on a moving pivot. the pivot's acceleration is what pumps the swing, so circling
// the cursor keeps adding energy until the letter goes all the way around
export function stepSwing(swing: Swing, pivot: { x: number; y: number }, length: number, seconds: number) {
  const dt = Math.min(seconds, MAX_STEP)
  const ax = clampAcceleration(pivot.x) * INERTIA
  const ay = clampAcceleration(pivot.y) * INERTIA
  const acceleration =
    -((GRAVITY - ay) * Math.sin(swing.angle) + ax * Math.cos(swing.angle)) / length - SWING_DAMPING * swing.speed

  swing.speed = Math.max(-MAX_SWING_SPEED, Math.min(MAX_SWING_SPEED, swing.speed + acceleration * dt))
  swing.angle += swing.speed * dt
}

// css rotate that lines the letter up with the swing, top towards the pivot
export const swingTilt = (swing: Swing) => (-swing.angle * 180) / Math.PI

export const swingSpin = (swing: Swing) => (-swing.speed * 180) / Math.PI

// how fast the letter's middle is moving because of the swing, added to a throw
export const swingVelocity = (swing: Swing, length: number) => ({
  x: length * swing.speed * Math.cos(swing.angle),
  y: -length * swing.speed * Math.sin(swing.angle),
})

// letters rotate around their bottom center, so this is the translate that keeps the top on the pointer
export function hangingOffset(
  pointer: { x: number; y: number },
  bottom: { x: number; y: number },
  height: number,
  tilt: number,
) {
  const radians = (tilt * Math.PI) / 180
  return { x: pointer.x - bottom.x - height * Math.sin(radians), y: pointer.y - bottom.y + height * Math.cos(radians) }
}

// letters tip and walk around their base but spin around their middle in flight, as anything does in
// free air. this is the gap between the two at a given tilt, for swapping pivots without a visible jump
export function pivotShift(height: number, tilt: number) {
  const radians = (tilt * Math.PI) / 180
  return { x: (height / 2) * Math.sin(radians), y: (height / 2) * (1 - Math.cos(radians)) }
}
