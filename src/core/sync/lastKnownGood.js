/**
 * Last-known-good: a source that fails keeps what it last delivered.
 *
 * ## The failure this prevents
 *
 * A connector that errors contributes no profile to the run. On a full import the writer then
 * deletes the previous file of every source that "produced nothing" — correct for a source the
 * owner removed, and wrong for one that merely hit a 503. The site is rebuilt without that
 * source's projects, skills or stats until some later run happens to succeed. With a weekly
 * schedule that is up to a week of a degraded portfolio caused by one provider's bad minute.
 *
 * (The existing health model was right about the *status*: `lastSuccessfulAt` survives failure.
 * Nothing did the same for the *data*.)
 *
 * ## The rule
 *
 * A source that is **still configured** and **failed** this run keeps its previous profile, and
 * is marked as doing so. Everything else is untouched:
 *
 * - `error` and `unavailable` are failures to *reach* a source; the data is stale, not wrong.
 * - `empty` is **not** a failure. A source that answered "you have nothing" is the source of
 *   truth, and resurrecting a deleted repository would be the worse bug.
 * - `skipped` means the configuration was invalid, so there is nothing to be loyal to.
 * - A source absent from `status` is no longer configured and is never brought back.
 *
 * The status stays `error` — the failure is real and must stay visible to the owner and to the
 * run summary. What changes is that it also says the site is still serving older data, and how
 * old it is. Hiding the failure because the data was preserved would trade one silent problem
 * for another.
 *
 * Pure: no files, no clock. The importer supplies the previous profiles it read from disk.
 *
 * @module core/sync/lastKnownGood
 */

/** States that mean "could not reach the source", as opposed to "reached it and it was empty". */
const FAILED = new Set(['error', 'unavailable'])

/**
 * @param {{
 *   sources: {key: string, connector: string, profile: object}[],
 *   status: Record<string, import('../../connectors/types.js').SourceStatus & {lastSuccessfulAt?: string}>,
 *   previousProfiles?: Record<string, object|undefined>,
 * }} input
 * @returns {{
 *   sources: {key: string, connector: string, profile: object}[],
 *   status: Record<string, any>,
 *   restored: string[],
 * }}
 */
export function applyLastKnownGood({ sources, status, previousProfiles = {} }) {
  const byKey = new Map(sources.map((source) => [source.key, source]))
  /** @type {Record<string, any>} */
  const nextStatus = {}
  /** @type {string[]} */
  const restored = []

  for (const [key, entry] of Object.entries(status)) {
    const previous = previousProfiles[key]
    if (!FAILED.has(entry.state) || !previous || typeof previous !== 'object') {
      nextStatus[key] = entry
      continue
    }

    // Replaces whatever the failed run salvaged. A failed fetch can still yield a thin profile
    // built from the owner's own config (a link, a handle); the previous full profile contains
    // those same fields *and* the live data, so it is the better thing to keep.
    byKey.set(key, { key, connector: entry.connector, profile: previous })
    restored.push(key)

    const since = entry.lastSuccessfulAt
    nextStatus[key] = {
      ...entry,
      servingLastKnownGood: true,
      message: since
        ? `${entry.message} Showing the data from the last successful import (${since.slice(0, 10)}).`
        : `${entry.message} Showing the data from the last successful import.`,
    }
  }

  return {
    // Same deterministic ordering the importer uses, so re-running with nothing changed still
    // writes byte-identical files and the git diff stays meaningful.
    sources: [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key)),
    status: nextStatus,
    restored,
  }
}
