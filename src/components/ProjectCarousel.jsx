import { useRef, useCallback, useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useReducedMotion } from '../hooks/useReducedMotion'
import Icon from './Icon'
import ProjectTile from './ProjectTile'

/**
 * Horizontal scroll-snap carousel of project tiles.
 *
 * Unlike the original implementation, no per-project image is assumed to exist: a project
 * with no `image` gets a generated gradient tile (`ProjectTile`) derived deterministically
 * from its name, rather than a stock photo pulled in by id. See `ProjectTile.jsx`.
 *
 * @param {{projects: import('../core/schema/types.js').ProjectItem[]}} props
 */
export default function ProjectCarousel({ projects }) {
  const scrollRef = useRef(null)
  const reducedMotion = useReducedMotion()
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 10)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', updateScrollState, { passive: true })
    updateScrollState()
    return () => el.removeEventListener('scroll', updateScrollState)
  }, [updateScrollState, projects])

  const scroll = useCallback((dir) => {
    const el = scrollRef.current
    if (!el) return
    const amount = el.clientWidth * 0.75
    el.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: reducedMotion ? 'auto' : 'smooth' })
  }, [reducedMotion])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handleKey = (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); scroll('left') }
      else if (e.key === 'ArrowRight') { e.preventDefault(); scroll('right') }
    }
    el.addEventListener('keydown', handleKey)
    return () => el.removeEventListener('keydown', handleKey)
  }, [scroll])

  return (
    <div className="project-carousel" role="region" aria-label="Projects carousel">
      <button
        className="project-carousel-arrow left"
        onClick={() => scroll('left')}
        disabled={!canScrollLeft}
        aria-label="Scroll left"
      >
        <ChevronLeft size={18} strokeWidth={1.5} />
      </button>

      <div
        ref={scrollRef}
        className="project-carousel-track"
        tabIndex={0}
        role="list"
      >
        {projects.map((project, i) => (
          <ProjectTile
            key={project.id || project.name}
            project={project}
            index={i}
            reducedMotion={reducedMotion}
          />
        ))}
      </div>

      <button
        className="project-carousel-arrow right"
        onClick={() => scroll('right')}
        disabled={!canScrollRight}
        aria-label="Scroll right"
      >
        <ChevronRight size={18} strokeWidth={1.5} />
      </button>
    </div>
  )
}
