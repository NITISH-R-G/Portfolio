import { motion, AnimatePresence } from 'motion/react'
import { useNavigation } from '../hooks/usePortfolio'
import { useReducedMotion } from '../hooks/useReducedMotion'
import Icon from './Icon'
import { useState, useEffect, useRef } from 'react'

const indicatorSpring = { stiffness: 380, damping: 32, mass: 0.65 }

export default function FloatingNav({ activeSection, onNavigate }) {
  const navItems = useNavigation()
  const reducedMotion = useReducedMotion()
  const [tooltips, setTooltips] = useState({})
  const [hoveredIndex, setHoveredIndex] = useState(null)
  const isDesktopRef = useRef(window.innerWidth >= 1024)
  const tooltipTimeoutRef = useRef(null)

  const handleClick = (sectionId) => {
    if (onNavigate) {
      onNavigate(sectionId)
    }
  }

  useEffect(() => {
    const checkDesktop = () => {
      isDesktopRef.current = window.innerWidth >= 1024 && !reducedMotion
    }
    checkDesktop()
    window.addEventListener('resize', checkDesktop)
    return () => window.removeEventListener('resize', checkDesktop)
  }, [reducedMotion])

  const handleMouseEnter = (index) => {
    if (!isDesktopRef.current) return
    tooltipTimeoutRef.current = setTimeout(() => {
      setHoveredIndex(index)
      setTooltips(prev => ({ ...prev, [index]: true }))
    }, 250)
  }

  const handleMouseLeave = (index) => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current)
      tooltipTimeoutRef.current = null
    }
    setHoveredIndex(null)
    setTooltips(prev => ({ ...prev, [index]: false }))
  }

  const activeIndex = navItems.findIndex(item => item.id === activeSection)

  return (
    <motion.nav
      className="floating-nav"
      aria-label="Section navigation"
      initial={reducedMotion ? { opacity: 1, x: "-50%", y: 0 } : { opacity: 0, x: "-50%", y: 6 }}
      animate={{ opacity: 1, x: "-50%", y: 0 }}
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
    >
      <AnimatePresence mode="popLayout">
        <motion.div
          layoutId="portfolio-nav-active-indicator"
          className="nav-indicator"
          style={{
            position: 'absolute',
            top: '8px',
            bottom: '8px',
            borderRadius: '24px',
            background: 'rgba(139, 92, 246, 0.18)',
            border: '1px solid var(--accent)',
            boxShadow: '0 0 16px rgba(139, 92, 246, 0.25)',
            transition: indicatorSpring,
          }}
          initial={false}
        />
      </AnimatePresence>

      {navItems.map((item, index) => (
        <motion.a
          key={item.id}
          href={`#${item.id}`}
          className={`nav-icon ${activeSection === item.id ? 'active' : ''}`}
          aria-label={item.label}
          style={{
            position: 'relative',
            zIndex: 1,
            color: activeSection === item.id ? 'var(--accent)' : 'var(--muted)',
          }}
          whileHover={!reducedMotion && isDesktopRef.current ? { scale: 1.06 } : {}}
          whileTap={!reducedMotion ? { scale: 0.96 } : {}}
          transition={{ type: 'spring', ...indicatorSpring }}
          onClick={() => handleClick(item.id)}
          onMouseEnter={() => handleMouseEnter(index)}
          onMouseLeave={() => handleMouseLeave(index)}
          onFocus={() => handleMouseEnter(index)}
          onBlur={() => handleMouseLeave(index)}
        >
          <Icon name={item.icon} size={20} aria-hidden="true" />
          <AnimatePresence mode="pop">
            {tooltips[index] && isDesktopRef.current && (
              <motion.div
                className="nav-tooltip"
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 8px)',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  whiteSpace: 'nowrap',
                  padding: '4px 10px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--foreground)',
                  pointerEvents: 'none',
                  zIndex: 10,
                }}
              >
                {item.label}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.a>
      ))}
    </motion.nav>
  )
}
