import { motion } from 'motion/react'
import { useReducedMotion } from '../hooks/useReducedMotion'

export default function ProjectCard({ project }) {
  const reducedMotion = useReducedMotion()
  const imageExists = project.image && project.image !== '/assets/profile.svg'
  
  return (
    <motion.div
      className="project-card"
      data-cursor="interactive"
      initial={false}
      whileHover={reducedMotion ? {} : { y: -4, scale: 1.005 }}
      transition={{
        duration: 0.28,
        ease: [0.16, 1, 0.3, 1],
      }}
      style={{ height: '100%' }}
    >
      <div className="project-image-wrapper">
        {imageExists ? (
          <motion.div
            className="project-image"
            style={{ backgroundImage: `url(${project.image})` }}
            whileHover={reducedMotion ? {} : { scale: 1.02 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          />
        ) : (
          <div
            className="project-image"
            style={{ background: `linear-gradient(135deg, ${project.color} 0%, ${project.color}88 100%)` }}
          />
        )}
        <div className="project-logo" style={{ background: project.color }}>
          {project.icon}
        </div>
      </div>
      <div className="project-info">
        <h3 className="project-title">{project.title}</h3>
        <p className="project-description">{project.description}</p>
        <div className="project-meta">
          {project.tags.map(tag => <span key={tag}>{tag}</span>)}
        </div>
        <a href={project.link} className="project-link">View details →</a>
      </div>
    </motion.div>
  )
}