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
 * @module core/sync/policy
 */

/** How long `'defer'`ed changes wait for company, measured from the first of them. */
export const DEFER_MS = 5 * 60_000

/**
 * @param {import('./github.js').ChangeEvent} change
 * @returns {'now'|'defer'|'ignore'}
 */
export function classify(change) {
  // TODO(human): decide what each kind of change is worth.
  //
  // The default below is the simplest defensible rule — structural changes (a repository
  // appearing, going private, a release) publish now, and activity (pushes, stars, forks)
  // is folded together and published DEFER_MS after the first of them.
  //
  // Consider: should a star ever publish on its own? Is a fork worth a build, or is it only
  // worth riding along with the next one? Should a push on its own be ignored entirely —
  // the weekly run will pick it up anyway? `change.kind` is e.g. 'push', 'star.created',
  // 'fork', 'release.published', 'repository.renamed'; `change.via` says whether it arrived by
  // webhook or by polling.
  return change.weight === 'structural' ? 'now' : 'defer'
}
