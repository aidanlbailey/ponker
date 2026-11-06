import { useLayoutEffect, useRef } from 'react'
import { decode, PALETTE, SIZE } from '../lib/avatar'

export function paint(canvas: HTMLCanvasElement, pixels: number[]) {
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, SIZE, SIZE)
  pixels.forEach((p, i) => {
    if (!p) return
    ctx.fillStyle = PALETTE[p]!
    ctx.fillRect(i % SIZE, Math.floor(i / SIZE), 1, 1)
  })
}

// drawn at 24x24 and scaled up by CSS, image-rendering keeps the pixels square
export function PixelArt({ art, className }: { art: string; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useLayoutEffect(() => paint(canvas.current!, decode(art)), [art])
  return <canvas ref={canvas} className={className} width={SIZE} height={SIZE} aria-hidden="true" />
}
