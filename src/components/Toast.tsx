export type ToastMessage = { id: number; text: string; type: 'success' | 'error' }

type ToastProps = { toast: ToastMessage; onDone: () => void }

export function Toast({ toast, onDone }: ToastProps) {
  return (
    <div className={`toast ${toast.type}`} role="status" onAnimationEnd={onDone}>
      {toast.type === 'success' ? '✓' : '✗'} {toast.text}
    </div>
  )
}
