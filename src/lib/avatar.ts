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

export const isArt = (art: unknown): art is string => typeof art === 'string' && ART.test(art)

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
