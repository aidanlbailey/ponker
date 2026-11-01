import { useRef, type MouseEvent, type PointerEvent } from 'react'
import { haptic } from '../lib/haptics'

const SWIPE_DISTANCE = 50
const LONG_PRESS_MS = 500
const LONG_PRESS_WIGGLE = 10

type Gestures = { onSwipeDown: () => void; onSwipeUp: () => void; onEdit: () => void }

// relies on touch-action: none on the element, otherwise the browser cancels the pointer to scroll
export function useChipGestures({ onSwipeDown, onSwipeUp, onEdit }: Gestures) {
  const startY = useRef<number | null>(null)
  const timer = useRef<number>(undefined)

  const reset = () => {
    clearTimeout(timer.current)
    startY.current = null
  }

  return {
    onPointerDown(e: PointerEvent) {
      if (e.pointerType === 'mouse') return
      startY.current = e.clientY
      timer.current = window.setTimeout(() => {
        reset()
        haptic('success')
        onEdit()
      }, LONG_PRESS_MS)
    },

    onPointerMove(e: PointerEvent) {
      if (startY.current !== null && Math.abs(e.clientY - startY.current) > LONG_PRESS_WIGGLE) {
        clearTimeout(timer.current)
      }
    },

    onPointerUp(e: PointerEvent) {
      if (startY.current === null) return
      const distance = e.clientY - startY.current
      reset()
      if (Math.abs(distance) < SWIPE_DISTANCE) return
      haptic('light')
      if (distance > 0) onSwipeDown()
      else onSwipeUp()
    },

    onPointerCancel: reset,

    // tapping does nothing on touch, it's too easy to hit while swiping
    onClick(e: MouseEvent) {
      const { pointerType } = e.nativeEvent as globalThis.PointerEvent
      if (pointerType && pointerType !== 'mouse') return
      haptic('light')
      onEdit()
    },

    onContextMenu(e: MouseEvent) {
      if (startY.current !== null) e.preventDefault()
    },
  }
}
