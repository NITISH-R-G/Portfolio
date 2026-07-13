import { useEffect, useRef, useCallback } from 'react'
import { useReducedMotion } from '../hooks/useReducedMotion'

const STYLE_ID = 'usercursor-native-hide'

const INJECT_CSS = `
@media (hover: hover) and (pointer: fine) {
  body.custom-cursor-active.custom-cursor-visible .portfolio-surface,
  body.custom-cursor-active.custom-cursor-visible .portfolio-surface *,
  body.custom-cursor-active.custom-cursor-visible .portfolio-surface *::before,
  body.custom-cursor-active.custom-cursor-visible .portfolio-surface *::after,
  body.custom-cursor-active.custom-cursor-visible .portfolio-surface :where(*) {
    cursor: none !important;
  }

  body.custom-cursor-active.custom-cursor-visible .portfolio-surface input,
  body.custom-cursor-active.custom-cursor-visible .portfolio-surface textarea,
  body.custom-cursor-active.custom-cursor-visible .portfolio-surface [contenteditable="true"] {
    cursor: text !important;
  }
}
`

export default function UserCursor({ surfaceRef }) {
  const reducedMotion = useReducedMotion()
  const arrowRef = useRef(null)
  const labelRef = useRef(null)
  const styleRef = useRef(null)
  const rafRef = useRef(null)
  const mouseRef = useRef({ x: -100, y: -100 })
  const arrowPosRef = useRef({ x: -100, y: -100 })
  const labelPosRef = useRef({ x: -100, y: -100 })
  const velocityRef = useRef({ x: 0, y: 0 })
  const prevMouseRef = useRef({ x: -100, y: -100 })
  const lastMoveTimeRef = useRef(0)
  const isPressedRef = useRef(false)
  const isInsideSurfaceRef = useRef(false)
  const isActiveRef = useRef(false)
  const currentLabelRef = useRef('Nitish R.G.')
  const labelTiltRef = useRef(0)
  const enabledRef = useRef(false)
  const verifiedRef = useRef(false)

  const checkEnabled = useCallback(() => {
    const pointerFine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    const wideEnough = window.innerWidth >= 1024
    return pointerFine && !reducedMotion && wideEnough
  }, [reducedMotion])

  const injectStyle = () => {
    if (document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = INJECT_CSS
    document.head.appendChild(style)
    styleRef.current = style
  }

  const removeStyle = () => {
    if (styleRef.current) {
      styleRef.current.remove()
      styleRef.current = null
    }
  }

  const addActiveClass = () => {
    if (!document.body.classList.contains('custom-cursor-active')) {
      document.body.classList.add('custom-cursor-active')
    }
  }

  const addVisibleClass = () => {
    if (!document.body.classList.contains('custom-cursor-visible')) {
      document.body.classList.add('custom-cursor-visible')
    }
  }

  const removeAllClasses = () => {
    document.body.classList.remove('custom-cursor-active')
    document.body.classList.remove('custom-cursor-visible')
  }

  const activateBothClasses = () => {
    addActiveClass()
    addVisibleClass()
  }

  const createElements = () => {
    if (arrowRef.current) return

    const arrow = document.createElement('div')
    const label = document.createElement('div')

    arrow.setAttribute('aria-hidden', 'true')
    label.setAttribute('aria-hidden', 'true')

    Object.assign(arrow.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '20px',
      height: '20px',
      pointerEvents: 'none',
      zIndex: '10001',
      opacity: '0',
      willChange: 'transform',
      transition: 'opacity 0.15s ease',
    })
    arrow.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 3L19 12L12 13L9 20L5 3Z" fill="white" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>
    </svg>`

    Object.assign(label.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      pointerEvents: 'none',
      zIndex: '10000',
      opacity: '0',
      willChange: 'transform',
      transition: 'opacity 0.15s ease',
      background: 'rgba(255, 255, 255, 0.12)',
      color: 'white',
      fontSize: '12px',
      fontWeight: '500',
      fontFamily: 'Inter, system-ui, sans-serif',
      padding: '6px 12px',
      borderRadius: '20px',
      whiteSpace: 'nowrap',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      transformOrigin: 'center center',
    })
    label.textContent = 'Nitish R.G.'

    document.body.appendChild(arrow)
    document.body.appendChild(label)

    arrowRef.current = arrow
    labelRef.current = label
  }

  const removeElements = () => {
    if (arrowRef.current) {
      arrowRef.current.remove()
      arrowRef.current = null
    }
    if (labelRef.current) {
      labelRef.current.remove()
      labelRef.current = null
    }
    removeAllClasses()
    isActiveRef.current = false
    isPressedRef.current = false
    verifiedRef.current = false
    currentLabelRef.current = 'Nitish R.G.'
  }

  const spring = (current, target, stiffness = 0.15, damping = 0.7) => {
    const diff = target - current
    return current + diff * stiffness * damping
  }

  const updatePositions = () => {
    if (!enabledRef.current) return

    const mx = mouseRef.current.x
    const my = mouseRef.current.y

    const arrowStiffness = 0.25
    const arrowDamping = 0.7
    const labelStiffness = 0.12
    const labelDamping = 0.65

    arrowPosRef.current.x = spring(arrowPosRef.current.x, mx, arrowStiffness, arrowDamping)
    arrowPosRef.current.y = spring(arrowPosRef.current.y, my, arrowStiffness, arrowDamping)

    const labelTargetX = mx + 20
    const labelTargetY = my + 20
    labelPosRef.current.x = spring(labelPosRef.current.x, labelTargetX, labelStiffness, labelDamping)
    labelPosRef.current.y = spring(labelPosRef.current.y, labelTargetY, labelStiffness, labelDamping)

    const now = performance.now()
    const dt = Math.min(now - lastMoveTimeRef.current, 50)
    lastMoveTimeRef.current = now

    if (dt > 0) {
      velocityRef.current.x = (mx - prevMouseRef.current.x) / dt
      velocityRef.current.y = (my - prevMouseRef.current.y) / dt
    }
    prevMouseRef.current.x = mx
    prevMouseRef.current.y = my

    const tiltAngle = Math.max(-15, Math.min(15, velocityRef.current.x * 3))
    labelTiltRef.current = spring(labelTiltRef.current, tiltAngle, 0.1, 0.8)

    const scale = isPressedRef.current ? 0.9 : 1

    if (arrowRef.current) {
      arrowRef.current.style.transform = `translate3d(${arrowPosRef.current.x}px, ${arrowPosRef.current.y}px, 0) scale(${scale})`
    }
    if (labelRef.current) {
      labelRef.current.style.transform = `translate3d(${labelPosRef.current.x}px, ${labelPosRef.current.y}px, 0) rotate(${labelTiltRef.current}deg) scale(${scale})`
    }

    rafRef.current = requestAnimationFrame(updatePositions)
  }

  const activateCursor = () => {
    if (isActiveRef.current) return
    isActiveRef.current = true

    if (arrowRef.current) arrowRef.current.style.opacity = '1'
    if (labelRef.current) labelRef.current.style.opacity = '1'

    activateBothClasses()

    if (!verifiedRef.current) {
      verifiedRef.current = true
      requestAnimationFrame(() => {
        if (!isActiveRef.current) return
        const hovered = document.elementFromPoint(mouseRef.current.x, mouseRef.current.y)
        if (hovered) {
          const computed = getComputedStyle(hovered).cursor
          if (computed !== 'none' && styleRef.current) {
            styleRef.current.textContent = INJECT_CSS + `
body.custom-cursor-active.custom-cursor-visible .portfolio-surface :where(*) {
  cursor: none !important;
}
`
          }
        }
      })
    }
  }

  const deactivateCursor = () => {
    if (!isActiveRef.current && !isInsideSurfaceRef.current) return
    isActiveRef.current = false
    verifiedRef.current = false
    if (arrowRef.current) arrowRef.current.style.opacity = '0'
    if (labelRef.current) labelRef.current.style.opacity = '0'
    removeAllClasses()
  }

  const getLabelForTarget = (target) => {
    if (!target) return 'Nitish R.G.'
    if (target.closest('.project-card') || target.closest('[data-cursor="project"]')) return 'View project'
    if (target.closest('.social-icon') || target.closest('[data-cursor="external"]')) return 'Open link'
    if (target.closest('.nav-icon') || target.closest('[data-cursor="nav"]')) return 'Navigate'
    return 'Nitish R.G.'
  }

  const handlePointerMove = (e) => {
    if (!enabledRef.current) return
    if (!Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return

    mouseRef.current.x = e.clientX
    mouseRef.current.y = e.clientY

    if (!isInsideSurfaceRef.current) return

    activateCursor()

    const newLabel = getLabelForTarget(e.target)
    if (newLabel !== currentLabelRef.current && labelRef.current) {
      currentLabelRef.current = newLabel
      labelRef.current.textContent = newLabel
    }
  }

  const handlePointerDown = () => {
    if (!isInsideSurfaceRef.current || !isActiveRef.current) return
    isPressedRef.current = true
  }

  const handlePointerUp = () => {
    isPressedRef.current = false
  }

  const handlePointerEnter = () => {
    isInsideSurfaceRef.current = true
    addActiveClass()
  }

  const handlePointerLeave = () => {
    isInsideSurfaceRef.current = false
    deactivateCursor()
    isPressedRef.current = false
  }

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      deactivateCursor()
    }
  }

  const handleResize = () => {
    const shouldEnable = checkEnabled()
    if (shouldEnable && !enabledRef.current) {
      enabledRef.current = true
      injectStyle()
      createElements()
      arrowPosRef.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      labelPosRef.current = { x: window.innerWidth / 2 + 20, y: window.innerHeight / 2 + 20 }
      mouseRef.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      prevMouseRef.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      rafRef.current = requestAnimationFrame(updatePositions)
    } else if (!shouldEnable && enabledRef.current) {
      enabledRef.current = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      removeElements()
      removeStyle()
    }
  }

  useEffect(() => {
    const shouldEnable = checkEnabled()
    enabledRef.current = shouldEnable

    if (shouldEnable) {
      injectStyle()
      createElements()
      arrowPosRef.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      labelPosRef.current = { x: window.innerWidth / 2 + 20, y: window.innerHeight / 2 + 20 }
      mouseRef.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      prevMouseRef.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      rafRef.current = requestAnimationFrame(updatePositions)

      const surface = surfaceRef?.current
      if (surface) {
        surface.addEventListener('pointerenter', handlePointerEnter)
        surface.addEventListener('pointerleave', handlePointerLeave)
      }
      window.addEventListener('pointermove', handlePointerMove, { passive: true })
      window.addEventListener('pointerdown', handlePointerDown, { passive: true })
      window.addEventListener('pointerup', handlePointerUp, { passive: true })
      window.addEventListener('resize', handleResize)
      document.addEventListener('visibilitychange', handleVisibilityChange)
      window.addEventListener('blur', deactivateCursor)
    }

    return () => {
      enabledRef.current = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      const surface = surfaceRef?.current
      if (surface) {
        surface.removeEventListener('pointerenter', handlePointerEnter)
        surface.removeEventListener('pointerleave', handlePointerLeave)
      }
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', deactivateCursor)
      removeElements()
      removeStyle()
    }
  }, [reducedMotion, checkEnabled])

  return null
}