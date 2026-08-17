import { useEffect, useRef } from 'react'
import Lenis from 'lenis'
import { useReducedMotion } from './useReducedMotion'

/**
 * @param {{enabled?: boolean}} [options]  `enabled: false` (from `animations.smoothScroll`)
 *   opts out of scroll hijacking entirely, independent of reduced-motion.
 */
export function useLenis({ enabled = true } = {}) {
  const lenisRef = useRef(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (reducedMotion || !enabled) return
    
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      touchMultiplier: 2,
    })
    
    lenisRef.current = lenis
    
    function raf(time) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }
    requestAnimationFrame(raf)
    
    return () => {
      lenis.destroy()
    }
  }, [reducedMotion, enabled])

  return lenisRef
}