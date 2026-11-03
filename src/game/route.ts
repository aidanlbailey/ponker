export type Point = { x: number; y: number }
export type Box = { left: number; top: number; right: number; bottom: number }

const SAMPLES = 24
const SMOOTHING = 3

const inside = (p: Point, box: Box) => p.x > box.left && p.x < box.right && p.y > box.top && p.y < box.bottom

// ponytail: sampled rather than a proper segment-box test. 24 steps can't miss a box of card height
function crosses(a: Point, b: Point, box: Box) {
  for (let i = 1; i < SAMPLES; i++) {
    const t = i / SAMPLES
    if (inside({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, box)) return true
  }
  return false
}

// Chaikin corner cutting: rounds the corners off, keeps both ends where they were
function smooth(points: Point[]) {
  let out = points
  for (let round = 0; round < SMOOTHING; round++) {
    const next = [out[0]!]
    for (let i = 0; i < out.length - 1; i++) {
      const [p, q] = [out[i]!, out[i + 1]!]
      next.push({ x: p.x * 0.75 + q.x * 0.25, y: p.y * 0.75 + q.y * 0.25 })
      next.push({ x: p.x * 0.25 + q.x * 0.75, y: p.y * 0.25 + q.y * 0.75 })
    }
    next.push(out.at(-1)!)
    out = next
  }
  return out
}

const clear = (path: Point[], box: Box) => path.every((p, i) => !i || !crosses(path[i - 1]!, p, box))

// A path from a to b that goes round the box by its nearer side instead of across it.
// Rounding the corners cuts them a little, so the corners start out past the box and
// move further out until the rounded path is clear of it.
export function route(a: Point, b: Point, box: Box): Point[] {
  if (!crosses(a, b, box)) return [a, b]
  const detour = (x: number) => Math.abs(a.x - x) + Math.abs(b.x - x)
  const left = detour(box.left) <= detour(box.right)
  const corners = (pad: number) => {
    const x = left ? box.left - pad : box.right + pad
    const clamp = (y: number) => Math.min(Math.max(y, box.top - pad), box.bottom + pad)
    return [a, { x, y: clamp(a.y) }, { x, y: clamp(b.y) }, b]
  }
  for (let pad = 4; pad <= 256; pad *= 2) {
    const path = smooth(corners(pad))
    if (clear(path, box)) return path
  }
  return corners(4)
}

// how far along the path each point is, 0 to 1, so the speed stays even round the bends
export function progress(points: Point[]) {
  const lengths = [0]
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y))
  }
  const total = lengths.at(-1)! || 1
  return lengths.map((length) => length / total)
}
