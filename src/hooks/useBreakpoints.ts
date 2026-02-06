// src/hooks/useBreakpoints.ts
// Responsive breakpoint detection hook (replacement for Vue responsive mixins)

import { useState, useEffect } from 'react'

interface Breakpoints {
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  width: number
}

const MOBILE_MAX = 768
const TABLET_MAX = 992

function getBreakpoints(width: number): Breakpoints {
  return {
    isMobile: width <= MOBILE_MAX,
    isTablet: width > MOBILE_MAX && width <= TABLET_MAX,
    isDesktop: width > TABLET_MAX,
    width,
  }
}

/**
 * Hook that returns the current responsive breakpoint based on window width.
 *
 * - isMobile:  width <= 768
 * - isTablet:  768 < width <= 992
 * - isDesktop: width > 992
 *
 * Automatically listens for window resize events and cleans up on unmount.
 */
export function useBreakpoints(): Breakpoints {
  const [breakpoints, setBreakpoints] = useState<Breakpoints>(() =>
    getBreakpoints(typeof window !== 'undefined' ? window.innerWidth : 1024),
  )

  useEffect(() => {
    const handleResize = () => {
      const newWidth = window.innerWidth
      setBreakpoints((prev) => {
        // Only update state if the actual breakpoint category changed or width changed meaningfully
        if (
          prev.width === newWidth
        ) {
          return prev
        }
        return getBreakpoints(newWidth)
      })
    }

    window.addEventListener('resize', handleResize)

    // Ensure the initial value is correct (in case SSR width differed)
    handleResize()

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return breakpoints
}

export default useBreakpoints
