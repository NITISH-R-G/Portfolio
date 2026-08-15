import Button from '../components/Button'
import { track, AnalyticsEvents } from '../lib/analytics'

const SOCIAL_LABELS = {
  github: 'GitHub', linkedin: 'LinkedIn', leetcode: 'LeetCode', hackerrank: 'HackerRank',
  hackerearth: 'HackerEarth', codeforces: 'Codeforces', codechef: 'CodeChef', devpost: 'Devpost',
  kaggle: 'Kaggle', medium: 'Medium', googleScholar: 'Google Scholar', stackOverflow: 'Stack Overflow',
  npm: 'npm', pypi: 'PyPI', huggingFace: 'Hugging Face', x: 'X', youtube: 'YouTube',
  personalWebsite: 'Website', hashnode: 'Hashnode', substack: 'Substack', researchGate: 'ResearchGate',
  orcid: 'ORCID', semanticScholar: 'Semantic Scholar', dblp: 'dblp', gitlab: 'GitLab',
  bitbucket: 'Bitbucket', dockerHub: 'Docker Hub',
}

/**
 * Contact links assembled from identity contact info and every connected social profile —
 * a portfolio's "how to reach me" should never require the visitor to hunt through a header
 * icon row, so everything usable is listed here too.
 *
 * @param {{identity: import('../core/schema/types.js').Identity, socials: import('../core/schema/types.js').Socials, cta?: string, hideEmail?: boolean, obfuscateEmail?: boolean}} props
 */
export default function ContactSection({ identity, socials, cta, hideEmail = false, obfuscateEmail = true }) {
  const availability = identity?.availability
  const contact = identity?.contact

  /** @type {{label: string, value: string, href: string}[]} */
  const links = []

  if (contact?.email && !hideEmail) {
    links.push({
      label: 'Email',
      value: obfuscateEmail ? contact.email.replace('@', ' [at] ') : contact.email,
      href: `mailto:${contact.email}`,
    })
  }
  for (const link of contact?.links ?? []) {
    links.push({ label: link.label, value: link.url.replace(/^https?:\/\//, ''), href: link.url })
  }
  for (const [key, url] of Object.entries(socials ?? {})) {
    if (!url) continue
    links.push({
      label: SOCIAL_LABELS[key] ?? key[0].toUpperCase() + key.slice(1),
      value: url.replace(/^https?:\/\//, '').replace(/\/$/, ''),
      href: url,
    })
  }

  if (links.length === 0) return null

  return (
    <>
      {availability?.label && availability.status !== 'closed' && (
        <div className="contact-availability">
          <span className={`availability-badge availability-${availability.status || 'open'}`}>
            {availability.label}
          </span>
          {availability.currentAffiliation && (
            <span className="availability-affiliation">{availability.currentAffiliation}</span>
          )}
        </div>
      )}

      <p className="contact-cta">{cta || availability?.label || 'Feel free to reach out.'}</p>

      {availability?.preferredRoles?.length > 0 && (
        <div className="contact-preferred">
          <span className="contact-preferred-label">Preferred roles:</span>
          <span className="contact-preferred-items">{availability.preferredRoles.join(' · ')}</span>
        </div>
      )}

      {availability?.preferredLocations?.length > 0 && (
        <div className="contact-preferred">
          <span className="contact-preferred-label">Location:</span>
          <span className="contact-preferred-items">{availability.preferredLocations.join(' · ')}</span>
        </div>
      )}

      <div className="contact-table">
        {links.map((link, i) => (
          <Button
            key={i}
            variant={link.href.startsWith('http') || link.href.startsWith('mailto:') ? 'external' : 'ghost'}
            href={link.href}
            externalIcon={link.href.startsWith('http') || link.href.startsWith('mailto:')}
            className="contact-row"
            onClick={() => track(AnalyticsEvents.CONTACT_CLICK, { label: link.label })}
          >
            <span className="contact-label">{link.label}</span>
            <span className="contact-value">{link.value}</span>
          </Button>
        ))}
      </div>

      {availability?.responseTime && (
        <p className="contact-response-time">{availability.responseTime}</p>
      )}
    </>
  )
}
