import { motion } from 'motion/react'
import { useReducedMotion } from '../hooks/useReducedMotion'

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 }
}

export default function Section({ id, label, children, className = '' }) {
  const reducedMotion = useReducedMotion()
  
  return (
    <motion.section
      id={id}
      className={`content-section ${className}`}
      initial={reducedMotion ? 'visible' : 'hidden'}
      whileInView="visible"
      viewport={{ once: true, amount: 0.18 }}
      variants={fadeUp}
      transition={reducedMotion
        ? { duration: 0.01, ease: 'linear' }
        : { duration: 0.52, ease: [0.16, 1, 0.3, 1] }}
    >
      {label && <h2 className="section-label">{label}</h2>}
      {children}
    </motion.section>
  )
}