/**
 * Portfolio entities as Markdown.
 *
 * Two audiences, one format. A recruiter pastes this into a document or an email; a model
 * reads it as context. Both are served by the same thing — clean prose with real headings —
 * and neither is served by a JSON dump, which is why this renders structure rather than
 * serializing fields.
 *
 * What is deliberately absent: internal identifiers, `source.extraction` internals, schema
 * bookkeeping, and anything the manifest's privacy boundary already removed. A reader should
 * get what the portfolio *says*, not a view of how this project stores it.
 *
 * @module @portfolio-engine/agent/markdown
 */

/** Human labels for the standard's collection names. */
const SECTION_TITLES = {
  experience: 'Experience',
  education: 'Education',
  projects: 'Projects',
  skills: 'Skills',
  publications: 'Publications',
  achievements: 'Achievements',
  certifications: 'Certifications',
  writing: 'Writing',
  packages: 'Packages',
  talks: 'Talks',
  hackathons: 'Hackathons',
  models: 'Models & datasets',
  videos: 'Videos',
  competitions: 'Competitive programming',
  languages: 'Languages',
}

/**
 * One entity as Markdown.
 *
 * @param {Record<string, any>} record
 * @param {{type?: string, heading?: number}} [options]
 * @returns {string}
 */
export function entityToMarkdown(record, options = {}) {
  if (!record || typeof record !== 'object') return ''
  const h = '#'.repeat(Math.min(Math.max(options.heading ?? 1, 1), 4))
  const lines = []

  const title = str(record.name ?? record.title ?? record.company ?? record.institution ?? record.platform)
  if (title) lines.push(`${h} ${title}`, '')

  /* The one-line context under the title ------------------------------------ */

  const meta = [
    str(record.role) || str(record.degree) || str(record.issuer) || str(record.venue),
    str(record.company && record.role ? record.company : ''),
    str(record.location),
    dateRange(record),
  ].filter(Boolean)
  if (meta.length) lines.push(`*${meta.join(' · ')}*`, '')

  /* Body -------------------------------------------------------------------- */

  const overview = str(record.description ?? record.summary ?? record.abstract ?? record.excerpt)
  if (overview) lines.push('## Overview', '', overview, '')

  for (const [label, value] of [
    ['Context', record.context], ['Problem', record.problem],
    ['Approach', record.approach], ['Impact', record.impact],
    ['Responsibilities', record.responsibilities], ['Lessons', record.lessons],
  ]) {
    if (str(value)) lines.push(`## ${label}`, '', str(value), '')
  }

  if (list(record.highlights).length) {
    lines.push('## Highlights', '', ...list(record.highlights).map((h2) => `- ${str(h2)}`), '')
  }

  const technologies = [...list(record.technologies), ...list(record.topics), ...list(record.tags)]
  if (technologies.length) {
    lines.push('## Technologies', '', technologies.map(str).filter(Boolean).join(', '), '')
  }

  if (list(record.metrics).length) {
    lines.push('## Results', '')
    for (const metric of list(record.metrics)) {
      const value = [str(metric?.value), str(metric?.label)].filter(Boolean).join(' — ')
      if (value) lines.push(`- ${value}${str(metric?.note) ? ` (${str(metric.note)})` : ''}`)
    }
    lines.push('')
  }

  if (list(record.authors).length) {
    lines.push('## Authors', '', list(record.authors).map(str).filter(Boolean).join(', '), '')
  }

  /* Evidence ---------------------------------------------------------------- */

  const evidence = evidenceLines(record)
  if (evidence.length) lines.push('## Evidence', '', ...evidence, '')

  /* Links ------------------------------------------------------------------- */

  const links = linkLines(record)
  if (links.length) lines.push('## Links', '', ...links, '')

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/**
 * A whole profile as Markdown.
 *
 * @param {Record<string, any>} manifest
 * @param {{sections?: string[]}} [options]
 * @returns {string}
 */
export function manifestToMarkdown(manifest, options = {}) {
  if (!manifest || typeof manifest !== 'object') return ''
  const person = manifest.person ?? {}
  const lines = []

  if (str(person.name)) lines.push(`# ${str(person.name)}`, '')
  const subtitle = [str(person.headline), str(person.location)].filter(Boolean).join(' · ')
  if (subtitle) lines.push(`*${subtitle}*`, '')
  if (str(person.summary)) lines.push(str(person.summary), '')

  const socials = Object.entries(manifest.socials ?? {}).filter(([, url]) => str(url))
  if (socials.length) {
    lines.push('## Links', '', ...socials.map(([k, url]) => `- ${label(k)}: ${str(url)}`), '')
  }
  if (str(person.contact?.email)) lines.push(`- Email: ${str(person.contact.email)}`, '')

  const wanted = options.sections?.length ? options.sections : Object.keys(SECTION_TITLES)

  for (const section of wanted) {
    const records = manifest[section]
    if (!Array.isArray(records) || !records.length) continue
    lines.push(`## ${SECTION_TITLES[section] ?? label(section)}`, '')

    if (section === 'skills') {
      // A skill list is a list, not a series of documents — rendering each as its own
      // section would bury the actual content under ninety headings.
      for (const skill of records) {
        const evidence = list(skill.evidence).map((e) => str(e?.label)).filter(Boolean)
        lines.push(`- **${str(skill.name)}**${evidence.length ? ` — ${evidence.join('; ')}` : ''}`)
      }
      lines.push('')
      continue
    }

    for (const record of records) {
      lines.push(entityToMarkdown(record, { heading: 3 }).trim(), '')
    }
  }

  if (str(manifest.url)) lines.push('---', '', `Source: ${str(manifest.url)}`, '')

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/**
 * A set of search results as Markdown.
 *
 * Carries the *evidence*, not a list of titles. The point of copying a result set is that
 * someone can act on it elsewhere — in a document, an email, or another assistant — and a
 * bare list of names supports none of that.
 *
 * The question is included because a result set without it is uninterpretable: "Screen Saathi,
 * Encolink, accessibility" means nothing without "what did he build for accessibility?".
 *
 * @param {import('./search.js').SearchResult[]} results
 * @param {{query?: string, person?: string, source?: string, limit?: number}} [options]
 * @returns {string}
 */
export function resultsToMarkdown(results, options = {}) {
  const list = (Array.isArray(results) ? results : []).slice(0, options.limit ?? 20)
  const lines = []

  const who = str(options.person)
  lines.push(`# ${who ? `${who} — search results` : 'Portfolio search results'}`, '')
  if (str(options.query)) lines.push(`**Question:** ${str(options.query)}`, '')

  if (!list.length) {
    lines.push('No matching evidence was found in this portfolio.', '')
    return lines.join('\n')
  }

  /** @type {Map<string, import('./search.js').SearchResult[]>} */
  const groups = new Map()
  for (const result of list) {
    if (!groups.has(result.type)) groups.set(result.type, [])
    groups.get(result.type).push(result)
  }

  for (const [type, items] of groups) {
    lines.push(`## ${SECTION_TITLES[type] ?? label(type)}`, '')
    for (const result of items) {
      lines.push(`### ${str(result.title)}`)
      if (str(result.subtitle)) lines.push(`*${str(result.subtitle)}*`)
      lines.push('')

      const record = result.record ?? {}
      const overview = str(record.description ?? record.summary ?? record.abstract ?? record.excerpt)
      if (overview) lines.push(overview, '')

      const tech = [...list_(record.technologies), ...list_(record.topics), ...list_(record.tags)]
        .map(str).filter(Boolean)
      if (tech.length) lines.push(`**Technologies:** ${tech.join(', ')}`, '')

      // Why it matched — kept so a reader can tell a direct hit from a related-concept one,
      // and so nobody mistakes "relevant" for "asserted".
      const direct = (result.matched ?? []).filter((m) => m.direct).map((m) => m.term)
      const related = (result.matched ?? []).filter((m) => !m.direct).map((m) => m.term)
      if (direct.length) lines.push(`**Matched:** ${direct.join(', ')}`)
      if (related.length) lines.push(`**Related concepts:** ${related.join(', ')}`)
      if (result.reason === 'section') {
        lines.push(`**Matched:** listed under ${SECTION_TITLES[type] ?? label(type)} (no term match)`)
      }

      const evidence = (result.provenance?.evidence ?? []).map((e) => str(e?.label)).filter(Boolean)
      if (evidence.length) lines.push(`**Evidence:** ${evidence.join('; ')}`)
      if (str(result.provenance?.source)) lines.push(`**Source:** ${label(str(result.provenance.source))}`)
      if (str(result.url)) lines.push(`**Link:** ${str(result.url)}`)
      lines.push('')
    }
  }

  if (str(options.source)) lines.push('---', '', `From ${str(options.source)}`, '')
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/** @param {unknown} value */
const list_ = (value) => (Array.isArray(value) ? value : [])

/** @param {Record<string, any>} record */
function evidenceLines(record) {
  const lines = []
  for (const item of list(record.evidence)) {
    const label2 = str(item?.label)
    if (label2) lines.push(`- ${label2}${str(item?.connector) ? ` (${label(str(item.connector))})` : ''}`)
  }
  const source = record.source
  if (source?.connector) {
    const parts = [`Reported by ${label(String(source.connector))}`]
    if (source.url) parts.push(source.url)
    lines.push(`- ${parts.join(' — ')}`)
  }
  return lines
}

/** @param {Record<string, any>} record */
function linkLines(record) {
  const lines = []
  const seen = new Set()
  const add = (text, url) => {
    if (!str(url) || seen.has(url)) return
    seen.add(url)
    lines.push(`- [${text}](${url})`)
  }
  add('Repository', record.repository)
  add('Live', record.liveUrl)
  add('Link', record.url)
  add('Credential', record.credentialUrl)
  if (str(record.doi)) add('DOI', `https://doi.org/${str(record.doi)}`)
  for (const link of list(record.links)) add(str(link?.label) || 'Link', link?.url)
  return lines
}

/** @param {Record<string, any>} record */
function dateRange(record) {
  const format = (d) => {
    if (!d) return ''
    if (typeof d === 'string') return d
    if (typeof d?.iso !== 'string') return ''
    const [y, m] = d.iso.split('-')
    if (d.precision === 'year') return y
    const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]
    return month ? `${month} ${y}` : y
  }
  if (record.dates) {
    const start = format(record.dates.start)
    const end = record.dates.current ? 'Present' : format(record.dates.end)
    if (start || end) return [start, end].filter(Boolean).join(' – ')
  }
  return format(record.date)
}

/** @param {string} value */
const label = (value) => String(value)
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/^./, (c) => c.toUpperCase())

/** @param {unknown} value */
const str = (value) => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '')

/** @param {unknown} value */
const list = (value) => (Array.isArray(value) ? value : [])

export { SECTION_TITLES }
