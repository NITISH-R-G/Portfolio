import { useState, useCallback, useEffect } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'motion/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useReducedMotion } from '../hooks/useReducedMotion'

function CoverflowCard({ project, index, activeIndex, total, onSelect, reducedMotion }) {
  const diff = useTransform(activeIndex, (latest) => latest - index)

  const x = useTransform(diff, (d) => {
    if (reducedMotion) return '0%'
    if (Math.abs(d) < 0.01) return '0%'
    const side = d < 0 ? 1 : -1
    const absDiff = Math.abs(d)
    const shift = side * (72 + (Math.max(0, Math.round(absDiff) - 1)) * 8)
    return `${shift}%`
  })

  const scale = useTransform(diff, (d) => {
    if (reducedMotion) return 1
    const absD = Math.abs(d)
    if (absD < 0.5) return 1
    if (absD < 1.5) return 0.72
    return 0.58
  })

  const rotateY = useTransform(diff, (d) => {
    if (reducedMotion) return 0
    const absD = Math.abs(d)
    if (absD < 0.01) return 0
    return (d < 0 ? 1 : -1) * 18
  })

  const opacity = useTransform(diff, (d) => {
    const absD = Math.abs(d)
    if (absD < 0.5) return 1
    if (absD < 1.5) return 0.55
    if (absD < 2.5) return 0.25
    return 0
  })

  const infoOpacity = useTransform(diff, (d) => {
    if (Math.abs(d) < 0.5) return 1
    return 0
  })

  const zIndex = useTransform(diff, (d) => {
    return 10 - Math.round(Math.abs(d))
  })

  const springTransition = reducedMotion
    ? { duration: 0 }
    : { type: 'spring', stiffness: 200, damping: 28, mass: 1 }

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
        width: 'clamp(300px, 55%, 460px)',
        marginLeft: 'clamp(-150px, -27.5%, -230px)',
        transformOrigin: 'center center',
        willChange: 'transform, opacity',
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
        <motion.div
          className="coverflow-info"
          style={{ opacity: infoOpacity, pointerEvents: 'none' }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.15 }}
        >
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
        </motion.div>
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
        stiffness: 200,
        damping: 28,
        mass: 1,
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
