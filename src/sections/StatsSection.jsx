import { motion } from 'motion/react'
import { headlineStats } from '../core/generate/stats.js'

/**
 * The "By the numbers" strip: a handful of the strongest fetched/derived stats.
 *
 * Every number here traces back to imported records or to a named source (see
 * `core/generate/stats.js`). This component only picks which four to lead with and labels
 * where each came from — a platform reported it, this project counted it, or the owner
 * stated it — so a reader can tell a measurement from a claim.
 *
 * @param {{entries: import('../core/schema/types.js').StatEntry[], showProvenance?: boolean}} props
 */
export default function StatsSection({ entries, showProvenance = true }) {
  const stats = headlineStats(entries, 4)
  if (!stats.length) return null

  return (
    <div className="stats-grid">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.id}
          className="stat-tile"
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.3, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="stat-value">{stat.display}</span>
          <span className="stat-label">{stat.label}</span>
          {stat.note && <span className="stat-note">{stat.note}</span>}
          {showProvenance && stat.kind !== 'derived' && (
            <span
              className="stat-provenance"
              title={stat.kind === 'fetched'
                ? 'Reported directly by the source platform'
                : 'Entered by the portfolio owner — this platform publishes no API to check it against'}
            >
              {stat.kind === 'fetched' ? 'reported' : 'self-reported'}
            </span>
          )}
        </motion.div>
      ))}
    </div>
  )
}
