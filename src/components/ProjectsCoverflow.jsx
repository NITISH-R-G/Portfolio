import { useState, useCallback, useEffect } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'motion/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useReducedMotion } from '../hooks/useReducedMotion'

function CoverflowCard({ project, index, activeIndex, total, onSelect, reducedMotion }) {
  const isActive = index === activeIndex
  const offset = index - activeIndex

  const x = useTransform(
    activeIndex,
    (latest) => {
      const diff = index - latest
      if (diff === 0) return '0%'
      const side = diff < 0 ? -1 : 1
      const absDiff = Math.abs(diff)
      const slatShift = side * (65 + (absDiff - 1) * 12)
      return `${slatShift}%`
    }
  )

  const scale = useTransform(
    activeIndex,
    (latest) => {
      const diff = Math.abs(index - latest)
      if (diff === 0) return 1
      if (diff === 1) return 0.78
      return 0.65
    }
  )

  const rotateY = useTransform(
    activeIndex,
    (latest) => {
      const diff = index - latest
      if (diff === 0) return 0
      const side = diff < 0 ? -1 : 1
      return side * 25
    }
  )

  const opacity = useTransform(
    activeIndex,
    (latest) => {
      const diff = Math.abs(index - latest)
      if (diff === 0) return 1
      if (diff === 1) return 0.7
      if (diff === 2) return 0.4
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

  const springTransition = reducedMotion
    ? { duration: 0 }
    : { type: 'spring', stiffness: 260, damping: 28, mass: 0.8 }

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
      tabIndex={isActive ? 0 : -1}
      aria-label={`Project: ${project.title}${isActive ? ' (active)' : ''}`}
      style={{
        x,
        scale,
        rotateY,
        opacity,
        zIndex,
        position: 'absolute',
        left: '50%',
        top: 0,
        width: 'clamp(280px, 55%, 440px)',
        marginLeft: 'clamp(-140px, -27.5%, -220px)',
        transformOrigin: 'center center',
        perspective: 1200,
      }}
      transition={springTransition}
    >
      <div className="coverflow-card-inner">
        <div className="project-image-wrapper coverflow-image">
          <div
            className="project-image"
            style={{
              background: `linear-gradient(135deg, ${project.color}22 0%, ${project.color}08 100%)`,
            }}
          />
          <div className="coverflow-card-icon">{project.icon}</div>
        </div>
        <div className="project-info coverflow-info">
          <h3 className="project-title">{project.title}</h3>
          <p className="project-description">{project.description}</p>
          <div className="project-meta">
            {project.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <a href={project.link} className="project-link" onClick={(e) => e.stopPropagation()}>
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
        stiffness: 260,
        damping: 28,
        mass: 0.8,
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

  const dots = Array.from({ length: total }, (_, i) => i)

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
          <ChevronLeft size={18} strokeWidth={2} />
        </button>

        <div className="coverflow-dots" role="tablist" aria-label="Project navigation">
          {dots.map((i) => (
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
          <ChevronRight size={18} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
