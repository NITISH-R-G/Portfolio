/**
 * Where your sources disagree.
 *
 * The closest thing this product has to a merge-conflict view, and it exists for the same
 * reason Git's does: when two authorities contradict each other, the only correct resolver
 * is the person who knows which one is true. Guessing silently is what every other
 * aggregator does, and it is how a portfolio ends up quietly claiming the wrong job title.
 *
 * A decision made here is stored against a stable conflict id, so it keeps applying after
 * the next import re-asserts the value that was rejected.
 *
 * @module admin/panels/ConflictsPanel
 */

import Icon from '../icon.jsx'
import { Panel, Note } from '../fields.jsx'
import { explainConflict, needsAttention } from '../../core/identity/explain.js'

/**
 * @param {{builder: import('../state.js').Builder}} props
 */
export default function ConflictsPanel({ builder }) {
  const { built, overrides, resolveConflict, clearResolution } = builder
  const conflicts = built.conflicts ?? []
  const resolutions = overrides.resolutions ?? {}

  // Not simply `!resolved`. A conflict your config already settles is *decided* — nagging about it would
  // bury the ones that are genuinely a coin toss, which is the only kind worth a person's
  // time. `needsAttention` applies the resolver's own reasoning to make that distinction.
  const unresolved = conflicts.filter(needsAttention)

  if (!conflicts.length) {
    return (
      <Panel title="Conflicts" description="Where two of your sources disagree about the same fact.">
        <Note icon="Check">
          Nothing to resolve — none of your sources contradict each other.
        </Note>
        <p className="field-help">
          Conflicts appear when two sources claim different values for the same thing: your
          résumé saying <em>Software Engineering Intern</em> where LinkedIn says{' '}
          <em>Software Engineer</em>, for instance. Sources that merely add to each other —
          two connectors listing different technologies for one project — are combined
          rather than treated as a disagreement.
        </p>
      </Panel>
    )
  }

  return (
    <Panel
      title="Conflicts"
      description="Two sources disagree about the same fact. You decide which is right, once."
    >
      {unresolved.length > 0 ? (
        <Note tone="warn" icon="AlertTriangle">
          <strong>{unresolved.length}</strong> {unresolved.length === 1 ? 'conflict is' : 'conflicts are'} settled
          only by a tiebreak, not by a rule. Choosing decides them for good.
        </Note>
      ) : (
        <Note icon="Check">
          Nothing needs you. Every disagreement is settled by a rule — your own values, or a
          source that outranks the other — rather than by a tiebreak.
        </Note>
      )}

      <Note icon="Info">
        Your decision is stored against the fact, not the import. Re-importing will not undo it,
        even if the source you rejected reports the same value again.
      </Note>

      <ul className="conflict-list">
        {conflicts.map((conflict) => {
          const resolution = resolutions[conflict.id]

          return (
            <li key={conflict.id} className={`conflict${conflict.resolved ? ' conflict-resolved' : ''}`}>
              <header className="conflict-head">
                <h3 className="conflict-label">{conflict.label}</h3>
                <span className={`conflict-state conflict-state-${conflict.resolved ? 'resolved' : 'open'}`}>
                  {conflict.resolved ? 'decided by you' : 'undecided'}
                </span>
              </header>

              <ul className="conflict-options">
                {conflict.options.map((option) => {
                  const chosen = option.source === conflict.chosen
                  return (
                    <li
                      key={option.source}
                      className={`conflict-option${chosen ? ' conflict-option-chosen' : ''}`}
                    >
                      <button
                        type="button"
                        className="conflict-choose"
                        aria-pressed={chosen}
                        onClick={() => resolveConflict(conflict.id, { source: option.source })}
                      >
                        <span className="conflict-radio" aria-hidden="true">
                          {chosen && <Icon name="Check" size={12} />}
                        </span>
                        <span className="conflict-value">{render(option.value)}</span>
                      </button>

                      <p className="conflict-provenance">
                        {option.sourceLabel}
                        {/* Where in the document, so the value can be checked against the
                            original rather than taken on trust. */}
                        {option.document && (
                          <>
                            {option.document.page !== undefined && <> · page {option.document.page}</>}
                            {option.document.section && <> · {option.document.section}</>}
                          </>
                        )}
                        {option.observedAt && <> · seen {formatWhen(option.observedAt)}</>}
                        {option.confidence !== undefined && (
                          <> · <span title="How confidently this was extracted from the document. Only extraction can produce this — an API's answer is exact, not probable.">
                            extraction confidence {Math.round(option.confidence * 100)}%
                          </span></>
                        )}
                        {option.url && (
                          <>
                            {' · '}
                            <a href={option.url} target="_blank" rel="noreferrer noopener">verify</a>
                          </>
                        )}
                      </p>

                      {option.agreedBy?.length > 1 && (
                        <p className="conflict-agreement">
                          Also says this: {option.agreedBy.filter((s) => s !== option.sourceLabel).join(', ')}
                        </p>
                      )}

                      {option.document?.text && (
                        <p className="conflict-excerpt" title="The text this value was read from">
                          “{option.document.text}”
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>

              <footer className="conflict-foot">
                {conflict.resolved && (
                  <>
                    <button type="button" className="btn-admin btn-admin-ghost"
                      onClick={() => clearResolution(conflict.id)}>
                      <Icon name="Undo2" size={14} /> Undo decision
                    </button>
                    <span className="conflict-hint">{explainConflict(conflict).summary}</span>
                  </>
                )}
                {conflict.staleResolution && (
                  <span className="conflict-hint conflict-hint-warn">
                    You chose <strong>{conflict.staleResolution}</strong>, but that source no longer
                    reports this. Pick again.
                  </span>
                )}
                {/* Why this value is the one being published. Read from the resolver's own
                    ranking rather than assumed: the old text said "observed most recently" for
                    every unresolved conflict, which was simply untrue whenever layer precedence
                    or a value the owner had typed was what actually decided it. */}
                {!conflict.resolved && !conflict.staleResolution && (
                  <span className="conflict-hint">
                    Using <strong>{conflict.chosenLabel ?? labelOf(conflict)}</strong>.{' '}
                    {explainConflict(conflict).summary}
                  </span>
                )}
                {resolution?.value !== undefined && (
                  <span className="conflict-hint">Using a value you typed.</span>
                )}
              </footer>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

/** @param {import('../../core/identity/types.js').Conflict} conflict */
function labelOf(conflict) {
  return conflict.options.find((o) => o.source === conflict.chosen)?.sourceLabel ?? conflict.chosen
}

/** @param {unknown} value */
function render(value) {
  if (Array.isArray(value)) return value.join(', ')
  if (value === null || value === undefined) return '(nothing)'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** @param {string} iso */
function formatWhen(iso) {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  if (!Number.isFinite(days)) return iso.slice(0, 10)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  if (days < 365) return `${Math.round(days / 30)} months ago`
  return iso.slice(0, 10)
}
