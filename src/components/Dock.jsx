import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from 'motion/react'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigation } from '../hooks/usePortfolio'
import { useReducedMotion } from '../hooks/useReducedMotion'
import Icon from './Icon'

const DOCK_HEIGHT = 128
const DEFAULT_MAGNIFICATION = 72
const DEFAULT_DISTANCE = 150
const PANEL_HEIGHT = 52

const DockContext = createContext(null)

function useDock() {
  const ctx = useContext(DockContext)
  if (!ctx) throw new Error('useDock must be used within DockProvider')
  return ctx
}

export default function Dock({ activeSection, onNavigate }) {
  const navItems = useNavigation()
  const reducedMotion = useReducedMotion()
  const mouseX = useMotionValue(Infinity)
  const [isPanelHovered, setIsPanelHovered] = useState(false)

  const magnification = reducedMotion ? PANEL_HEIGHT : DEFAULT_MAGNIFICATION
  const spring = useMemo(() => ({ mass: 0.1, stiffness: 150, damping: 12 }), [])

  const maxHeight = useMemo(
    () => Math.max(DOCK_HEIGHT, magnification + magnification / 2 + 4),
    [magnification]
  )

  const heightRow = useTransform(
    useMotionValue(isPanelHovered ? 1 : 0),
    [0, 1],
    [PANEL_HEIGHT, maxHeight]
  )
  const height = useSpring(heightRow, spring)

  return (
    <motion.nav
      className="dock-container"
      aria-label="Section navigation"
      style={{ height: reducedMotion ? PANEL_HEIGHT : height }}
      initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
    >
      <motion.div
        className="dock-panel"
        onMouseMove={(e) => {
          setIsPanelHovered(true)
          mouseX.set(e.pageX)
        }}
        onMouseLeave={() => {
          setIsPanelHovered(false)
          mouseX.set(Infinity)
        }}
        role="toolbar"
        aria-label="Application dock"
      >
        <DockContext.Provider value={{ mouseX, spring, distance: DEFAULT_DISTANCE, magnification, activeSection, onNavigate, reducedMotion }}>
          {navItems.map((item) => (
            <DockItem key={item.id} item={item} />
          ))}
        </DockContext.Provider>
      </motion.div>
    </motion.nav>
  )
}

function DockItem({ item }) {
  const ref = useRef(null)
  const { distance, magnification, mouseX, spring, activeSection, onNavigate, reducedMotion } = useDock()
  const isHovered = useMotionValue(0)
  const isActive = activeSection === item.id
  const [showLabel, setShowLabel] = useState(false)

  const mouseDistance = useTransform(mouseX, (val) => {
    const rect = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 }
    return val - rect.x - rect.width / 2
  })

  const widthTransform = useTransform(
    mouseDistance,
    [-distance, 0, distance],
    [40, magnification, 40]
  )
  const width = useSpring(widthTransform, spring)

  useEffect(() => {
    if (reducedMotion) return
    const unsub = isHovered.on('change', (v) => setShowLabel(v === 1))
    return unsub
  }, [isHovered, reducedMotion])

  const handleClick = () => {
    onNavigate(item.id)
    const target = document.getElementById(item.id)
    if (target) {
      target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }

  return (
    <motion.button
      ref={ref}
      type="button"
      className="dock-item"
      style={{ width: reducedMotion ? 40 : width }}
      onHoverStart={() => isHovered.set(1)}
      onHoverEnd={() => isHovered.set(0)}
      onFocus={() => isHovered.set(1)}
      onBlur={() => isHovered.set(0)}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={item.label}
      aria-current={isActive ? 'true' : undefined}
    >
      <AnimatePresence>
        {showLabel && !reducedMotion && (
          <motion.div
            className="dock-label"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: -4 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            aria-hidden="true"
          >
            {item.label}
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        className={`dock-icon ${isActive ? 'active' : ''}`}
        aria-hidden="true"
      >
        <Icon name={item.icon} size={20} />
      </motion.div>
    </motion.button>
  )
}
