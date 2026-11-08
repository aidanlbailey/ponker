// Pixel art avatars. 24x24 pixels, 4 bits each (an index into PALETTE), so 288 bytes, 384 characters
// of base64url. Shared with the worker, which only ever checks the shape, so keep it free of React and the DOM.

export const SIZE = 24
export const ART_LENGTH = 384
const ART = /^[A-Za-z0-9_-]{384}$/

// 0 is see-through, the seat's disc shows behind it. The rest lean on the table's own colours
export const PALETTE = [
  'transparent',
  '#000000',
  '#ffffff',
  '#525252',
  '#a3a3a3',
  '#9c1020', // card back red
  '#e8453c',
  '#f08c2c',
  '#f5d742',
  '#2f8a3e',
  '#1e5c3a', // felt
  '#2f6fd6',
  '#7b4bd1',
  '#e86aa8',
  '#f1c9a5',
  '#8a5a3c',
]

// OKLab, so distance is roughly how different two colours look. Redmean weighed green 4x and sent dark hair to the felt
const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
function oklab(r: number, g: number, b: number): [number, number, number] {
  ;[r, g, b] = [lin(r), lin(g), lin(b)]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}
const LAB = PALETTE.map((hex) =>
  hex.startsWith('#') ? oklab(...([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number])) : null,
)

// mostly see-through pixels erase
// ponytail: nearest colour only, no dithering. At 24x24 dither reads as noise, revisit if photos look too flat
export function quantize(rgba: ArrayLike<number>): number[] {
  return Array.from({ length: SIZE * SIZE }, (_, i) => {
    if (rgba[i * 4 + 3]! < 128) return 0
    const [L, A, B] = oklab(rgba[i * 4]!, rgba[i * 4 + 1]!, rgba[i * 4 + 2]!)
    let best = 1
    let bestD = Infinity
    LAB.forEach((c, p) => {
      if (!c) return
      const d = (L - c[0]!) ** 2 + (A - c[1]!) ** 2 + (B - c[2]!) ** 2
      if (d < bestD) [best, bestD] = [p, d]
    })
    return best
  })
}

export const isArt =(art: unknown): art is string => typeof art === 'string' && ART.test(art)

export const blank = () => Array<number>(SIZE * SIZE).fill(0)

// null for a blank canvas, nobody needs 384 characters of nothing sent round the table
export function encode(pixels: number[]): string | null {
  if (pixels.every((p) => !p)) return null
  const bytes = new Uint8Array(SIZE * SIZE / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = ((pixels[i * 2]! & 15) << 4) | (pixels[i * 2 + 1]! & 15)
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_')
}

export function decode(art: string): number[] {
  const raw = atob(art.replace(/-/g, '+').replace(/_/g, '/'))
  return Array.from(raw, (c) => [c.charCodeAt(0) >> 4, c.charCodeAt(0) & 15]).flat()
}
