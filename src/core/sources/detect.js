/**
 * "Paste anything."
 *
 * The single biggest thing standing between a fresh clone and a populated portfolio is that
 * every platform identifies people differently: GitHub wants a username, Stack Overflow a
 * numeric id, ORCID a hyphenated code, Semantic Scholar an author number, dblp a person id.
 * Asking a user to know which is which is asking them to do the system's job.
 *
 * So they paste a link. This turns it into a working connector configuration.
 *
 * It needs no network and no scraping — every one of these platforms puts the identifier in
 * the URL, which is public information the user just handed over. That is why this is worth
 * building before any extraction backend: it solves most of the onboarding problem with
 * none of the risk.
 *
 * @module core/sources/detect
 */

import { CONNECTORS, getConnector } from '../../connectors/index.js'

/**
 * How each platform's URL maps to its connector's config.
 *
 * Kept here rather than on each connector because it is a property of the *URL space*, not
 * of the integration: several of these patterns match platforms whose connector cannot
 * fetch at all, and a connector should not have to care how it was configured.
 *
 * Order matters — the first match wins, so more specific hosts come first.
 *
 * @type {{connector: string, pattern: RegExp, field: string, transform?: (m: RegExpExecArray) => Record<string, unknown>}[]}
 */
const PATTERNS = [
  { connector: 'github', pattern: /^(?:www\.)?github\.com\/([^/?#]+)\/?$/i, field: 'username' },
  { connector: 'gitlab', pattern: /^(?:www\.)?gitlab\.com\/([^/?#]+)\/?$/i, field: 'username' },
  { connector: 'bitbucket', pattern: /^(?:www\.)?bitbucket\.org\/([^/?#]+)\/?$/i, field: 'workspace' },
  { connector: 'dockerhub', pattern: /^(?:www\.)?hub\.docker\.com\/u\/([^/?#]+)/i, field: 'username' },

  { connector: 'npm', pattern: /^(?:www\.)?npmjs\.com\/~([^/?#]+)/i, field: 'username' },
  { connector: 'pypi', pattern: /^pypi\.org\/user\/([^/?#]+)/i, field: 'username' },
  {
    connector: 'pypi',
    pattern: /^pypi\.org\/project\/([^/?#]+)/i,
    field: 'packages',
    // A project URL names a package, not a person, so it configures the list rather than
    // the profile — and the caller merges it with anything already there.
    transform: (m) => ({ packages: [m[1]] }),
  },

  { connector: 'huggingface', pattern: /^(?:www\.)?huggingface\.co\/([^/?#]+)\/?$/i, field: 'username' },
  { connector: 'kaggle', pattern: /^(?:www\.)?kaggle\.com\/([^/?#]+)\/?$/i, field: 'username' },

  { connector: 'leetcode', pattern: /^(?:www\.)?leetcode\.com\/(?:u\/)?([^/?#]+)/i, field: 'username' },
  { connector: 'codeforces', pattern: /^(?:www\.)?codeforces\.com\/profile\/([^/?#]+)/i, field: 'handle' },
  { connector: 'codechef', pattern: /^(?:www\.)?codechef\.com\/users\/([^/?#]+)/i, field: 'username' },
  { connector: 'hackerrank', pattern: /^(?:www\.)?hackerrank\.com\/(?:profile\/)?([^/?#]+)/i, field: 'username' },
  { connector: 'hackerearth', pattern: /^(?:www\.)?hackerearth\.com\/@?([^/?#]+)/i, field: 'username' },

  { connector: 'stackoverflow', pattern: /^(?:www\.)?stackoverflow\.com\/users\/(\d+)/i, field: 'userId' },

  { connector: 'orcid', pattern: /^orcid\.org\/(\d{4}-\d{4}-\d{4}-\d{3}[\dX])/i, field: 'id' },
  { connector: 'semanticScholar', pattern: /^(?:www\.)?semanticscholar\.org\/author\/(?:[^/]*\/)?(\d+)/i, field: 'authorId' },
  { connector: 'dblp', pattern: /^dblp\.org\/pid\/(.+?)(?:\.html)?$/i, field: 'pid' },
  { connector: 'googleScholar', pattern: /^scholar\.google\.[a-z.]+\/citations\?(?:.*&)?user=([^&#]+)/i, field: 'id' },
  { connector: 'researchgate', pattern: /^(?:www\.)?researchgate\.net\/profile\/([^/?#]+)/i, field: 'username' },

  { connector: 'medium', pattern: /^(?:www\.)?medium\.com\/@([^/?#]+)/i, field: 'username' },
  { connector: 'medium', pattern: /^([^.]+)\.medium\.com\/?$/i, field: 'username' },
  { connector: 'substack', pattern: /^([^.]+)\.substack\.com/i, field: 'publication' },
  { connector: 'hashnode', pattern: /^(?:www\.)?hashnode\.com\/@([^/?#]+)/i, field: 'username' },
  { connector: 'devto', pattern: /^(?:www\.)?dev\.to\/([^/?#]+)\/?$/i, field: 'username' },

  { connector: 'youtube', pattern: /^(?:www\.)?youtube\.com\/channel\/([^/?#]+)/i, field: 'channelId' },

  { connector: 'devpost', pattern: /^(?:www\.)?devpost\.com\/([^/?#]+)/i, field: 'username' },
  { connector: 'linkedin', pattern: /^(?:[a-z]{2,3}\.)?(?:www\.)?linkedin\.com\/in\/([^/?#]+)/i, field: 'username' },
  { connector: 'x', pattern: /^(?:www\.)?(?:x|twitter)\.com\/([^/?#]+)/i, field: 'username' },
]

/**
 * Hosts we can recognise but cannot configure from a URL alone, with the reason.
 *
 * Saying "that is a YouTube video, I need the channel" is far more useful than "unknown
 * link", and it is the difference between the user fixing it and giving up.
 */
const NEAR_MISSES = [
  {
    pattern: /^(?:www\.)?youtube\.com\/(watch|@)/i,
    connector: 'youtube',
    message: 'That is a video or handle URL. YouTube\'s API needs the channel id, which starts with "UC".',
    hint: 'Find it on your channel under Settings → Advanced settings.',
  },
  {
    pattern: /^(?:www\.)?stackoverflow\.com\/(questions|a)\//i,
    connector: 'stackoverflow',
    message: 'That is a question or answer. Stack Overflow identifies people by a numeric id.',
    hint: 'Open your profile — the number in that URL is what this needs.',
  },
  {
    pattern: /^(?:www\.)?linkedin\.com\/(company|school|posts)\//i,
    connector: 'linkedin',
    message: 'That is a company, school or post page rather than a personal profile.',
    hint: 'Use your own linkedin.com/in/… URL.',
  },
  {
    pattern: /^(?:www\.)?github\.com\/[^/]+\/[^/]+/i,
    connector: 'github',
    message: 'That is a single repository. Connecting your GitHub account imports all of them.',
    hint: 'Use just github.com/your-username.',
  },
  {
    pattern: /^scholar\.google\./i,
    connector: 'googleScholar',
    message: 'That Google Scholar URL has no user id in it.',
    hint: 'Open your Scholar profile; the URL will contain "user=".',
  },
]

/**
 * @typedef {object} Detection
 * @property {'matched'|'near-miss'|'website'|'unknown'} outcome
 * @property {string} [connector]      Connector id to configure.
 * @property {Record<string, unknown>} [config]
 * @property {string} [account]        The identifier that was recognised.
 * @property {string} [message]        Why it did not resolve, when it did not.
 * @property {string} [hint]
 */

/**
 * Identify a pasted URL.
 *
 * @param {string} input
 * @returns {Detection}
 */
export function detectSource(input) {
  const trimmed = String(input ?? '').trim()
  if (!trimmed) return { outcome: 'unknown', message: 'Nothing was pasted.' }

  // A bare handle is not a URL, and guessing which platform it belongs to would be a coin
  // flip. Saying so is better than picking one.
  if (!/[./]/.test(trimmed)) {
    return {
      outcome: 'unknown',
      message: `"${trimmed}" could be a username on any platform.`,
      hint: 'Paste the full profile URL, or pick the platform first.',
    }
  }

  let url
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return { outcome: 'unknown', message: 'That is not a URL this can read.' }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { outcome: 'unknown', message: 'Only http and https links can be used as sources.' }
  }

  // Matched against host + path + query, so patterns can key on any part.
  const target = `${url.host}${url.pathname}${url.search}`.replace(/\/+$/, '')

  for (const entry of PATTERNS) {
    const match = entry.pattern.exec(target)
    if (!match) continue

    const connector = getConnector(entry.connector)
    if (!connector) continue

    const value = decodeURIComponent(match[1])
    const config = entry.transform
      ? entry.transform(match)
      : { [entry.field]: value }

    // The connector is the authority on whether its own config is usable, so the detection
    // is confirmed against it rather than trusted. A pattern that matches but produces an
    // unusable config is a bug worth surfacing as "not recognised".
    if (!connector.identify?.(config)) continue

    return {
      outcome: 'matched',
      connector: connector.id,
      config,
      account: connector.identify(config),
    }
  }

  for (const miss of NEAR_MISSES) {
    if (miss.pattern.test(target)) {
      return { outcome: 'near-miss', connector: miss.connector, message: miss.message, hint: miss.hint }
    }
  }

  // Anything else with a feed is a personal site, which is a genuine source rather than a
  // failure — most static-site generators publish one.
  return {
    outcome: 'website',
    connector: 'website',
    config: { url: url.origin },
    account: url.hostname.replace(/^www\./, ''),
    message: `Not a platform this recognises. It will be treated as a personal website and read for a feed.`,
  }
}

/**
 * Work out what someone just gave you.
 *
 * The onboarding input accepts anything — a profile link, a résumé pasted as text, a JSON
 * Resume, a Markdown CV, several links at once — because making the user pick a category
 * first is making them do the system's job. This decides which path it takes.
 *
 * Classification is by *content*, never by what the user said it was: a JSON Resume pasted
 * into a box labelled "profile URL" is still a JSON Resume.
 *
 * @param {string} input
 * @returns {{
 *   kind: 'empty'|'urls'|'json'|'markdown'|'text',
 *   detections?: Detection[],
 *   sources?: Record<string, Record<string, unknown>>,
 *   filename?: string,
 *   label: string,
 * }}
 */
export function classifyInput(input) {
  const text = String(input ?? '').trim()
  if (!text) return { kind: 'empty', label: 'Nothing yet' }

  // Structured data is unambiguous and worth checking before anything else — a JSON
  // document can contain URLs, and reading it as a list of links would be nonsense.
  if (/^[[{]/.test(text)) {
    try {
      const parsed = JSON.parse(text)
      const isResume = parsed?.basics || parsed?.schemaVersion
        || ['experience', 'work', 'education', 'projects'].some((k) => Array.isArray(parsed?.[k]))
      return {
        kind: 'json',
        filename: parsed?.schemaVersion ? 'portfolio.json' : 'resume.json',
        label: isResume ? 'A structured profile' : 'JSON — will be read as a profile if it fits the schema',
      }
    } catch {
      // Falls through: it looked like JSON and is not, so it is text.
    }
  }

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const looksLikeLinks = lines.length > 0 && lines.every((line) => /^(https?:\/\/|[\w-]+\.[\w.-]+\/)/i.test(line))

  if (looksLikeLinks) {
    const { sources, detections } = detectAll(text)
    const matched = detections.filter((d) => d.outcome === 'matched' || d.outcome === 'website')
    return {
      kind: 'urls',
      detections,
      sources,
      label: matched.length === detections.length && matched.length === 1
        ? `A ${labelFor(detections[0])} profile`
        : `${matched.length} of ${detections.length} links recognised`,
    }
  }

  // Multi-line prose. Markdown headings are the strongest signal that it is a document
  // rather than something to look up.
  if (/^#{1,6}\s|\n#{1,6}\s|^\s*[-*]\s/m.test(text)) {
    return { kind: 'markdown', filename: 'resume.md', label: 'A Markdown résumé' }
  }

  if (lines.length > 3) {
    return { kind: 'text', filename: 'resume.txt', label: 'A résumé, as plain text' }
  }

  // One or two lines that are not links and not a document: most likely a mistyped URL.
  return { kind: 'urls', detections: [detectSource(text)], sources: {}, label: 'Not recognised' }
}

/** @param {Detection} detection */
function labelFor(detection) {
  if (detection.outcome === 'website') return 'personal website'
  const connector = CONNECTORS.find((c) => c.id === detection.connector)
  return connector?.name ?? detection.connector ?? 'unknown'
}

/**
 * Detect several pasted links at once, merging configs for the same connector.
 *
 * Merging matters for the list-shaped ones: pasting three PyPI project URLs should
 * configure three packages, not overwrite twice.
 *
 * @param {string} input  Newline-, comma- or space-separated.
 * @returns {{sources: Record<string, Record<string, unknown>>, detections: Detection[]}}
 */
export function detectAll(input) {
  const parts = String(input ?? '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)

  /** @type {Record<string, Record<string, unknown>>} */
  const sources = {}
  /** @type {Detection[]} */
  const detections = []

  for (const part of parts) {
    const detection = detectSource(part)
    detections.push(detection)
    if (detection.outcome !== 'matched' && detection.outcome !== 'website') continue

    const existing = sources[detection.connector]
    sources[detection.connector] = existing
      ? mergeConfig(existing, detection.config)
      : { ...detection.config }
  }

  return { sources, detections }
}

/** @param {Record<string, unknown>} a @param {Record<string, unknown>} b */
function mergeConfig(a, b) {
  const out = { ...a }
  for (const [key, value] of Object.entries(b ?? {})) {
    const existing = out[key]
    out[key] = Array.isArray(existing) && Array.isArray(value)
      ? [...new Set([...existing, ...value])]
      : value
  }
  return out
}

/**
 * Every platform that can be recognised from a URL, for the onboarding list.
 *
 * @returns {{connector: string, name: string, example: string}[]}
 */
export function recognisedPlatforms() {
  const examples = {
    github: 'https://github.com/octocat',
    linkedin: 'https://linkedin.com/in/your-name',
    googleScholar: 'https://scholar.google.com/citations?user=…',
    leetcode: 'https://leetcode.com/u/your-name',
    devpost: 'https://devpost.com/your-name',
    kaggle: 'https://kaggle.com/your-name',
    x: 'https://x.com/your-name',
    medium: 'https://medium.com/@your-name',
    stackoverflow: 'https://stackoverflow.com/users/22656',
    orcid: 'https://orcid.org/0000-0002-1825-0097',
  }

  const seen = new Set()
  const out = []
  for (const entry of PATTERNS) {
    if (seen.has(entry.connector)) continue
    seen.add(entry.connector)
    const connector = CONNECTORS.find((c) => c.id === entry.connector)
    if (!connector) continue
    out.push({
      connector: connector.id,
      name: connector.name,
      example: examples[connector.id] ?? `https://${connector.homepage.replace(/^https?:\/\//, '')}/…`,
    })
  }
  return out
}
