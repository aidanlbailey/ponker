import { accentColor } from '../lib/chips'

const pips = (...positions: [x: number, y: number][]) => positions.map(([x, y]) => [(x - 0.5) * 10, (y - 0.5) * 10])

const CENTER: [number, number] = [0.5, 0.5]
const NW: [number, number] = [0.25, 0.25]
const NE: [number, number] = [0.75, 0.25]
const SW: [number, number] = [0.25, 0.75]
const SE: [number, number] = [0.75, 0.75]

const DICE_FACES = [
  pips(CENTER),
  pips(NW, SE),
  pips(NW, CENTER, SE),
  pips(NW, NE, SW, SE),
  pips(NW, NE, CENTER, SW, SE),
  pips([0.25, 0.2], [0.25, 0.5], [0.25, 0.8], [0.75, 0.2], [0.75, 0.5], [0.75, 0.8]),
]

// markings only, the chip color is the span's background so its inset shadow still shows through
export function Chip({ color }: { color: string }) {
  const accent = accentColor(color)

  return (
    <span className="chip" style={{ backgroundColor: color }}>
      <svg viewBox="-66 -66 132 132" fill={accent} aria-hidden="true">
        {DICE_FACES.map((face, i) => (
          <g key={i}>
            <path d="M-11-67H11L6.6-45H-6.6Z" transform={`rotate(${i * 60})`} />
            <g transform={`rotate(${i * 60 + 30}) translate(0 -55)`}>
              <rect x="-6" y="-6" width="12" height="12" rx="2" fill="none" stroke={accent} strokeWidth="2" />
              {face.map(([x, y], j) => (
                <circle key={j} cx={x} cy={y} r="1.25" />
              ))}
            </g>
          </g>
        ))}
        {Array.from({ length: 12 }, (_, i) => (
          <rect key={i} x="-5" y="-41" width="10" height="4" rx="2" transform={`rotate(${i * 30})`} />
        ))}
      </svg>
    </span>
  )
}
