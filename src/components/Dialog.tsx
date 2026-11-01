import { useLayoutEffect, useRef, useState, type AnimationEvent, type ReactNode } from 'react'

type CloseDialog = (then?: () => void) => void

type DialogProps = {
  title: string
  className?: string
  /** opened straight from the card menu, so its backdrop is already there and shouldn't fade in again */
  continuesBackdrop?: boolean
  onClose: () => void
  children: ReactNode | ((close: CloseDialog) => ReactNode)
}

// always close through close(), native .close() and unmounting both skip the fade out
export function Dialog({ title, className = '', continuesBackdrop, onClose, children }: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [leaving, setLeaving] = useState<{ then?: () => void } | null>(null)

  // layout effect so there's no painted frame without a backdrop when taking over from the menu
  useLayoutEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal()
  }, [])

  const close: CloseDialog = (then) => setLeaving({ then })

  const finish = (e: AnimationEvent) => {
    // by name, because the ::backdrop fade also reports its end on this element
    if (!leaving || e.animationName !== 'dialog-out') return
    leaving.then?.()
    onClose()
  }

  const classes = ['dialog', className, leaving && 'leaving', continuesBackdrop && 'continued']

  return (
    <dialog
      ref={dialog}
      className={classes.filter(Boolean).join(' ')}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
      onAnimationEnd={finish}
      // .dialog has no padding, so a click landing on it directly is on the backdrop
      onClick={(e) => e.target === dialog.current && close()}
    >
      <div className="dialog-content">
        <header className="dialog-header">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Close" onClick={() => close()}>
            ✕
          </button>
        </header>
        {typeof children === 'function' ? children(close) : children}
      </div>
    </dialog>
  )
}
