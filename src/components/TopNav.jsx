import { motion } from 'motion/react'
import Icon from './Icon'
import { useReducedMotion } from '../hooks/useReducedMotion'

/**
 * Horizontal top navigation bar — the alternative to the magnifying `Dock`, selected via
 * `layout.navigation: "top"`. Suits the `stacked` shell and themes (Editorial, Academic,
 * Corporate) where a floating dock would look out of place.
 *
 * @param {{navigation: {id: string, label: string, icon: string}[], activeSection: string, onNavigate: (id: string) => void}} props
 */
export default function TopNav({ navigation, activeSection, onNavigate }) {
  const reducedMotion = useReducedMotion()
  if (!navigation.length) return null

  const handleClick = (id) => {
    onNavigate(id)
    document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <motion.nav
      className="top-nav"
      aria-label="Section navigation"
      initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="top-nav-track" role="toolbar" aria-label="Section links">
        {navigation.map((item) => (
          <button
            key={item.id}
            type="button"
            className="top-nav-item"
            aria-current={activeSection === item.id ? 'page' : undefined}
            onClick={() => handleClick(item.id)}
          >
            <Icon name={item.icon} size={15} aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </motion.nav>
  )
}
