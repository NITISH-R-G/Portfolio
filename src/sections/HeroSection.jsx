import { motion } from 'motion/react'
import { assetUrl } from '../lib/assetUrl.js'

const AVATAR_RADIUS = { circle: '50%', rounded: 'var(--radius-lg)', square: '0' }

/**
 * Identity block: photo, name, headline, availability. The one section that is always
 * eligible to render — a portfolio with nothing else configured still shows who it belongs
 * to — see `alwaysConsider` in `core/generate/sections.js`.
 *
 * @param {{identity: import('../core/schema/types.js').Identity, avatarStyle?: 'circle'|'rounded'|'square', reducedMotion: boolean}} props
 */
export default function HeroSection({ identity, avatarStyle = 'circle', reducedMotion }) {
  if (!identity?.name) return null
  return (
    <div className="profile">
      {identity.avatar && (
        <motion.img
          src={identity.avatar}
          alt={identity.name}
          className="profile-photo"
          style={{ borderRadius: AVATAR_RADIUS[avatarStyle] ?? '50%' }}
          width="64"
          height="64"
          loading="eager"
          decoding="async"
          whileHover={!reducedMotion ? { rotate: 2, scale: 1.02 } : {}}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        />
      )}
      <h1 className="profile-name">
        {identity.name}
        {identity.pronouns && <span className="profile-pronouns"> ({identity.pronouns})</span>}
      </h1>
      {identity.headline && <p className="profile-role">{identity.headline}</p>}
      {identity.location && <p className="profile-location">{identity.location}</p>}
      {identity.availability?.label && identity.availability.status !== 'closed' && (
        <span className={`availability-badge availability-${identity.availability.status || 'open'} profile-availability`}>
          {identity.availability.label}
        </span>
      )}
    </div>
  )
}
