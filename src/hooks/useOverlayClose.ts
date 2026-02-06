// src/hooks/useOverlayClose.ts
// React hook replacement for the Vue `v-overlay-close` custom directive.
//
// Detects a "click on the overlay itself" pattern: the user presses down on
// the overlay element and releases on the same overlay element (not on any
// child). When both events target the overlay element, the provided callback
// is invoked.

import { useEffect, type RefObject } from 'react'

/**
 * Hook that listens for pointer-down + pointer-up on the given element (but
 * *not* on its children) and calls `onClose` when both events fire on the
 * element itself.
 *
 * This replicates the Vue `v-overlay-close` directive behaviour, ensuring
 * that a click that starts inside modal content and drags out onto the
 * overlay backdrop does **not** trigger a close.
 *
 * @param overlayRef  React ref to the overlay / backdrop DOM element.
 * @param onClose     Callback invoked when the overlay is "clicked".
 * @param enabled     Optional flag to enable/disable the listener (default `true`).
 *
 * @example
 * ```tsx
 * function Modal({ open, onClose, children }: Props) {
 *   const overlayRef = useRef<HTMLDivElement>(null)
 *   useOverlayClose(overlayRef, onClose, open)
 *
 *   if (!open) return null
 *
 *   return (
 *     <div ref={overlayRef} className="overlay-backdrop">
 *       <div className="modal-content">{children}</div>
 *     </div>
 *   )
 * }
 * ```
 */
export function useOverlayClose(
  overlayRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  enabled: boolean = true,
): void {
  useEffect(() => {
    if (!enabled) return

    const el = overlayRef.current
    if (!el) return

    // Track whether pointerdown landed on the overlay element itself
    let pointerDownOnOverlay = false

    const handlePointerDown = (e: PointerEvent) => {
      // e.target === el means the press was directly on the overlay, not a child
      pointerDownOnOverlay = e.target === el
    }

    const handlePointerUp = (e: PointerEvent) => {
      // Only close if both down and up happened on the overlay element itself
      if (pointerDownOnOverlay && e.target === el) {
        onClose()
      }
      // Reset regardless
      pointerDownOnOverlay = false
    }

    el.addEventListener('pointerdown', handlePointerDown)
    el.addEventListener('pointerup', handlePointerUp)

    return () => {
      el.removeEventListener('pointerdown', handlePointerDown)
      el.removeEventListener('pointerup', handlePointerUp)
    }
  }, [overlayRef, onClose, enabled])
}

export default useOverlayClose
