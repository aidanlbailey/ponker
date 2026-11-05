import type { CSSProperties, ReactNode } from 'react'
import { accentColor } from '../lib/chips'
import './chips.css'

// how a stack looks, the same at the table and on the tracker. chips.css draws from these as variables
export const TILT = 0.58 // a chip's face, height over width. The sides are drawn at the same angle
const STRIPE_STAGGER = 9 // degrees each chip's edge stripes are turned from the one under it
const SHADOW_WIDTH = 1.2 // the contact shadow under a stack, in chip widths
const SHADOW_ALPHA = 0.28
const OUTLINE = 0.03 // every chip face and side's black outline, in chip widths

// rise is a chip's thickness in px
export const chipLook = (tilt: number, rise: number) =>
  ({
    '--tilt': tilt,
    '--outline': OUTLINE,
    '--stagger': STRIPE_STAGGER,
    '--shadow-width': SHADOW_WIDTH,
    '--shadow-alpha': SHADOW_ALPHA,
    '--rise': `${rise}px`,
  }) as CSSProperties

// chunky spots and one ring, each outlined in black like the rest of the game. The middle stays chip
// colored so contrastColor still holds for the tracker's count. The hub's mode chips draw these too
export function ChipMarks({ accent, className }: { accent: string; className?: string }) {
  return (
    // none, so a table chip drawn as an ellipse squashes its marks with it
    <svg className={className} viewBox="-66 -66 132 132" preserveAspectRatio="none" fill={accent} stroke="#000" strokeWidth="4" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <path key={i} d="M-15-68H15L9.5-43H-9.5Z" transform={`rotate(${i * 60})`} />
      ))}
      <circle r="33" fill="none" strokeWidth="12" />
      <circle r="33" fill="none" stroke={accent} strokeWidth="5" />
    </svg>
  )
}

export function Chip({ color, children }: { color: string; children?: ReactNode }) {
  return (
    <span className="chip" style={{ backgroundColor: color }}>
      <ChipMarks accent={accentColor(color)} />
      {children}
    </span>
  )
}

export const sideStyle = (color: string) => ({ '--side': color, '--stripe': accentColor(color) }) as CSSProperties

// a chip's side band and its face on top, at rest in a pile or flipping through the air. Anything on the face
// (the tracker's count in a toss) goes in as children so the face clips it as it closes
export function ChipParts({ color, children }: { color: string; children?: ReactNode }) {
  return (
    <>
      <span className="chip-band" />
      <span className="chip-side" />
      <Chip color={color}>{children}</Chip>
    </>
  )
}

// Only the top face shows, the rest are covered by the side of the chip above, so the stack's edge is really the
// chips' sides. Bottom chip first
export function ChipStack({ colors }: { colors: string[] }) {
  return (
    <span className="pile" style={{ '--chips': colors.length } as CSSProperties} aria-hidden="true">
      {colors.map((color, i) => (
        <span key={i} style={{ '--n': i, ...sideStyle(color) } as CSSProperties}>
          <ChipParts color={color} />
        </span>
      ))}
    </span>
  )
}
