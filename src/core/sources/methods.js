/**
 * How a source is connected.
 *
 * The user should never have to know whether GitHub is an API and LinkedIn is a file
 * upload. They say "here is my LinkedIn"; the system works out what that means. This module
 * is where that working-out lives.
 *
 * The ladder, strongest first:
 *
 *     official API  ›  OAuth  ›  public endpoint  ›  profile URL
 *                                     ›  extraction  ›  upload  ›  manual
 *
 * A source resolves to the best rung it can actually reach with what the user has given.
 * The rungs below `profile-url` are fallbacks, and the ordering encodes why: a documented
 * API is stable and permitted, while extraction is a reconstruction that can silently
 * degrade. Making extraction a *rung* rather than the foundation is what keeps this project
 * from being coupled to any scraping vendor — a future backend registers itself as one
 * implementation of one rung, and nothing above it changes.
 *
 * @module core/sources/methods
 */

/**
 * @typedef {'api'|'oauth'|'endpoint'|'profile-url'|'extraction'|'upload'|'manual'} ConnectionMethod
 */

/**
 * Every method, strongest first, with what it means for the user.
 *
 * `available` says whether this project can actually do it today. `extraction` and `oauth`
 * are declared but not implemented: they are named so the ladder is complete and so the UI
 * can say "not yet" rather than pretending the rung does not exist.
 */
export const METHODS = [
  {
    id: 'api',
    label: 'Connected',
    summary: 'Reads a documented public API. Nothing to set up.',
    available: true,
    rank: 7,
  },
  {
    id: 'oauth',
    label: 'Connected',
    summary: 'You authorise access once, and the platform hands over your own data.',
    // Deliberately not built. OAuth needs a registered application and a redirect endpoint,
    // which means a hosted service — the one thing this project is designed not to require.
    // It stays on the ladder because a self-hosted deployment could legitimately add it.
    available: false,
    unavailableReason: 'OAuth needs a registered app and a callback server, which a static site has nowhere to put.',
    rank: 6,
  },
  {
    id: 'endpoint',
    label: 'Connected',
    summary: 'Reads a public structured feed, such as RSS or JSON.',
    available: true,
    rank: 5,
  },
  {
    id: 'profile-url',
    label: 'Linked',
    summary: 'Your profile is linked and verified, but its numbers are not readable.',
    available: true,
    rank: 4,
  },
  {
    id: 'extraction',
    label: 'Extracted',
    summary: 'Content is read from the public page.',
    available: false,
    unavailableReason: 'No extraction backend is configured. Several platforms also forbid it in their terms.',
    rank: 3,
  },
  {
    id: 'upload',
    label: 'Imported',
    summary: 'You supply a file the platform exports, and it is read properly.',
    available: true,
    rank: 2,
  },
  {
    id: 'manual',
    label: 'Entered by you',
    summary: 'You type the figures. They are attributed to the platform and linked to your profile.',
    available: true,
    rank: 1,
  },
]

/** @type {Map<ConnectionMethod, typeof METHODS[number]>} */
const BY_ID = new Map(METHODS.map((m) => [m.id, m]))

/** @param {ConnectionMethod} id */
export const methodInfo = (id) => BY_ID.get(id)

/**
 * The methods a connector could use, best first.
 *
 * Derived from what the connector already declares rather than requiring every connector to
 * restate it: `availability` says what the platform permits, and that determines the rungs
 * it can reach.
 *
 * @param {import('../../connectors/types.js').Connector} connector
 * @returns {ConnectionMethod[]}
 */
export function methodsFor(connector) {
  switch (connector.availability) {
    // A documented API, plus the upload and manual fallbacks that exist for everything.
    case 'api': return ['api', 'upload', 'manual']
    case 'feed': return ['endpoint', 'upload', 'manual']
    // The API exists and is official; it just needs the user's own credential.
    case 'token': return ['api', 'upload', 'manual']
    // No usable interface. Extraction is listed so the UI can show it as the rung that
    // would help if it existed, rather than leaving a silent gap.
    case 'manual': return ['profile-url', 'extraction', 'upload', 'manual']
    case 'url-only': return ['profile-url', 'extraction']
    default: return ['manual']
  }
}

/**
 * What a source will actually do, given how it is configured right now.
 *
 * This is the function the onboarding UI asks. It answers in the user's terms — connected,
 * needs a key, linked only — without them ever choosing a method.
 *
 * @param {import('../../connectors/types.js').Connector} connector
 * @param {Record<string, unknown>} config
 * @param {{env?: (name: string) => string|undefined}} [context]
 * @returns {{
 *   method: ConnectionMethod,
 *   label: string,
 *   ready: boolean,
 *   blocker?: string,
 *   action?: string,
 *   alternatives: ConnectionMethod[],
 * }}
 */
export function resolveConnection(connector, config = {}, context = {}) {
  const env = context.env ?? (() => undefined)
  const candidates = methodsFor(connector)
  const identified = Boolean(connector.identify?.(config))

  if (!identified) {
    return {
      method: candidates[0],
      label: 'Not connected',
      ready: false,
      blocker: `${connector.name} needs ${requiredLabel(connector)}.`,
      action: 'connect',
      alternatives: candidates,
    }
  }

  // A credential-gated API is reachable only once the credential is present. Saying which
  // variable, by name, is the difference between a solvable problem and a dead end.
  const missing = (connector.authEnv ?? []).filter((name) => !env(name))
  const needsAll = connector.availability === 'token'

  if (needsAll && missing.length) {
    return {
      method: 'api',
      label: 'Needs a credential',
      ready: false,
      blocker: `Set ${missing.join(' and ')} in .env — ${connector.name} exposes nothing without it.`,
      action: 'credential',
      alternatives: candidates.filter((m) => m !== 'api'),
    }
  }

  const method = candidates[0]
  const info = methodInfo(method)

  if (!info?.available) {
    // The best rung is one this project cannot climb. Fall to the best one it can.
    const fallback = candidates.map(methodInfo).find((m) => m?.available)
    return {
      method: fallback?.id ?? 'manual',
      label: fallback?.label ?? 'Entered by you',
      ready: true,
      blocker: info?.unavailableReason,
      alternatives: candidates,
    }
  }

  return {
    method,
    label: info.label,
    ready: true,
    // A token that only *raises limits* is worth mentioning without calling the source
    // unready — it works fine without one.
    ...(missing.length ? { blocker: `Works now; setting ${missing.join(' or ')} in .env raises its limits.` } : {}),
    alternatives: candidates.slice(1),
  }
}

/** @param {import('../../connectors/types.js').Connector} connector */
function requiredLabel(connector) {
  const required = connector.fields.filter((f) => f.required)
  if (!required.length) return 'a profile URL'
  return required.map((f) => f.label.toLowerCase()).join(' and ')
}
