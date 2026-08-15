#!/usr/bin/env node
/**
 * `npm run export` — everything else your profile has to live in, from the same data.
 *
 * The premise: you already maintain your identity in five places, and they are already
 * out of date. Since the portfolio is built from a normalized profile, the résumé, the
 * GitHub profile README and the machine-readable exports are all just other renderings of
 * that same object — so they never disagree with the site, and never need updating twice.
 *
 * Writes to `exports/`:
 *   portfolio.json    the full normalized profile
 *   resume.json       JSON Resume (jsonresume.org) — feeds every résumé theme there is
 *   resume.md         a plain-text-friendly résumé
 *   README.md         a GitHub profile README
 *   profile.md        the portfolio as a single Markdown document
 *   bio.txt           one-line, short and long bios for forms and social profiles
 *
 * @module scripts/export
 */

import { formatRange, formatDate } from '../src/core/schema/date.js'
import { headlineStats } from '../src/core/generate/stats.js'
import { groupSkills } from '../src/core/generate/skills.js'
import { toDocument } from '../src/core/standard/document.js'
import { loadBuiltPortfolio, PATHS, relative, fs, path } from './lib/portfolio.mjs'
import { dim, say, ok, warn, rule } from './lib/ui.mjs'

async function main() {
  const built = await loadBuiltPortfolio({ onError: (m) => warn(m) })
  const { profile, config } = built

  if (!profile.identity?.name) {
    warn('No `identity.name` is set, so the exports would be anonymous. Run `npm run setup` first.')
    return 1
  }

  say()
  rule('Exporting')

  fs.mkdirSync(PATHS.exports, { recursive: true })

  const files = [
    // The standard document, not a dump of internal state — this is the file another
    // renderer is expected to consume, so it carries its version and its spec URL.
    ['portfolio.json', () => `${JSON.stringify(toDocument(profile, {
      generatedAt: new Date().toISOString(),
      evidence: built.evidence,
      includeEvidence: true,
    }), null, 2)}\n`],
    ['resume.json', () => JSON.stringify(jsonResume(profile, config), null, 2) + '\n'],
    ['resume.md', () => resumeMarkdown(profile)],
    ['README.md', () => profileReadme(profile, config)],
    ['profile.md', () => fullMarkdown(profile)],
    ['bio.txt', () => bios(profile)],
  ]

  for (const [name, render] of files) {
    const file = path.join(PATHS.exports, name)
    fs.writeFileSync(file, render(), 'utf8')
    ok(`${relative(file)} ${dim(`${size(file)}`)}`)
  }

  say()
  say(dim('These are generated. Edit your config or data and re-run — never edit them by hand.'))
  return 0
}

/* -------------------------------------------------------------------------- */
/* JSON Resume                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * JSON Resume (https://jsonresume.org) rather than a bespoke format, because an ecosystem
 * of themes and renderers already consumes it. Exporting into a standard is the difference
 * between "here is a file" and "here is a résumé you can use".
 *
 * @param {import('../src/core/schema/types.js').Profile} profile
 * @param {import('../src/core/config/types.js').PortfolioConfig} config
 */
function jsonResume(profile, config) {
  const { identity } = profile
  const hideEmail = config.privacy?.hideEmail === true

  return prune({
    $schema: 'https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json',
    basics: prune({
      name: identity.name,
      label: identity.headline,
      image: absolute(identity.avatar, config),
      email: hideEmail ? undefined : identity.contact?.email,
      phone: identity.contact?.phone,
      url: config.site?.url || identity.contact?.website,
      summary: identity.summary,
      location: identity.location ? { address: identity.location } : undefined,
      profiles: Object.entries(profile.socials ?? {}).map(([network, url]) => ({
        network: titleCase(network),
        url,
        username: usernameFrom(url),
      })),
    }),

    work: (profile.experience ?? []).map((role) => prune({
      name: role.company,
      position: role.role,
      location: role.location,
      startDate: role.dates?.start?.iso,
      endDate: role.dates?.current ? undefined : role.dates?.end?.iso,
      summary: role.description,
      highlights: role.highlights,
      url: role.links?.[0]?.url,
    })),

    education: (profile.education ?? []).map((entry) => prune({
      institution: entry.institution,
      area: entry.field,
      studyType: entry.degree,
      startDate: entry.dates?.start?.iso,
      endDate: entry.dates?.current ? undefined : entry.dates?.end?.iso,
      score: entry.grade,
      courses: entry.courses,
    })),

    projects: (profile.projects ?? []).slice(0, 12).map((project) => prune({
      name: project.name,
      description: project.description,
      keywords: project.technologies,
      url: project.liveUrl || project.repository,
      startDate: project.date?.iso,
      roles: project.role ? [project.role] : undefined,
    })),

    skills: groupSkills(profile.skills ?? []).map((group) => prune({
      name: group.category,
      keywords: group.items.map((s) => s.name),
    })),

    awards: (profile.achievements ?? []).map((award) => prune({
      title: award.title,
      date: award.date?.iso,
      awarder: award.organization,
      summary: award.description,
    })),

    certificates: (profile.certifications ?? []).map((cert) => prune({
      name: cert.name,
      date: cert.date?.iso,
      issuer: cert.issuer,
      url: cert.credentialUrl,
    })),

    publications: (profile.publications ?? []).map((pub) => prune({
      name: pub.title,
      publisher: pub.venue,
      releaseDate: pub.date?.iso,
      url: pub.url,
      summary: pub.abstract,
    })),

    languages: (profile.languages ?? []).map((language) => prune({
      language: language.name,
      fluency: language.label,
    })),

    meta: {
      generator: 'portfolio-engine',
      lastModified: new Date().toISOString(),
    },
  })
}

/* -------------------------------------------------------------------------- */
/* Markdown résumé                                                             */
/* -------------------------------------------------------------------------- */

/** @param {import('../src/core/schema/types.js').Profile} profile */
function resumeMarkdown(profile) {
  const { identity } = profile
  const out = [`# ${identity.name}`]

  if (identity.headline) out.push(`**${identity.headline}**`)

  const contactLine = [
    identity.location,
    identity.contact?.email,
    identity.contact?.website,
    ...Object.values(profile.socials ?? {}).slice(0, 3),
  ].filter(Boolean).join(' · ')
  if (contactLine) out.push(contactLine)

  if (identity.summary) out.push('', '## Summary', '', identity.summary)

  if (profile.experience?.length) {
    out.push('', '## Experience')
    for (const role of profile.experience) {
      out.push('', `### ${role.role ?? 'Role'} — ${role.company}`)
      const meta = [formatRange(role.dates), role.location].filter(Boolean).join(' · ')
      if (meta) out.push(`*${meta}*`)
      if (role.description) out.push('', role.description)
      for (const highlight of role.highlights ?? []) out.push(`- ${highlight}`)
      if (role.technologies?.length) out.push('', `*${role.technologies.join(', ')}*`)
    }
  }

  if (profile.education?.length) {
    out.push('', '## Education')
    for (const entry of profile.education) {
      const degree = [entry.degree, entry.field].filter(Boolean).join(', ')
      out.push('', `### ${entry.institution}`)
      out.push([degree, formatRange(entry.dates), entry.grade].filter(Boolean).join(' · '))
    }
  }

  // A résumé shows the strongest work, not everything. Projects arrive pre-ranked by
  // `core/generate/scoring.js`, so the top of the list is already the right answer.
  const projects = (profile.projects ?? []).slice(0, 6)
  if (projects.length) {
    out.push('', '## Selected projects')
    for (const project of projects) {
      out.push('', `### ${project.name}`)
      if (project.description) out.push(project.description)
      const facts = [
        project.technologies?.length ? project.technologies.slice(0, 6).join(', ') : null,
        project.stars ? `${project.stars} stars` : null,
        project.repository,
      ].filter(Boolean)
      if (facts.length) out.push(`*${facts.join(' · ')}*`)
    }
  }

  const skillGroups = groupSkills(profile.skills ?? [])
  if (skillGroups.length) {
    out.push('', '## Skills')
    for (const group of skillGroups) {
      out.push(`- **${group.category}:** ${group.items.map((s) => s.name).join(', ')}`)
    }
  }

  if (profile.publications?.length) {
    out.push('', '## Publications')
    for (const pub of profile.publications) {
      const parts = [pub.venue, pub.date ? formatDate(pub.date) : null].filter(Boolean).join(', ')
      out.push(`- ${pub.url ? `[${pub.title}](${pub.url})` : pub.title}${parts ? ` — ${parts}` : ''}`)
    }
  }

  if (profile.achievements?.length) {
    out.push('', '## Achievements')
    for (const item of profile.achievements) {
      out.push(`- **${item.title}**${item.organization ? ` — ${item.organization}` : ''}${item.date ? ` (${formatDate(item.date)})` : ''}`)
    }
  }

  if (profile.certifications?.length) {
    out.push('', '## Certifications')
    for (const cert of profile.certifications) {
      const label = cert.credentialUrl ? `[${cert.name}](${cert.credentialUrl})` : cert.name
      out.push(`- ${label}${cert.issuer ? ` — ${cert.issuer}` : ''}${cert.date ? ` (${formatDate(cert.date)})` : ''}`)
    }
  }

  return `${out.join('\n')}\n`
}

/* -------------------------------------------------------------------------- */
/* GitHub profile README                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A GitHub profile README. Deliberately short: the convention is a card, not a CV, and the
 * portfolio link is the call to action.
 *
 * @param {import('../src/core/schema/types.js').Profile} profile
 * @param {import('../src/core/config/types.js').PortfolioConfig} config
 */
function profileReadme(profile, config) {
  const { identity } = profile
  const out = [`## Hi, I'm ${identity.name}`]

  if (identity.headline) out.push('', identity.headline)
  if (identity.summary) out.push('', truncate(identity.summary, 320))

  const stats = headlineStats(profile.stats?.entries ?? [], 4)
  if (stats.length) {
    out.push('', '| ' + stats.map((s) => s.label).join(' | ') + ' |')
    out.push('|' + stats.map(() => '---').join('|') + '|')
    out.push('| ' + stats.map((s) => `**${s.display}**`).join(' | ') + ' |')
  }

  const featured = (profile.projects ?? []).slice(0, 5)
  if (featured.length) {
    out.push('', '### What I am building', '')
    for (const project of featured) {
      const link = project.repository || project.liveUrl
      const name = link ? `[${project.name}](${link})` : project.name
      out.push(`- **${name}** — ${project.description ?? project.primaryLanguage ?? ''}`.trimEnd())
    }
  }

  const topSkills = (profile.skills ?? []).slice(0, 12).map((s) => s.name)
  if (topSkills.length) out.push('', `**Working with:** ${topSkills.join(' · ')}`)

  const links = Object.entries(profile.socials ?? {})
    .map(([network, url]) => `[${titleCase(network)}](${url})`)
  if (config.site?.url) links.unshift(`[Portfolio](${config.site.url})`)
  if (links.length) out.push('', links.join(' · '))

  out.push('', '<sub>Generated from my profiles with '
    + '[portfolio-engine](https://github.com/NITISH-R-G/Portfolio) — `npm run export`.</sub>')

  return `${out.join('\n')}\n`
}

/* -------------------------------------------------------------------------- */
/* Full Markdown                                                               */
/* -------------------------------------------------------------------------- */

/** @param {import('../src/core/schema/types.js').Profile} profile */
function fullMarkdown(profile) {
  const out = [`# ${profile.identity.name}`]
  if (profile.identity.headline) out.push(`> ${profile.identity.headline}`)
  if (profile.identity.summary) out.push('', profile.identity.summary)

  const sections = [
    ['Projects', profile.projects, (p) => `**${p.name}** — ${p.description ?? ''}${p.repository ? ` (${p.repository})` : ''}`],
    ['Experience', profile.experience, (e) => `**${e.role ?? ''} at ${e.company}** — ${formatRange(e.dates)}`],
    ['Education', profile.education, (e) => `**${e.institution}** — ${[e.degree, e.field].filter(Boolean).join(', ')}, ${formatRange(e.dates)}`],
    ['Publications', profile.publications, (p) => `**${p.title}** — ${p.venue ?? ''}${p.citations ? ` (${p.citations} citations)` : ''}`],
    ['Packages', profile.packages, (p) => `**${p.name}** (${p.registry})${p.downloads ? ` — ${p.downloads} downloads` : ''}`],
    ['Models & datasets', profile.models, (m) => `**${m.name}** (${m.kind})${m.downloads ? ` — ${m.downloads} downloads` : ''}`],
    ['Competitive programming', profile.competitive, (c) => `**${c.platform}** — ${[c.rank, c.rating ? `rating ${c.rating}` : null, c.problemsSolved ? `${c.problemsSolved} solved` : null].filter(Boolean).join(', ')}`],
    ['Writing', profile.posts, (p) => `[${p.title}](${p.url ?? ''})${p.date ? ` — ${formatDate(p.date)}` : ''}`],
    ['Hackathons', profile.hackathons, (h) => `**${h.name}**${h.result ? ` — ${h.result}` : ''}`],
    ['Talks', profile.talks, (t) => `**${t.title}**${t.event ? ` — ${t.event}` : ''}`],
    ['Achievements', profile.achievements, (a) => `**${a.title}**${a.organization ? ` — ${a.organization}` : ''}`],
    ['Certifications', profile.certifications, (c) => `**${c.name}**${c.issuer ? ` — ${c.issuer}` : ''}`],
  ]

  for (const [heading, records, render] of sections) {
    if (!records?.length) continue
    out.push('', `## ${heading}`, '')
    for (const record of records) out.push(`- ${render(record)}`.replace(/\s+—\s*$/, ''))
  }

  const groups = groupSkills(profile.skills ?? [])
  if (groups.length) {
    out.push('', '## Skills', '')
    for (const group of groups) {
      out.push(`**${group.category}** — ${group.items.map((s) => s.name).join(', ')}`)
      out.push('')
    }
  }

  return `${out.join('\n')}\n`
}

/* -------------------------------------------------------------------------- */
/* Bios                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The three bio lengths every form asks for. Derived from real data, so the numbers in
 * them are the same numbers on the site.
 *
 * @param {import('../src/core/schema/types.js').Profile} profile
 */
function bios(profile) {
  const { identity } = profile
  const stats = headlineStats(profile.stats?.entries ?? [], 3)
  const evidence = stats.map((s) => `${s.display} ${s.label.toLowerCase()}`).join(', ')
  const skills = (profile.skills ?? []).slice(0, 4).map((s) => s.name).join(', ')

  const oneLine = [identity.name, identity.headline].filter(Boolean).join(' — ')

  // The headline is left exactly as written. Lower-casing its first word to make the
  // sentence flow mangles the common case, where the headline is a title-cased role
  // ("Software Engineering Student") or starts with an acronym ("ML Engineer").
  const short = [
    identity.headline ? `${identity.name} is a ${identity.headline}` : identity.name,
    identity.location ? ` based in ${identity.location}` : '',
    skills ? `, working with ${skills}` : '',
    '.',
  ].join('')

  const long = [
    short,
    identity.summary ? `\n\n${identity.summary}` : '',
    evidence ? `\n\nBy the numbers: ${evidence}.` : '',
  ].join('')

  return [
    '# One line', '', oneLine, '',
    '# Short', '', short, '',
    '# Long', '', long, '',
    `# Generated ${new Date().toISOString().slice(0, 10)} — re-run \`npm run export\` to refresh.`,
    '',
  ].join('\n')
}

/* -------------------------------------------------------------------------- */

/** Recursively drop empty values so exported JSON has no null-filled scaffolding. */
function prune(value) {
  if (Array.isArray(value)) {
    const out = value.map(prune).filter((v) => v !== undefined)
    return out.length ? out : undefined
  }
  if (value && typeof value === 'object') {
    const out = {}
    for (const [key, raw] of Object.entries(value)) {
      const pruned = prune(raw)
      if (pruned !== undefined) out[key] = pruned
    }
    return Object.keys(out).length ? out : undefined
  }
  if (value === '' || value === null) return undefined
  return value
}

function absolute(asset, config) {
  if (!asset) return undefined
  if (/^https?:\/\//i.test(asset) || asset.startsWith('data:')) return asset
  const base = config.site?.url
  return base ? `${base.replace(/\/$/, '')}/${asset.replace(/^\//, '')}` : asset
}

/** Extract the trailing path segment of a profile URL, which is the handle on most platforms. */
function usernameFrom(url) {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean)
    const last = segments[segments.length - 1]
    return last ? last.replace(/^@/, '') : undefined
  } catch {
    return undefined
  }
}

const titleCase = (value) =>
  String(value).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b[a-z]/g, (c) => c.toUpperCase())


function truncate(text, max) {
  if (!text || text.length <= max) return text
  const cut = text.slice(0, max)
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(' '))
  return `${cut.slice(0, stop > max * 0.5 ? stop + 1 : max).trim()}…`
}

function size(file) {
  const bytes = fs.statSync(file).size
  return bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} kB` : `${bytes} B`
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    say()
    say(`Export failed: ${err.message}`)
    say(dim(err.stack?.split('\n').slice(1, 4).join('\n') ?? ''))
    process.exit(1)
  })

