import { motion } from 'motion/react'
import { usePortfolio } from '../hooks/usePortfolio'
import { useReducedMotion } from '../hooks/useReducedMotion'
import Icon from './Icon'

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } }
}

const item = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] } }
}

const socialItem = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: (i) => ({
    opacity: 1,
    scale: 1,
    transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1], delay: i * 0.03 }
  })
}

export default function Sidebar() {
  const { profile, about, skills, languages, social } = usePortfolio()
  const reducedMotion = useReducedMotion()

  const socialIcons = [
    { key: 'github', url: social.github, label: 'GitHub', icon: 'Github' },
    { key: 'linkedin', url: social.linkedin, label: 'LinkedIn', icon: 'Linkedin' },
    { key: 'twitter', url: social.twitter, label: 'Twitter', icon: 'Twitter' },
    { key: 'youtube', url: social.youtube, label: 'YouTube', icon: 'Youtube' }
  ].filter(s => s.url)

  return (
    <motion.aside
      className="sidebar"
      initial={reducedMotion ? 'visible' : 'hidden'}
      animate="visible"
      variants={container}
    >
      <motion.div className="profile" variants={item}>
        <motion.img
          src={profile.image}
          alt={profile.name}
          className="profile-photo"
          width="64"
          height="64"
          loading="eager"
          whileHover={!reducedMotion ? { rotate: 2, scale: 1.02 } : {}}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        />
        <h1 className="profile-name">{profile.name}</h1>
        <p className="profile-role">{profile.role}</p>
      </motion.div>

      {about.enabled && (
        <motion.section id="about" className="sidebar-section" variants={item}>
          <h2 className="section-label">ABOUT</h2>
          <p className="about-text">{about.text}</p>
        </motion.section>
      )}

      {skills.enabled && (
        <motion.section id="skills" className="sidebar-section" variants={item}>
          <h2 className="section-label">SKILLS</h2>
          <div className="skills-grid">
            {skills.categories.flatMap(cat => cat.items).map((skill, i) => (
              <motion.span
                key={skill}
                className="skill-tag"
                variants={item}
                whileHover={!reducedMotion ? { scale: 1.05, borderColor: 'var(--color-border-strong)' } : {}}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              >
                {skill}
              </motion.span>
            ))}
          </div>
        </motion.section>
      )}

      {languages.enabled && (
        <motion.section className="sidebar-section" variants={item}>
          <h2 className="section-label">LANGUAGES</h2>
          <div className="languages-list">
            {languages.items.map(lang => (
              <div key={lang.name} className="language-item">
                <span>{lang.name}</span>
                <div className="language-dots">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className={`dot ${i < lang.level ? 'filled' : ''}`} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </motion.section>
      )}

      <motion.div className="social-links" variants={container}>
        {socialIcons.map((s, i) => (
          <motion.a
            key={s.key}
            href={s.url}
            className="social-icon"
            aria-label={s.label}
            target="_blank"
            rel="noopener noreferrer"
            variants={socialItem}
            whileHover={!reducedMotion ? { scale: 1.1, borderColor: 'var(--color-border-strong)' } : {}}
            whileTap={!reducedMotion ? { scale: 0.95 } : {}}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            <Icon name={s.icon} size={18} aria-hidden="true" />
          </motion.a>
        ))}
      </motion.div>
    </motion.aside>
  )
}
