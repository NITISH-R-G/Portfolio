/**
 * SEO metadata generation.
 *
 * Everything here is derived from the profile and config. There is no hardcoded name,
 * institution or URL anywhere in the output — cloning the repository and changing one
 * config field changes every meta tag, the canonical URL, the structured data and the
 * sitemap.
 *
 * @module core/generate/seo
 */

import { absoluteBaseUrl } from '../config/resolve.js'
import { formatDate } from '../schema/date.js'

/** @typedef {import('../schema/types.js').Profile} Profile */

/**
 * @typedef {object} MetaTag
 * @property {string} [name]
 * @property {string} [property]
 * @property {string} content
 */

/**
 * @typedef {object} SeoResult
 * @property {string} title
 * @property {string} description
 * @property {string} canonical
 * @property {MetaTag[]} meta
 * @property {object[]} structuredData
 * @property {string} html      Ready-to-inject `<head>` fragment.
 */

/** Meta descriptions are truncated by search engines beyond roughly this length. */
const DESCRIPTION_LIMIT = 160

/**
 * Escape a value for safe interpolation into HTML attributes and text.
 *
 * The profile contains imported, untrusted strings — a repository description is written by
 * whoever owns the repository. Injecting one unescaped into `<meta content="...">` would let
 * it close the attribute and inject markup.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Build a description from the profile when the user has not written one.
 *
 * Prefers the user's own summary. Falls back to a factual sentence assembled from data that
 * exists — never an invented claim about the person.
 *
 * @param {Profile} profile
 * @returns {string}
 */
export function deriveDescription(profile) {
  const summary = profile.identity?.summary
  if (summary) return truncate(summary, DESCRIPTION_LIMIT)

  const name = profile.identity?.name || 'This developer'
  const headline = profile.identity?.headline
  const parts = []

  if (headline) parts.push(`${name} — ${headline}.`)
  else parts.push(`Portfolio of ${name}.`)

  /** @type {string[]} */
  const facts = []
  const projects = profile.projects?.length ?? 0
  if (projects) facts.push(`${projects} project${projects === 1 ? '' : 's'}`)
  const publications = profile.publications?.length ?? 0
  if (publications) facts.push(`${publications} publication${publications === 1 ? '' : 's'}`)
  const packages = profile.packages?.length ?? 0
  if (packages) facts.push(`${packages} published package${packages === 1 ? '' : 's'}`)

  const topSkills = (profile.skills ?? []).slice(0, 4).map((s) => s.name)
  if (topSkills.length) facts.push(topSkills.join(', '))

  if (facts.length) parts.push(facts.join(' · '))
  return truncate(parts.join(' '), DESCRIPTION_LIMIT)
}

/** @param {string} text @param {number} limit */
function truncate(text, limit) {
  const clean = String(text).replace(/\s+/g, ' ').trim()
  if (clean.length <= limit) return clean
  const cut = clean.slice(0, limit - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/**
 * Generate all SEO metadata.
 *
 * @param {Profile} profile
 * @param {import('../config/types.js').PortfolioConfig} config  A resolved config.
 * @returns {SeoResult}
 */
export function generateSeo(profile, config) {
  const site = config?.site ?? {}
  const seoConfig = config?.seo ?? {}
  const baseUrl = absoluteBaseUrl(site.url ?? '', site.base ?? '/')

  const name = profile.identity?.name || site.title || 'Portfolio'
  const headline = profile.identity?.headline || ''
  const title = site.title || [name, headline].filter(Boolean).join(' — ')
  const description = site.description || deriveDescription(profile)

  const canonical = baseUrl || ''
  const ogImage = site.ogImage
    ? absoluteAsset(site.ogImage, baseUrl, site.base ?? '/')
    : (profile.identity?.avatar ? absoluteAsset(profile.identity.avatar, baseUrl, site.base ?? '/') : '')

  /** @type {MetaTag[]} */
  const meta = [
    { name: 'description', content: description },
    { name: 'color-scheme', content: config?.theme?.colorScheme || 'dark light' },

    { property: 'og:type', content: 'profile' },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:site_name', content: name },
  ]

  if (canonical) meta.push({ property: 'og:url', content: canonical })
  if (ogImage) {
    meta.push({ property: 'og:image', content: ogImage })
    meta.push({ property: 'og:image:alt', content: `${name}${headline ? ` — ${headline}` : ''}` })
  }

  meta.push({ name: 'twitter:card', content: ogImage ? 'summary_large_image' : 'summary' })
  meta.push({ name: 'twitter:title', content: title })
  meta.push({ name: 'twitter:description', content: description })
  if (ogImage) meta.push({ name: 'twitter:image', content: ogImage })
  if (seoConfig.twitterHandle) {
    const handle = String(seoConfig.twitterHandle).replace(/^@?/, '@')
    meta.push({ name: 'twitter:creator', content: handle })
    meta.push({ name: 'twitter:site', content: handle })
  }

  const keywords = deriveKeywords(profile, seoConfig.keywords ?? [])
  if (keywords.length) meta.push({ name: 'keywords', content: keywords.join(', ') })

  const structuredData = seoConfig.structuredData === false
    ? []
    : buildStructuredData(profile, { name, headline, description, canonical, ogImage })

  return {
    title,
    description,
    canonical,
    meta,
    structuredData,
    html: renderHead({ title, canonical, meta, structuredData, language: site.language ?? 'en' }),
  }
}

/**
 * Resolve an asset reference to an absolute URL when the site URL is known, leaving it
 * relative otherwise (so a site with no configured URL still works locally).
 *
 * @param {string} asset
 * @param {string} baseUrl
 * @param {string} base
 * @returns {string}
 */
function absoluteAsset(asset, baseUrl, base) {
  if (!asset) return ''
  if (/^https?:\/\//i.test(asset) || asset.startsWith('data:')) return asset
  if (!baseUrl) return asset
  const path = asset.replace(/^\//, '').replace(new RegExp(`^${escapeRegExp(base.replace(/^\/|\/$/g, ''))}/`), '')
  return `${baseUrl.replace(/\/$/, '')}/${path}`
}

/** @param {string} s */
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Keywords from real content: top skills, project languages, research venues.
 *
 * @param {Profile} profile
 * @param {string[]} extra
 * @returns {string[]}
 */
export function deriveKeywords(profile, extra = []) {
  const set = new Set(extra.map((k) => String(k).trim()).filter(Boolean))
  for (const skill of (profile.skills ?? []).slice(0, 12)) set.add(skill.name)
  for (const project of (profile.projects ?? []).slice(0, 6)) {
    if (project.primaryLanguage) set.add(project.primaryLanguage)
  }
  if (profile.identity?.headline) set.add(profile.identity.headline)
  return [...set].slice(0, 20)
}

/**
 * Build JSON-LD. Emits `Person`, `ProfilePage` and `WebSite`, plus `ScholarlyArticle` nodes
 * when the profile actually contains publications.
 *
 * @param {Profile} profile
 * @param {{name: string, headline: string, description: string, canonical: string, ogImage: string}} ctx
 * @returns {object[]}
 */
export function buildStructuredData(profile, ctx) {
  if (!profile.identity?.name) return []

  /** @type {Record<string, unknown>} */
  const person = {
    '@type': 'Person',
    name: ctx.name,
    description: ctx.description,
  }
  if (ctx.canonical) person.url = ctx.canonical
  if (ctx.ogImage) person.image = ctx.ogImage
  if (ctx.headline) person.jobTitle = ctx.headline
  if (profile.identity.location) {
    person.address = { '@type': 'PostalAddress', addressLocality: profile.identity.location }
  }
  if (profile.identity.contact?.email) person.email = `mailto:${profile.identity.contact.email}`

  const sameAs = Object.values(profile.socials ?? {}).filter((u) => /^https?:\/\//.test(u))
  if (sameAs.length) person.sameAs = sameAs

  // Only claim an affiliation the data actually supports: a current (or most recent)
  // education or employment record.
  const currentEducation = (profile.education ?? []).find((e) => e.dates?.current)
  const currentRole = (profile.experience ?? []).find((e) => e.dates?.current)
  const affiliations = []
  if (currentEducation) affiliations.push({ '@type': 'EducationalOrganization', name: currentEducation.institution })
  if (currentRole) affiliations.push({ '@type': 'Organization', name: currentRole.company })
  if (affiliations.length) person.affiliation = affiliations.length === 1 ? affiliations[0] : affiliations

  const knows = (profile.skills ?? []).slice(0, 15).map((s) => s.name)
  if (knows.length) person.knowsAbout = knows

  /** @type {object[]} */
  const graph = [
    { '@context': 'https://schema.org', ...person },
  ]

  if (ctx.canonical) {
    graph.push({
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      name: ctx.name,
      url: ctx.canonical,
      mainEntity: { '@type': 'Person', name: ctx.name, ...(ctx.canonical ? { url: ctx.canonical } : {}) },
    })
    graph.push({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: ctx.name,
      url: ctx.canonical,
    })
  }

  for (const publication of (profile.publications ?? []).slice(0, 20)) {
    /** @type {Record<string, unknown>} */
    const article = {
      '@context': 'https://schema.org',
      '@type': 'ScholarlyArticle',
      headline: publication.title,
    }
    if (publication.authors?.length) {
      article.author = publication.authors.map((a) => ({ '@type': 'Person', name: a }))
    }
    if (publication.date) article.datePublished = publication.date.iso
    if (publication.venue) article.publisher = { '@type': 'Organization', name: publication.venue }
    if (publication.url) article.url = publication.url
    if (publication.doi) article.identifier = publication.doi
    graph.push(article)
  }

  return graph
}

/**
 * Render the `<head>` fragment. Every interpolated value is escaped, and JSON-LD is
 * additionally guarded against a `</script>` sequence inside string content.
 *
 * @param {{title: string, canonical: string, meta: MetaTag[], structuredData: object[], language: string}} input
 * @returns {string}
 */
export function renderHead({ title, canonical, meta, structuredData }) {
  const lines = [`<title>${escapeHtml(title)}</title>`]

  for (const tag of meta) {
    if (!tag.content) continue
    const key = tag.property ? `property="${escapeHtml(tag.property)}"` : `name="${escapeHtml(tag.name ?? '')}"`
    lines.push(`<meta ${key} content="${escapeHtml(tag.content)}">`)
  }

  if (canonical) lines.push(`<link rel="canonical" href="${escapeHtml(canonical)}">`)

  for (const node of structuredData) {
    lines.push(
      `<script type="application/ld+json">${JSON.stringify(node).replace(/</g, '\\u003c')}</script>`,
    )
  }

  return lines.join('\n')
}

/**
 * Generate `sitemap.xml`. A portfolio is one page, so the sitemap is small — but emitting a
 * correct one with a real `lastmod` is still better than shipping a stale hand-written file.
 *
 * @param {import('../config/types.js').PortfolioConfig} config
 * @param {{lastModified?: string}} [options]
 * @returns {string}
 */
export function generateSitemap(config, options = {}) {
  const baseUrl = absoluteBaseUrl(config?.site?.url ?? '', config?.site?.base ?? '/')
  if (!baseUrl) return ''
  const lastmod = (options.lastModified ?? new Date().toISOString()).slice(0, 10)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <url>',
    `    <loc>${escapeHtml(baseUrl)}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    '    <changefreq>weekly</changefreq>',
    '    <priority>1.0</priority>',
    '  </url>',
    '</urlset>',
    '',
  ].join('\n')
}

/**
 * Generate `robots.txt`. Always disallows the local builder, which must never be indexed.
 *
 * @param {import('../config/types.js').PortfolioConfig} config
 * @returns {string}
 */
export function generateRobots(config) {
  const baseUrl = absoluteBaseUrl(config?.site?.url ?? '', config?.site?.base ?? '/')
  const lines = ['User-agent: *', 'Allow: /', 'Disallow: /admin.html', '']
  if (baseUrl) lines.push(`Sitemap: ${baseUrl.replace(/\/$/, '')}/sitemap.xml`, '')
  return lines.join('\n')
}

export { formatDate }
