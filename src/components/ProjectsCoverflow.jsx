import { useState, useCallback, useEffect, useRef, forwardRef } from 'react'
import React from 'react'
import { useMotionValue, animate } from 'motion/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useReducedMotion } from '../hooks/useReducedMotion'
import Icon from './Icon'

const Z_BASE = 10
const WIDTH_PERCENT = 72
const DEPTH_STEP = 8

function computeTransform(index, current, reducedMotion) {
  if (reducedMotion) {
    const isActive = Math.abs(current - index) < 0.5
    return {
      tx: '0%',
      sc: 1,
      op: isActive ? 1 : 0,
      z: isActive ? Z_BASE : 0,
      iop: isActive ? 1 : 0,
    }
  }
  const d = current - index
  const absD = Math.abs(d)
  const tx = absD < 0.01
    ? '0%'
    : `${(d < 0 ? 1 : -1) * (WIDTH_PERCENT + (Math.max(0, Math.round(absD) - 1)) * DEPTH_STEP)}%`
  return {
    tx,
    sc: absD < 0.5 ? 1 : absD < 1.5 ? 0.72 : 0.58,
    op: absD < 0.5 ? 1 : absD < 1.5 ? 0.55 : absD < 2.5 ? 0.25 : 0,
    z: Z_BASE - Math.round(absD),
    iop: absD < 0.5 ? 1 : 0,
  }
}

function applyStyles(el, t) {
  el.style.transform = `translateX(${t.tx}) scale(${t.sc})`
  el.style.opacity = t.op
  el.style.zIndex = t.z
  const info = el.querySelector('.coverflow-info')
  if (info) info.style.opacity = t.iop
}

const CoverflowCard = forwardRef(function CoverflowCard({ project, index, onSelect }, ref) {
  const innerRef = useRef(null)
  const mergedRef = useCallback((el) => {
    innerRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }, [ref])

  useEffect(() => {
    const el = innerRef.current
    if (!el) return
    el.style.position = 'absolute'
    el.style.left = '50%'
    el.style.top = '0'
    el.style.width = 'clamp(300px, 55%, 460px)'
    el.style.marginLeft = 'clamp(-150px, -27.5%, -230px)'
  }, [])

  return (
    <div
      ref={mergedRef}
      className="coverflow-card"
      data-cursor="interactive"
      onClick={() => onSelect(index)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(index)
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Project: ${project.title}`}
    >
      <div className="coverflow-card-inner">
        <div className="coverflow-image-area">
          <div
            className="coverflow-image-bg"
            style={{
              background: `linear-gradient(135deg, ${project.color}18 0%, ${project.color}06 100%)`,
            }}
          />
          <div className="coverflow-card-icon"><Icon name={project.icon} size={20} /></div>
        </div>
        <div className="coverflow-info" style={{ pointerEvents: 'none' }}>
          <h3 className="coverflow-title">{project.title}</h3>
          <p className="coverflow-desc">{project.description}</p>
          <div className="coverflow-tags">
            {project.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <a href={project.link} className="coverflow-link" onClick={(e) => e.stopPropagation()}>
            View details →
          </a>
        </div>
      </div>
    </div>
  )
})

const MemoizedCard = React.memo(CoverflowCard, (prev, next) =>
  prev.project.id === next.project.id && prev.index === next.index
)

export default function ProjectsCoverflow({ projects }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const reducedMotion = useReducedMotion()
  const motionIndex = useMotionValue(0)
  const total = projects.length
  const cardEls = useRef([])

  const setCardRef = useCallback((index) => (el) => {
    cardEls.current[index] = el
  }, [])

  useEffect(() => {
    if (reducedMotion) {
      motionIndex.set(activeIndex)
      cardEls.current.forEach((el, i) => {
        if (el) applyStyles(el, computeTransform(i, activeIndex, true))
      })
      return
    }

    const unsub = motionIndex.on('change', (current) => {
      cardEls.current.forEach((el, i) => {
        if (el) applyStyles(el, computeTransform(i, current, false))
      })
    })

    animate(motionIndex, activeIndex, {
      type: 'tween',
      duration: 0.35,
      ease: [0.25, 0.1, 0.25, 1],
    })

    return unsub
  }, [activeIndex, reducedMotion, motionIndex])

  const goTo = useCallback(
    (idx) => {
      setActiveIndex(Math.max(0, Math.min(total - 1, idx)))
    },
    [total]
  )

  const goPrev = useCallback(() => goTo(activeIndex - 1), [activeIndex, goTo])
  const goNext = useCallback(() => goTo(activeIndex + 1), [activeIndex, goTo])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goNext() }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goPrev, goNext])

  const canGoPrev = activeIndex > 0
  const canGoNext = activeIndex < total - 1

  return (
    <div className="coverflow-container" role="region" aria-label="Projects carousel" aria-roledescription="carousel">
      <div className="coverflow-viewport">
        <div className="coverflow-track">
          {projects.map((project, i) => (
            <MemoizedCard
              key={project.id}
              project={project}
              index={i}
              onSelect={goTo}
              ref={setCardRef(i)}
            />
          ))}
        </div>
      </div>

      <div className="coverflow-controls">
        <button className="coverflow-arrow" onClick={goPrev} disabled={!canGoPrev} aria-label="Previous project">
          <ChevronLeft size={16} strokeWidth={1.5} />
        </button>

        <div className="coverflow-dots" role="tablist" aria-label="Project navigation">
          {Array.from({ length: total }, (_, i) => (
            <button
              key={i}
              className={`coverflow-dot ${i === activeIndex ? 'active' : ''}`}
              onClick={() => goTo(i)}
              role="tab"
              aria-selected={i === activeIndex}
              aria-label={`Go to project ${i + 1}`}
            />
          ))}
        </div>

        <button className="coverflow-arrow" onClick={goNext} disabled={!canGoNext} aria-label="Next project">
          <ChevronRight size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}
