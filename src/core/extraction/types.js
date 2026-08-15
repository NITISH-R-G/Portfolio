/**
 * The extraction provider contract.
 *
 * Provisional by design. The roadmap settles the abstraction *after* the benchmark reports,
 * because a contract written before any measurement encodes guesses about what providers
 * need — and the usual result is an interface shaped around whichever one was implemented
 * first. What exists here is the minimum required to run two providers against the same
 * corpus and compare them fairly; expect it to change once there are numbers.
 *
 * The one part that is **not** provisional is the output boundary. A provider returns an
 * `Extraction` — a profile fragment plus evidence — and never a `Profile`. Everything a
 * provider produces enters the system as claims, gets a confidence, and can lose to the
 * user's own words. A provider that could write the canonical profile directly would be a
 * single bad regex away from rewriting someone's employment history, and no amount of
 * provider quality makes that an acceptable shape.
 *
 *     Provider.fetch()      →  raw bytes / HTML
 *     Provider.extract()    →  PageSignals        (what the page says)
 *     normalizeSignals()    →  Extraction         (what we think it means, + confidence)
 *     collectClaims()       →  Claim[]            (who said it, when, how sure)
 *     resolveIdentity()     →  Profile            (what to publish)
 *
 * @module core/extraction/types
 */

/**
 * @typedef {object} ExtractionProvider
 * @property {string} id
 * @property {string} name
 * @property {string} summary                       One line, in outcome terms.
 * @property {ProviderCapabilities} capabilities
 * @property {(url: string) => boolean} [detect]
 *   Whether this provider claims a URL. Absent means "anything" — the fallback position.
 * @property {(url: string, ctx: FetchContext) => Promise<FetchResult>} fetch
 * @property {(fetched: FetchResult, ctx: ExtractContext) => Promise<import('./signals.js').PageSignals>} extract
 * @property {() => Promise<ProviderHealth>} [health]
 */

/**
 * What a provider can and cannot do, declared rather than discovered.
 *
 * Mirrors `core/sources/capabilities.js` deliberately: the onboarding UI already derives
 * itself from connector capabilities, and an extraction provider that declares the same
 * shape can be surfaced the same way without new branching.
 *
 * @typedef {object} ProviderCapabilities
 * @property {boolean} javascript      Executes page scripts. False means static HTML only.
 * @property {boolean} offline         Runs with no network and no third-party service.
 * @property {'none'|'optional'|'required'} authentication
 * @property {string[]} authEnv        Environment variables it reads.
 * @property {'free'|'metered'} cost    `metered` means a run bills someone.
 * @property {string} [limits]         Rate limits or quotas, in plain words.
 */

/**
 * @typedef {object} FetchContext
 * @property {typeof globalThis.fetch} [fetch]
 * @property {number} [timeoutMs]
 * @property {(message: string) => void} [warn]
 */

/**
 * @typedef {object} ExtractContext
 * @property {string} [url]
 * @property {string} [sourceId]
 */

/**
 * The result of fetching, kept separate from extraction so a frozen fixture can be
 * substituted for a live fetch. That substitution is what makes the benchmark deterministic
 * and offline — see `benchmarks/README.md`.
 *
 * @typedef {object} FetchResult
 * @property {string} html
 * @property {string} [url]              Final URL after redirects.
 * @property {number} [status]
 * @property {boolean} [rendered]        Whether scripts ran before the HTML was captured.
 * @property {string} [failure]          Set when the page could not be retrieved at all.
 */

/**
 * @typedef {object} ProviderHealth
 * @property {'ok'|'degraded'|'unavailable'} state
 * @property {string} [detail]
 */

export {}
