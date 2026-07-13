import { useEffect, useRef } from 'react'
import Lenis from 'lenis'
import { useReducedMotion } from './useReducedMotion'

export function useLenis() {
  const lenisRef = useRef(null)
  const reducedMotion = useReducedMotion()
  
  useEffect(() => {
    if (reducedMotion) return
    
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
  }, [reducedMotion])
  
  return lenisRef
}