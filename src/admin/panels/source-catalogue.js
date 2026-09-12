/**
 * The pieces Connect and Sources share.
 *
 * Both screens answer questions about the same 29 connectors — what is this, what can it
 * actually do, what would connecting it get me, is it working — so the logic that answers them
 * lives here once rather than twice. The two panels differ in what they are *for*, not in what
 * a source is.
 *
 * Everything here is derived from the connector registry and `core/sources/*`. Nothing restates
 * platform knowledge: a new connector appears in the browser, the search index, the category
 * nav and the action selector with no edit to this file, which is the property that stops a
 * fiftieth integration from being a fiftieth place to forget something.
 *
 * Deliberately free of JSX so the engine's own test runner can load it directly: these are the
 * claims worth testing hardest — which categories exist, what a search finds, and above all what
 * action a platform is allowed to offer — and none of them needs a renderer to decide.
 *
 * @module admin/panels/source-catalogue
 */

import { connectorGroups } from '../../connectors/index.js'
import { methodInfo } from '../../core/sources/methods.js'

/**
 * The categories that actually have connectors, in display order.
 *
 * Taken from `connectorGroups()`, which filters out empty ones already. Deliberately not a
 * hand-written list of the categories we wish existed: an empty "Design" tab is a promise the
 * engine cannot keep, and when a Behance connector is added its category appears here on its
 * own.
 */
export function categories() {
  return connectorGroups().map(({ category, label, connectors }) => ({
    id: category,
    label,
    count: connectors.length,
  }))
}

/**
 * What a connector can be searched by.
 *
 * More than the name, because someone looking for "rss" or "publications" does not know which
 * platform they want — that is the question they are asking. Matching the method and the data
 * it populates turns the browser into something you can interrogate rather than only scan.
 *
 * @param {import('../../core/sources/capabilities.js').Capabilities} capability
 * @returns {string}
 */
export function searchTextFor(capability) {
  return [
    capability.name,
    capability.id,
    capability.category,
    capability.summary,
    capability.limits,
    // The method as a person would say it, not as the ladder spells it.
    METHOD_WORDS[capability.bestMethod] ?? '',
    ...capability.data,
    ...(ALIASES[capability.id] ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

/**
 * Names people type that are not the connector's own.
 *
 * Only where the gap is real: a former name, a spelling, or the thing the platform is actually
 * known for. Not a keyword-stuffing list — every entry here is a search that would otherwise
 * return nothing.
 */
const ALIASES = {
  x: ['twitter', 'tweet'],
  githubb: [],
  stackoverflow: ['stack exchange', 'stackexchange'],
  semanticScholar: ['s2', 'semantic scholar'],
  googleScholar: ['citations', 'h-index', 'scholar'],
  dblp: ['computer science bibliography'],
  huggingface: ['hf', 'transformers', 'models'],
  devto: ['dev.to', 'dev community'],
  npm: ['node', 'javascript packages'],
  pypi: ['python packages', 'pip'],
  dockerhub: ['docker', 'containers', 'images'],
  orcid: ['researcher id', 'publications'],
  leetcode: ['dsa', 'problems'],
  codeforces: ['competitive'],
  devpost: ['hackathons'],
  website: ['rss', 'atom', 'blog', 'feed'],
  substack: ['newsletter'],
  bitbucket: ['atlassian'],

  // Added with the Phase 7 connectors. Each is a search someone would plausibly type and that
  // would otherwise return nothing — the software a host runs, a format's common name, the
  // thing a platform is actually for.
  codeberg: ['forgejo', 'gitea', 'git hosting'],
  sourcehut: ['sr.ht', 'srht', 'git hosting'],
  cratesio: ['crates', 'rust', 'cargo'],
  atcoder: ['competitive', 'contests'],
  openalex: ['citations', 'papers', 'scholarly'],
  crossref: ['doi', 'papers'],
  arxiv: ['preprint', 'preprints', 'papers'],
  bluesky: ['bsky', 'atproto', 'microblog'],
  mastodon: ['fediverse', 'activitypub', 'microblog', 'toots'],
  codepen: ['pens', 'frontend demos'],
  behance: ['portfolio', 'creative'],
  dribbble: ['shots', 'ui design'],
}

/** How each rung of the ladder reads as a search term. */
const METHOD_WORDS = {
  api: 'api automatic',
  endpoint: 'rss feed atom json automatic',
  'profile-url': 'profile url link manual',
  upload: 'file upload import',
  manual: 'manual entered by you',
  oauth: 'oauth',
  extraction: 'extraction',
}

/**
 * Filter the catalogue.
 *
 * @param {import('../../core/sources/capabilities.js').Capabilities[]} capabilities
 * @param {{query?: string, category?: string}} filters
 */
export function filterConnectors(capabilities, { query = '', category = '' } = {}) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)

  return capabilities.filter((capability) => {
    if (category && capability.category !== category) return false
    if (!terms.length) return true
    const haystack = searchTextFor(capability)
    // Every term must match, so a second word narrows rather than widens — which is what
    // someone typing "research api" is asking for.
    return terms.every((term) => haystack.includes(term))
  })
}

/**
 * The one action a connector actually offers, in the user's words.
 *
 * This is the honesty mechanism, and it is derived rather than declared: `bestMethod` is the
 * highest rung of the connection ladder this project can really climb for that platform, so a
 * connector with no readable interface cannot produce a "Connect" button no matter what anyone
 * types here. LinkedIn and Google Scholar offer a profile URL because that is all they permit;
 * Kaggle asks for a credential because its API returns nothing without one; Medium says "feed"
 * because that is what it is.
 *
 * @param {import('../../core/sources/capabilities.js').Capabilities} capability
 * @param {boolean} connected
 * @returns {{kind: string, label: string, hint: string, needs: 'value'|'credential'|'none'}}
 */
export function actionFor(capability, connected) {
  if (connected) {
    return { kind: 'connected', label: 'Connected', hint: 'Importing on every run.', needs: 'none' }
  }

  switch (capability.bestMethod) {
    case 'api':
      return capability.authentication === 'required'
        ? {
            kind: 'credential',
            label: 'Add credential',
            hint: `Needs ${capability.authEnv.join(' and ')} in .env — this platform returns nothing without one.`,
            needs: 'credential',
          }
        : { kind: 'connect', label: 'Connect', hint: 'Imports automatically from a public API.', needs: 'value' }

    case 'endpoint':
      return { kind: 'feed', label: 'Add feed', hint: 'Imports automatically from a public RSS or JSON feed.', needs: 'value' }

    case 'profile-url':
      return {
        kind: 'url',
        label: 'Add profile URL',
        hint: 'This platform publishes nothing that can be read, so the link is verified and shown — nothing is imported.',
        needs: 'value',
      }

    case 'upload':
      return { kind: 'upload', label: 'Import a file', hint: 'Import an export from the platform.', needs: 'value' }

    default:
      return { kind: 'manual', label: 'Enter details', hint: 'You supply the figures; they are attributed and linked.', needs: 'value' }
  }
}

/** The label for the rung, for the mono metadata line. */
export function methodLabel(capability) {
  return methodInfo(capability.bestMethod)?.label ?? 'Entered by you'
}
