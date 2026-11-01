import { useEffect, useRef, type ReactNode } from 'react'

type DialogProps = { title: string; className?: string; onClose: () => void; children: ReactNode }

export function Dialog({ title, className = '', onClose, children }: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal()
  }, [])

  return (
    <dialog
      ref={dialog}
      className={`dialog ${className}`}
      aria-label={title}
      onClose={onClose}
      // .dialog has no padding, so a click landing on it directly is on the backdrop
      onClick={(e) => e.target === dialog.current && dialog.current.close()}
    >
      <div className="dialog-content">
        <header className="dialog-header">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Close" onClick={() => dialog.current?.close()}>
            ✕
          </button>
        </header>
        {children}
      </div>
    </dialog>
  )
}
