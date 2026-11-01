import { useState } from 'react'
import { CHIP_COLORS, type Chip } from '../lib/chips'
import { haptic } from '../lib/haptics'
import { Dialog } from './Dialog'

type ChipEditorProps = {
  chip: Chip
  canDelete: boolean
  onColorChange: (color: string) => void
  onDelete: () => void
  onClose: () => void
}

export function ChipEditor({ chip, canDelete, onColorChange, onDelete, onClose }: ChipEditorProps) {
  const [confirming, setConfirming] = useState(false)

  return (
    <Dialog title={confirming ? 'Delete Chip Type?' : 'Edit Chip'} onClose={onClose}>
      {(close) =>
        confirming ? (
          <>
            <p>Are you sure you want to delete this chip type? This action cannot be undone.</p>
            <div className="button-row">
              <button className="button neutral" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button className="button danger" onClick={() => close(onDelete)}>
                Delete
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="swatches">
              {CHIP_COLORS.map(({ name, hex }) => (
                <button
                  key={hex}
                  className="swatch"
                  style={{ backgroundColor: hex }}
                  aria-label={name}
                  title={name}
                  onClick={() => {
                    onColorChange(hex)
                    haptic('success')
                    close()
                  }}
                />
              ))}
            </div>

            <label className="custom-color">
              Custom color
              <input type="color" value={chip.color} onChange={(e) => onColorChange(e.target.value)} />
            </label>

            {canDelete && (
              <button className="button danger" onClick={() => setConfirming(true)}>
                Delete Chip Type
              </button>
            )}
          </>
        )
      }
    </Dialog>
  )
}
