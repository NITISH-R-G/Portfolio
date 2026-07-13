import { motion } from 'motion/react'
import { useReducedMotion } from '../hooks/useReducedMotion'

export default function Button({
  variant = 'primary',
  href,
  isExternal = false,
  externalIcon = false,
  children,
  className = '',
  disabled = false,
  ...props
}) {
  const reducedMotion = useReducedMotion()
  const isLink = Boolean(href)
  const showIcon = isExternal || externalIcon

  const baseStyles = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 18px',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'var(--font)',
    fontSize: '13px',
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    textDecoration: 'none',
  }

  const variants = {
    primary: {
      background: 'var(--accent)',
      color: 'var(--background)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--foreground)',
      border: '1px solid var(--border)',
    },
    external: {
      background: 'transparent',
      color: 'var(--accent)',
      padding: '8px 12px',
    },
  }

  const style = { ...baseStyles, ...variants[variant] }

  const whileHover = !reducedMotion && !disabled
    ? { x: showIcon ? 1 : 0, y: showIcon ? -1 : 1, transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] } }
    : {}

  const whileTap = !reducedMotion && !disabled ? { scale: 0.98 } : {}

  const Component = isLink ? motion.a : motion.button

  return (
    <Component
      href={href}
      style={style}
      className={className}
      disabled={!isLink && disabled}
      whileHover={whileHover}
      whileTap={whileTap}
      {...props}
    >
      {children}
      {showIcon && (
        <motion.svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          whileHover={!reducedMotion ? { x: 2, y: -2, transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] } } : {}}
          style={{ display: 'inline-block', verticalAlign: 'middle' }}
        >
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </motion.svg>
      )}
    </Component>
  )
}