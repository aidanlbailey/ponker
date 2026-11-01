import { PRESETS, formatMoney, type Chips } from '../lib/chips'
import { Dialog } from './Dialog'

type PresetsProps = { onLoad: (chips: Chips) => void; onClose: () => void }

export function Presets({ onLoad, onClose }: PresetsProps) {
  return (
    <Dialog title="Chip Presets" className="presets" continuesBackdrop onClose={onClose}>
      {(close) =>
        PRESETS.map(({ id, name, author, description, chips }) => (
          <article key={id} className="preset">
            <h3>{name}</h3>
            <p className="preset-author">by {author}</p>
            <p>{description}</p>
            <ul className="preset-chips">
              {Object.entries(chips).map(([chipId, { color, value }]) => (
                <li key={chipId}>
                  <span style={{ backgroundColor: color }} />
                  {formatMoney(value)}
                </li>
              ))}
            </ul>
            <button
              className="button add"
              onClick={() => close(() => onLoad(chips))}
            >
              Load Preset
            </button>
          </article>
        ))
      }
    </Dialog>
  )
}
