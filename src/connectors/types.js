/**
 * The connector contract.
 *
 * A connector is the *only* place that knows how one platform stores its data. It turns
 * whatever that platform returns into the shared `Profile` shape from `core/schema`, and
 * nothing downstream — not the build pipeline, not a section component, not the admin —
 * ever learns which platform a record came from except through `record.source`.
 *
 * That boundary is what makes new integrations cheap: adding a platform means adding one
 * directory under `src/connectors/`, never editing the UI. See docs/adding-a-connector.md.
 *
 * @module connectors/types
 */

/**
 * How much a connector can actually do. This is a deliberate, load-bearing honesty
 * mechanism: several well-known platforms have no public API, and pretending otherwise
 * would mean shipping an integration that silently returns nothing.
 *
 * - `'api'`     — an official or stable public HTTP API. Fetches automatically.
 * - `'feed'`    — no API, but a public RSS/Atom/JSON feed exists. Fetches automatically,
 *                 with whatever subset of data the feed happens to carry.
 * - `'token'`   — an official API that requires the user's own credential. Fetches
 *                 automatically once the credential is present in the environment.
 * - `'manual'`  — no usable public interface. The user supplies the numbers themselves in
 *                 config; the connector validates, normalizes and attributes them.
 * - `'url-only'`— no usable public interface and no meaningful numbers to type in. The
 *                 connector contributes a verified profile link and nothing else.
 *
 * @typedef {'api'|'feed'|'token'|'manual'|'url-only'} Availability
 */

/**
 * Broad grouping, used only to organize the setup wizard and admin UI.
 * @typedef {'code'|'competitive'|'research'|'writing'|'packages'|'ml'|'community'|'video'|'social'|'other'} ConnectorCategory
 */

/**
 * One configurable field of a connector, rendered as a prompt by `npm run setup` and as a
 * form field by the admin. Declaring them here is what lets both of those be generic.
 *
 * @typedef {object} ConnectorField
 * @property {string} key
 * @property {string} label
 * @property {'string'|'number'|'url'|'boolean'|'list'} [type]
 * @property {boolean} [required]
 * @property {string} [placeholder]
 * @property {string} [help]
 */

/**
 * Runtime services handed to `fetch`. Passing these in rather than importing them means a
 * connector is testable with no network and no clock.
 *
 * @typedef {object} ConnectorContext
 * @property {import('./http.js').HttpClient} http
 * @property {(name: string) => string|undefined} env   Reads a secret. Never logged.
 * @property {(message: string) => void} log
 * @property {number} now
 */

/**
 * What a connector's `fetch` hands to its `normalize`. Intentionally untyped: it is the
 * platform's own shape and never escapes the connector directory.
 * @typedef {unknown} RawPayload
 */

/**
 * @typedef {object} Connector
 * @property {string} id                       Key under `dataSources` in portfolio.config.js.
 * @property {string} name                     Human label.
 * @property {ConnectorCategory} category
 * @property {string} icon                     Resolved by `components/Icon`.
 * @property {Availability} availability
 * @property {string} homepage
 * @property {string} summary                  One line, shown in setup and docs.
 * @property {string} [limits]                 What this connector cannot do, and why.
 * @property {string[]} supportedData          Profile collections it can populate.
 * @property {ConnectorField[]} fields
 * @property {string[]} [authEnv]              Environment variables it reads, if any.
 * @property {string} [rateLimit]
 *   The platform's published limit, in one line. Declared only where it is actually known —
 *   an invented figure would be worse than none, since a user would plan around it.
 * @property {(cfg: Record<string, unknown>) => string|undefined} [identify]
 *   The account this config points at, for display. Absent/undefined ⇒ not configured.
 * @property {(cfg: Record<string, unknown>) => string|undefined} [profileUrl]
 * @property {(cfg: Record<string, unknown>, ctx: ConnectorContext) => Promise<RawPayload>} [fetch]
 *   Omitted for `manual` and `url-only` connectors, which have nothing to fetch.
 * @property {(raw: RawPayload, cfg: Record<string, unknown>, ctx: {now: number}) => object} normalize
 *   Must return a plain object in `Profile` shape. Never throws — malformed upstream data
 *   is dropped, not propagated.
 */

/**
 * The outcome of running one connector. Every state is terminal and independent: one
 * connector's failure never affects another's, and never fails the build.
 *
 * - `imported`    — ran, returned data.
 * - `partial`     — ran, but some sub-request failed or was rate-limited. Data is usable.
 * - `empty`       — ran successfully; the account genuinely has nothing to show.
 * - `manual`      — user-supplied data was accepted (no fetch was attempted).
 * - `link-only`   — contributed a profile link only, by design.
 * - `unavailable` — configured, but cannot run here (missing credential, needs a server).
 * - `error`       — tried and failed. `message` says why, in words a user can act on.
 * - `skipped`     — not enabled, or missing a required field.
 *
 * @typedef {'imported'|'partial'|'empty'|'manual'|'link-only'|'unavailable'|'error'|'skipped'} SourceState
 */

/**
 * @typedef {object} SourceStatus
 * @property {string} connector
 * @property {string} name
 * @property {SourceState} state
 * @property {string} message
 * @property {string} [account]
 * @property {string} [fetchedAt]   ISO timestamp.
 * @property {number} [durationMs]
 * @property {Record<string, number>} [counts]  Records produced, per collection.
 * @property {string[]} [warnings]
 */

/**
 * @typedef {object} ConnectorRun
 * @property {SourceStatus} status
 * @property {object|null} profile   Normalized `Profile`-shaped partial, or null.
 */

export {}
