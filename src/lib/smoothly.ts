import { flushSync } from 'react-dom'

let running = 0

// animates a state change with the browser's view transition, browsers without it just apply the change
export function smoothly(update: () => void) {
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update()
    return
  }

  const root = document.documentElement
  root.classList.add('morphing')
  running++

  const transition = document.startViewTransition(() => flushSync(update))
  // a newer transition skips this one, which rejects ready. the update still applies, so that's fine
  transition.ready.catch(() => {})
  transition.finished.finally(() => {
    if (--running === 0) root.classList.remove('morphing')
  })
}
