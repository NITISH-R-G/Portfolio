import { useState, useCallback, useEffect } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'motion/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useReducedMotion } from '../hooks/useReducedMotion'

function CoverflowCard({ project, index, activeIndex, total, onSelect, reducedMotion }) {
  const x = useTransform(
    activeIndex,
    (latest) => {
      const diff = index - latest
      if (diff === 0) return '0%'
      const side = diff < 0 ? -1 : 1
      const absDiff = Math.abs(diff)
      const slatShift = side * (72 + (absDiff - 1) * 8)
      return `${slatShift}%`
    }
  )

  const scale = useTransform(
    activeIndex,
    (latest) => {
      const diff = Math.abs(index - latest)
      if (diff === 0) return 1
      if (diff === 1) return 0.72
      return 0.58
    }
  )

  const rotateY = useTransform(
    activeIndex,
    (latest) => {
      const diff = index - latest
      if (diff === 0) return 0
      const side = diff < 0 ? -1 : 1
      return side * 18
    }
  )

  const opacity = useTransform(
    activeIndex,
    (latest) => {
      const diff = Math.abs(index - latest)
      if (diff === 0) return 1
      if (diff === 1) return 0.55
      if (diff === 2) return 0.25
      return 0
    }
  )

  const zIndex = useTransform(
    activeIndex,
    (latest) => {
      const diff = Math.abs(index - latest)
      return 10 - diff
    }
  )

  const isActive = useTransform(
    activeIndex,
    (latest) => Math.abs(index - latest) < 0.5
  )

  const springTransition = reducedMotion
    ? { duration: 0 }
    : { type: 'spring', stiffness: 280, damping: 30, mass: 0.9 }

  return (
    <motion.div
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
      style={{
        x,
        scale,
        rotateY,
        opacity,
        zIndex,
        position: 'absolute',
        left: '50%',
        top: 0,
        width: 'clamp(320px, 65%, 520px)',
        marginLeft: 'clamp(-160px, -32.5%, -260px)',
        transformOrigin: 'center center',
      }}
      transition={springTransition}
    >
      <div className="coverflow-card-inner">
        <div className="coverflow-image-area">
          <div
            className="coverflow-image-bg"
            style={{
              background: `linear-gradient(135deg, ${project.color}18 0%, ${project.color}06 100%)`,
            }}
          />
          <div className="coverflow-card-icon">{project.icon}</div>
        </div>
        <div className="coverflow-info">
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
    </motion.div>
  )
}

export default function ProjectsCoverflow({ projects }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const reducedMotion = useReducedMotion()
  const motionIndex = useMotionValue(0)
  const total = projects.length

  useEffect(() => {
    if (reducedMotion) {
      motionIndex.set(activeIndex)
    } else {
      animate(motionIndex, activeIndex, {
        type: 'spring',
        stiffness: 280,
        damping: 30,
        mass: 0.9,
      })
    }
  }, [activeIndex, reducedMotion, motionIndex])

  const goTo = useCallback(
    (idx) => {
      const clamped = Math.max(0, Math.min(total - 1, idx))
      setActiveIndex(clamped)
    },
    [total]
  )

  const goPrev = useCallback(() => goTo(activeIndex - 1), [activeIndex, goTo])
  const goNext = useCallback(() => goTo(activeIndex + 1), [activeIndex, goTo])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNext()
      }
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
            <CoverflowCard
              key={project.id}
              project={project}
              index={i}
              activeIndex={motionIndex}
              total={total}
              onSelect={goTo}
              reducedMotion={reducedMotion}
            />
          ))}
        </div>
      </div>

      <div className="coverflow-controls">
        <button
          className="coverflow-arrow"
          onClick={goPrev}
          disabled={!canGoPrev}
          aria-label="Previous project"
        >
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

        <button
          className="coverflow-arrow"
          onClick={goNext}
          disabled={!canGoNext}
          aria-label="Next project"
        >
          <ChevronRight size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}
