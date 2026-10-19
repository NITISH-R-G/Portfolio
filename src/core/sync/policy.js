/**
 * Which changes are worth a publish, and how soon.
 *
 * Every publish is a ~3 minute rebuild of the whole site, so this is a real trade-off rather
 * than a formality: too eager and a burst of commits queues a rebuild per push; too lazy and a
 * new repository takes minutes longer than it has to appear.
 *
 * The answer for a change is one of three:
 *
 * - `'now'`    publish as soon as the cooldown allows. For things a visitor would notice missing.
 * - `'defer'`  publish `DEFER_MS` after the first such change, folding in whatever else arrives
 *              meanwhile. For churn, where one build can cover a dozen events — and the wait is
 *              bounded, so a steady trickle cannot postpone the build forever.
 * - `'ignore'` never publish for this. Not "later" — never.
 *
 * It is a function of the change alone, on purpose: policy that depended on service state
 * would be policy nobody could reason about from the event in front of them.
 *
 * ## What this decides, and what it cannot
 *
 * Only *when to rebuild*. An event is an invalidation signal, not data: nothing in a change is
 * ever written into the profile, because every rebuild re-reads the providers. So no answer
 * here can corrupt profile data, and `'ignore'` can cost only freshness (the weekly run still
 * picks the change up). That is why an unrecognised change is ignored rather than guessed at:
 * the cost of being wrong is a late rebuild, never a wrong profile.
 *
 * By the time a change reaches this function it has already been verified (HMAC, fail closed),
 * parsed by an allowlist, matched to the configured account and repository, stripped of private
 * repositories, and deduplicated. This function is the last check, not the first.
 *
 * @module core/sync/policy
 */

import { GITHUB_CHANGE_KINDS } from './github.js'

/** How long `'defer'`ed changes wait for company, measured from the first of them. */
export const DEFER_MS = 5 * 60_000

/**
 * @param {import('./github.js').ChangeEvent} change
 * @returns {'now'|'defer'|'ignore'}
 */
export function classify(change) {
  // Explicit matching: a change is acted on only if its source is one this service understands
  // and its kind is one that source's parser can produce. A new kind therefore does nothing
  // until it is added to the parser, instead of inheriting a default.
  if (change?.source !== 'github' || !GITHUB_CHANGE_KINDS.has(change.kind)) return 'ignore'

  // A visitor would notice a structural change missing; activity is folded into one build.
  // Stars, forks and pushes are deliberately not ignored: sync-service.md promises they are
  // noticed, and a late build is the cheap way to honour that.
  if (change.weight === 'structural') return 'now'
  if (change.weight === 'activity') return 'defer'
  return 'ignore'
}
