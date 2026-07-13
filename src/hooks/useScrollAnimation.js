import { useEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useReducedMotion } from './useReducedMotion'

gsap.registerPlugin(ScrollTrigger)

export function useScrollAnimation() {
  const reducedMotion = useReducedMotion()
  
  useEffect(() => {
    if (reducedMotion) return
    
    return () => ScrollTrigger.getAll().forEach(t => t.kill())
  }, [reducedMotion])
}