import { useRef, useCallback, useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useReducedMotion } from '../hooks/useReducedMotion'
import Icon from './Icon'

const CARD_WIDTH = 300
const CARD_HEIGHT = 380
const GAP = 24

const PLACEHOLDER_IMAGES = {
  raven: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&h=400&fit=crop',
  clicky: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600&h=400&fit=crop',
  'intelli-credit': 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&h=400&fit=crop',
  roadsos: 'https://images.unsplash.com/photo-1449965408869-ebd3fee26574?w=600&h=400&fit=crop',
  'discourse-rag': 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=600&h=400&fit=crop',
  railatc: 'https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=600&h=400&fit=crop',
}

function ProjectCard({ project, index, reducedMotion }) {
  const imgSrc = project.coverImage || PLACEHOLDER_IMAGES[project.id] || PLACEHOLDER_IMAGES.raven

  return (
    <motion.a
      href={project.link}
      className="project-scroll-card"
      whileHover={reducedMotion ? {} : { y: -6 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <div className="project-scroll-image-wrap">
        <img
          src={imgSrc}
          alt={project.imageAlt || project.title}
          className="project-scroll-image"
          loading={index < 3 ? 'eager' : 'lazy'}
        />
      </div>
      <div className="project-scroll-content">
        <div className="project-scroll-tag">
          <Icon name={project.icon || 'FolderKanban'} size={14} />
          <span>{project.tags?.[0] || 'Project'}</span>
        </div>
        <h3 className="project-scroll-title">{project.title}</h3>
        <p className="project-scroll-desc">{project.description}</p>
        <div className="project-scroll-footer">
          <div className="project-scroll-tags">
            {project.tags?.slice(0, 3).map((tag) => (
              <span key={tag} className="project-scroll-chip">{tag}</span>
            ))}
          </div>
          <div className="project-scroll-arrow">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </motion.a>
  )
}

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
  }, [updateScrollState])

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
          <ProjectCard
            key={project.id}
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
