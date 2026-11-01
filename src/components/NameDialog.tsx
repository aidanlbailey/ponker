import { useEffect, useRef, useState } from 'react'
import { Dialog } from './Dialog'

type NameDialogProps = {
  name: string
  onChange: (name: string) => void
  onClose: () => void
  onRenamed: () => void
}

export function NameDialog({ name, onChange, onClose, onRenamed }: NameDialogProps) {
  const [original] = useState(name)
  const input = useRef<HTMLInputElement>(null)

  // not autoFocus: showModal runs after that and would move focus to the close button
  useEffect(() => input.current?.focus(), [])

  const finish = () => {
    if (name.trim() && name !== original) onRenamed()
    onClose()
  }

  return (
    <Dialog title="Set Your Name" continuesBackdrop onClose={finish}>
      {(close) => (
        <>
          <p>Your name will be included when you share your cashout.</p>
          <form
            className="name-form"
            onSubmit={(e) => {
              e.preventDefault()
              close()
            }}
          >
            <input
              ref={input}
              type="text"
              className="name-input"
              aria-label="Your name"
              placeholder="Enter your name..."
              maxLength={30}
              value={name}
              onChange={(e) => onChange(e.target.value)}
            />
            <div className="button-row">
              <button type="button" className="button neutral" onClick={() => onChange('')}>
                Clear
              </button>
              <button className="button primary">Done</button>
            </div>
          </form>
        </>
      )}
    </Dialog>
  )
}
