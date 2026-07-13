import { useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useReducedMotion } from '../hooks/useReducedMotion'

export default function CursorFollower({ surfaceRef }) {
  const reducedMotion = useReducedMotion()
  const dotRef = useRef(null)
  const ringRef = useRef(null)
  const rafRef = useRef(null)
  const mouseRef = useRef({ x: 0, y: 0 })
  const dotPosRef = useRef({ x: 0, y: 0 })
  const ringPosRef = useRef({ x: 0, y: 0 })
  const isVisibleRef = useRef(false)
  const isOverInteractiveRef = useRef(false)
  const isOverProjectCardRef = useRef(false)
  const projectCardLabelRef = useRef(null)
  const isEnabledRef = useRef(false)
  const isInsideSurfaceRef = useRef(false)
  const hasValidMoveRef = useRef(false)

  const checkEnabled = useCallback(() => {
    const pointerFine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    const wideEnough = window.innerWidth >= 1024
    return pointerFine && !reducedMotion && wideEnough
  }, [reducedMotion])

  const addActiveClass = () => {
    if (!document.body.classList.contains('custom-cursor-active')) {
      document.body.classList.add('custom-cursor-active')
    }
  }

  const removeActiveClass = () => {
    document.body.classList.remove('custom-cursor-active')
  }

  const createElements = () => {
    if (dotRef.current || ringRef.current) return

    const dot = document.createElement('div')
    const ring = document.createElement('div')
    const label = document.createElement('div')

    dot.setAttribute('aria-hidden', 'true')
    ring.setAttribute('aria-hidden', 'true')
    label.setAttribute('aria-hidden', 'true')

    Object.assign(dot.style, {
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      background: 'var(--accent)',
      pointerEvents: 'none',
      position: 'fixed',
      zIndex: 9999,
      transform: 'translate3d(-50%, -50%, 0)',
      willChange: 'transform, opacity',
      opacity: 0,
      transition: 'opacity 0.15s ease',
    })

    Object.assign(ring.style, {
      width: '28px',
      height: '28px',
      borderRadius: '50%',
      border: '2px solid var(--accent)',
      pointerEvents: 'none',
      position: 'fixed',
      zIndex: 9998,
      transform: 'translate3d(-50%, -50%, 0)',
      willChange: 'transform',
      opacity: 0,
      transition: 'border-color 0.15s ease, transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
      boxSizing: 'border-box',
    })

    Object.assign(label.style, {
      position: 'fixed',
      zIndex: 10000,
      pointerEvents: 'none',
      fontSize: '12px',
      fontWeight: 500,
      color: 'var(--foreground)',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '6px',
      padding: '4px 10px',
      whiteSpace: 'nowrap',
      opacity: 0,
      transform: 'translate3d(-50%, -100%, 0) translateY(-8px)',
      transition: 'opacity 0.15s ease, transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
      display: 'none',
    })
    label.textContent = 'View project'

    document.body.appendChild(dot)
    document.body.appendChild(ring)
    document.body.appendChild(label)

    dotRef.current = dot
    ringRef.current = ring
    projectCardLabelRef.current = label
  }

  const removeElements = () => {
    if (dotRef.current) {
      dotRef.current.remove()
      dotRef.current = null
    }
    if (ringRef.current) {
      ringRef.current.remove()
      ringRef.current = null
    }
    if (projectCardLabelRef.current) {
      projectCardLabelRef.current.remove()
      projectCardLabelRef.current = null
    }
    removeActiveClass()
    hasValidMoveRef.current = false
    isVisibleRef.current = false
  }

  const updatePositions = () => {
    if (!isEnabledRef.current) return

    const mx = mouseRef.current.x
    const my = mouseRef.current.y

    dotPosRef.current.x += (mx - dotPosRef.current.x) * 0.35
    dotPosRef.current.y += (my - dotPosRef.current.y) * 0.35

    ringPosRef.current.x += (mx - ringPosRef.current.x) * 0.08
    ringPosRef.current.y += (my - ringPosRef.current.y) * 0.08

    if (dotRef.current) {
      dotRef.current.style.transform = `translate3d(${dotPosRef.current.x}px, ${dotPosRef.current.y}px, 0)`
    }
    if (ringRef.current) {
      ringRef.current.style.transform = `translate3d(${ringPosRef.current.x}px, ${ringPosRef.current.y}px, 0)`
    }

    if (projectCardLabelRef.current && isOverProjectCardRef.current) {
      const label = projectCardLabelRef.current
      const labelWidth = label.offsetWidth
      const viewportWidth = window.innerWidth

      let labelX = mx
      let labelY = my - 40

      if (labelX - labelWidth / 2 < 8) labelX = labelWidth / 2 + 8
      if (labelX + labelWidth / 2 > viewportWidth - 8) labelX = viewportWidth - labelWidth / 2 - 8
      if (labelY < 8) labelY = my + 28

      label.style.transform = `translate3d(${labelX}px, ${labelY}px, 0) translateX(-50%)`
    }

    rafRef.current = requestAnimationFrame(updatePositions)
  }

  const showCursor = () => {
    if (!hasValidMoveRef.current) {
      hasValidMoveRef.current = true
      if (dotRef.current) dotRef.current.style.opacity = '1'
      if (ringRef.current) ringRef.current.style.opacity = '1'
      addActiveClass()
    }
  }

  const hideCursor = () => {
    if (hasValidMoveRef.current) {
      hasValidMoveRef.current = false
      if (dotRef.current) dotRef.current.style.opacity = '0'
      if (ringRef.current) ringRef.current.style.opacity = '0'
      removeActiveClass()
    }
  }

  const handlePointerMove = (e) => {
    if (!Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return

    mouseRef.current.x = e.clientX
    mouseRef.current.y = e.clientY

    if (!isInsideSurfaceRef.current) return

    showCursor()

    const target = e.target
    const isInteractive = target.matches('a, button, [data-cursor="interactive"], [data-cursor="interactive"] *')
    const projectCard = target.closest('[data-cursor="interactive"]')

    if (isInteractive !== isOverInteractiveRef.current) {
      isOverInteractiveRef.current = isInteractive
      if (ringRef.current) {
        if (isInteractive) {
          ringRef.current.style.transform = `translate3d(${ringPosRef.current.x}px, ${ringPosRef.current.y}px, 0) scale(1.45)`
        } else {
          ringRef.current.style.transform = `translate3d(${ringPosRef.current.x}px, ${ringPosRef.current.y}px, 0) scale(1)`
        }
      }
      if (dotRef.current) {
        dotRef.current.style.opacity = isInteractive ? '0.6' : '1'
      }
    }

    if (projectCard) {
      if (!isOverProjectCardRef.current) {
        isOverProjectCardRef.current = true
        if (projectCardLabelRef.current) {
          projectCardLabelRef.current.style.display = 'block'
          requestAnimationFrame(() => {
            projectCardLabelRef.current.style.opacity = '1'
            projectCardLabelRef.current.style.transform = 'translate3d(-50%, -100%, 0) translateY(0)'
          })
        }
      }
    } else if (isOverProjectCardRef.current) {
      isOverProjectCardRef.current = false
      if (projectCardLabelRef.current) {
        projectCardLabelRef.current.style.opacity = '0'
        projectCardLabelRef.current.style.transform = 'translate3d(-50%, -100%, 0) translateY(-8px)'
        setTimeout(() => {
          if (projectCardLabelRef.current && !isOverProjectCardRef.current) {
            projectCardLabelRef.current.style.display = 'none'
          }
        }, 150)
      }
    }
  }

  const handlePointerEnter = () => {
    isInsideSurfaceRef.current = true
  }

  const handlePointerLeave = () => {
    isInsideSurfaceRef.current = false
    hideCursor()
  }

  const handleResize = () => {
    const shouldEnable = checkEnabled()
    if (shouldEnable !== isEnabledRef.current) {
      if (shouldEnable) {
        isEnabledRef.current = true
        createElements()
        dotPosRef.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
        ringPosRef.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
        mouseRef.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
        rafRef.current = requestAnimationFrame(updatePositions)
      } else {
        isEnabledRef.current = false
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        removeElements()
      }
    }
  }

  useEffect(() => {
    const shouldEnable = checkEnabled()
    isEnabledRef.current = shouldEnable

    if (shouldEnable) {
      createElements()
      dotPosRef.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      ringPosRef.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      mouseRef.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      rafRef.current = requestAnimationFrame(updatePositions)

      const surface = surfaceRef?.current
      if (surface) {
        surface.addEventListener('pointerenter', handlePointerEnter)
        surface.addEventListener('pointerleave', handlePointerLeave)
      }
      window.addEventListener('pointermove', handlePointerMove, { passive: true })
      window.addEventListener('resize', handleResize)
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      const surface = surfaceRef?.current
      if (surface) {
        surface.removeEventListener('pointerenter', handlePointerEnter)
        surface.removeEventListener('pointerleave', handlePointerLeave)
      }
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('resize', handleResize)
      removeElements()
    }
  }, [reducedMotion, checkEnabled])

  return null
}