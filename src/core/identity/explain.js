/**
 * Why one claim beat another.
 *
 * The conflict view already shows *what* disagrees and *which value is winning*. What it could
 * not say is **why** — and "why" is the whole difference between a resolution the owner trusts
 * and one they suspect. A person shown two plausible values and told only that the first is in
 * use will assume the system guessed.
 *
 * Nothing here decides anything. It reads the decision `rankClaims` already made and names the
 * rule that made it, in the order that function applies them:
 *
 *     an explicit decision by the owner
 *       › layer precedence   (override › config › manual › connector/document)
 *       › most recently observed
 *       › kind of claim      (confirmed › reported › stated › extracted › inferred)
 *       › source name, for stability
 *
 * If this module and `rankClaims` ever disagree, this module is wrong — which is why the tests
 * assert the explanation against the resolver's own output rather than against a fixture.
 *
 * @module core/identity/explain
 */

import { CLAIM_KINDS, LAYER_PRECEDENCE } from './types.js'

/** How each layer reads to someone who has not memorised the precedence table. */
const LAYER_WORDS = {
  override: 'a value you set as an override',
  config: 'your configuration file',
  manual: 'data you entered yourself',
  connector: 'a connected source',
  document: 'a document you imported',
}

/**
 * @typedef {object} Explanation
 * @property {'user'|'authored'|'layer'|'recency'|'kind'|'name'|'unopposed'} by  Which rule decided it.
 * @property {string} summary       One sentence, for the panel.
 * @property {string} [detail]      The comparison, when there is a runner-up to name.
 * @property {object} [winner]      The option that won.
 * @property {object} [runnerUp]    The strongest option that did not.
 */

/**
 * Explain a conflict's current winner.
 *
 * @param {import('./types.js').Conflict} conflict
 * @returns {Explanation}
 */
export function explainConflict(conflict) {
  const options = conflict?.options ?? []
  const winner = options.find((option) => option.source === conflict.chosen)

  if (!winner) {
    if (conflict?.staleResolution) {
      return {
        by: 'user',
        summary: `You chose ${conflict.staleResolution}, but that source no longer reports this. Pick again.`,
      }
    }

    // Not an error, and the common case for anything you have set yourself. Conflicts are
    // raised only between evidence layers — two connectors, or a connector and a document —
    // but the value published can come from a layer that outranks all of them. Saying "the
    // source is gone" here would be alarming and wrong: nothing is broken, your own value is
    // simply winning.
    const layer = conflict?.chosenLayerKind
    if (layer && layer !== 'connector' && layer !== 'document') {
      return {
        by: 'authored',
        summary: `Neither source is used — ${LAYER_WORDS[layer] ?? layer} takes precedence over both.`,
        detail: 'The disagreement below is recorded, but it does not affect what is published.',
      }
    }

    return {
      by: 'unopposed',
      summary: 'The value in use is not among the sources listed below.',
    }
  }

  if (conflict.resolved && conflict.resolvedBy === 'user') {
    return {
      by: 'user',
      summary: `You chose ${winner.sourceLabel}. Re-importing will not undo this.`,
      winner,
    }
  }

  // The strongest option that lost, ranked the way the resolver ranks them.
  const runnerUp = options
    .filter((option) => option !== winner)
    .sort(byResolverOrder)[0]

  if (!runnerUp) {
    return { by: 'unopposed', summary: `Only ${winner.sourceLabel} reports this.`, winner }
  }

  const winnerLayer = LAYER_PRECEDENCE[winner.layerKind] ?? 0
  const loserLayer = LAYER_PRECEDENCE[runnerUp.layerKind] ?? 0

  if (winnerLayer !== loserLayer) {
    return {
      by: 'layer',
      summary: `${winner.sourceLabel} wins because ${LAYER_WORDS[winner.layerKind] ?? winner.layerKind} outranks ${LAYER_WORDS[runnerUp.layerKind] ?? runnerUp.layerKind}.`,
      detail: `Precedence, not recency — a newer value from a weaker layer does not replace this.`,
      winner,
      runnerUp,
    }
  }

  const winnerAt = time(winner.observedAt)
  const loserAt = time(runnerUp.observedAt)

  if (winnerAt !== loserAt) {
    return {
      by: 'recency',
      summary: `${winner.sourceLabel} and ${runnerUp.sourceLabel} carry equal authority, so the most recently observed value is used.`,
      detail: 'Nothing has decided this is *true* — only that it is the newest. Choose one to settle it.',
      winner,
      runnerUp,
    }
  }

  const winnerKind = CLAIM_KINDS[winner.kind]?.rank ?? 0
  const loserKind = CLAIM_KINDS[runnerUp.kind]?.rank ?? 0

  if (winnerKind !== loserKind) {
    return {
      by: 'kind',
      summary: `${winner.sourceLabel} wins because it is ${CLAIM_KINDS[winner.kind]?.label ?? winner.kind}, which outranks ${CLAIM_KINDS[runnerUp.kind]?.label ?? runnerUp.kind}.`,
      winner,
      runnerUp,
    }
  }

  return {
    by: 'name',
    summary: `${winner.sourceLabel} and ${runnerUp.sourceLabel} are indistinguishable by every rule, so the order is fixed by name to stay stable.`,
    detail: 'This is an arbitrary tiebreak. If it matters, choose one.',
    winner,
    runnerUp,
  }
}

/**
 * Whether a conflict is one a person should look at.
 *
 * A conflict settled by layer precedence is *decided* — your config beating a connector is the
 * system working as designed, not a question. One settled only by recency is a coin toss that
 * happened to land, and that is the one worth an owner's attention.
 *
 * @param {import('./types.js').Conflict} conflict
 * @returns {boolean}
 */
export function needsAttention(conflict) {
  if (conflict?.staleResolution) return true
  if (conflict?.resolved) return false
  const { by } = explainConflict(conflict)
  return by === 'recency' || by === 'name'
}

/** The resolver's own ordering, so "runner-up" means the same thing here as there. */
function byResolverOrder(a, b) {
  const layer = (LAYER_PRECEDENCE[b.layerKind] ?? 0) - (LAYER_PRECEDENCE[a.layerKind] ?? 0)
  if (layer) return layer
  const recency = time(b.observedAt) - time(a.observedAt)
  if (recency) return recency
  const kind = (CLAIM_KINDS[b.kind]?.rank ?? 0) - (CLAIM_KINDS[a.kind]?.rank ?? 0)
  if (kind) return kind
  return String(a.source).localeCompare(String(b.source))
}

/** @param {string|undefined} iso */
function time(iso) {
  const ms = iso ? Date.parse(iso) : NaN
  return Number.isFinite(ms) ? ms : 0
}

/* -------------------------------------------------------------------------- */
/* Where a published value came from                                          */
/* -------------------------------------------------------------------------- */

/**
 * The identity fields worth tracing, in the order a person reads them.
 *
 * Deliberately short. Provenance for every field of every record would be a data dump nobody
 * reads; these are the values a visitor sees first and therefore the ones an owner most needs
 * to be able to justify.
 */
const TRACED = ['name', 'headline', 'summary', 'location', 'avatar', 'pronouns']

/**
 * @typedef {object} FieldTrace
 * @property {string} field
 * @property {string} label
 * @property {unknown} value        What the portfolio publishes.
 * @property {object} [winner]      The claim that supplied it.
 * @property {object[]} claims      Every claim about it, strongest first.
 * @property {boolean} contested    Whether the claims disagree.
 */

/**
 * Trace the published identity back to the claims behind it.
 *
 * Reuses `evidenceFor`, so the ordering here is the resolver's ordering — this cannot show a
 * different winner from the one actually published, because it does not compute one.
 *
 * Honours `privacy.showDataProvenance`. A portfolio configured not to say where its data came
 * from should not have an admin screen that says it anyway; the setting exists because some
 * owners would rather not advertise which platforms they are on.
 *
 * @param {{profile: object, evidence: Map<string, object[]>, config?: object}} built
 * @param {(identity: {evidence: Map<string, object[]>}, subject: string, attribute: string) => object[]} rank
 * @returns {{enabled: boolean, reason?: string, fields: FieldTrace[]}}
 */
export function traceIdentity(built, rank) {
  if (built?.config?.privacy?.showDataProvenance === false) {
    return {
      enabled: false,
      reason: 'Provenance is turned off in your privacy settings.',
      fields: [],
    }
  }

  const identity = built?.profile?.identity ?? {}
  const fields = []

  for (const field of TRACED) {
    const value = identity[field]
    if (value === undefined || value === null || value === '') continue

    const claims = rank({ evidence: built.evidence }, 'identity', field) ?? []
    fields.push({
      field,
      label: field.charAt(0).toUpperCase() + field.slice(1),
      value,
      winner: claims[0],
      claims,
      // Two claims with different values, not merely two sources agreeing.
      contested: new Set(claims.map((claim) => JSON.stringify(claim.value))).size > 1,
    })
  }

  return { enabled: true, fields }
}

/* -------------------------------------------------------------------------- */
/* Where an editable field's value came from                                  */
/* -------------------------------------------------------------------------- */

/**
 * @typedef {object} FieldState
 * @property {'imported'|'configured'|'overridden'|'missing'} state
 * @property {string} label        The word the editor shows.
 * @property {string} [source]     Which layer or connector supplied the value in use.
 * @property {string} [underlying} What clearing an override would fall back to.
 * @property {boolean} canRevert
 */

/**
 * Describe one editable identity field for the editor.
 *
 * The editor needs a different question answered from the conflict view's. A conflict asks
 * "which of these disagreeing sources wins"; this asks "if I type here, what am I changing,
 * and what happens if I undo it" — and the honest answer depends on whether the value was
 * imported from a platform, written in config, or typed as an override.
 *
 * `underlying` is the part worth getting right. An editor that offers "revert" without saying
 * what it reverts *to* is asking someone to guess, and the guess is usually "empty".
 *
 * Presentation settings deliberately do not go through here — see `presentationState`.
 *
 * @param {object} options
 * @param {string} options.field                     e.g. `headline`
 * @param {unknown} options.value                    What the portfolio currently publishes.
 * @param {Record<string, unknown>} [options.overrides]  The identity override bucket.
 * @param {object[]} [options.claims]                `evidenceFor(built, 'identity', field)`.
 * @returns {FieldState}
 */
export function fieldState({ field, value, overrides = {}, claims = [] }) {
  const winner = claims[0]

  // Two ways to learn a field is overridden, and the claim is the authoritative one: it is what
  // the resolver actually used. `overrides` is the editor's draft bucket, which can legitimately
  // be ahead of the claims (a value typed a moment ago) or behind them (a saved override the
  // panel did not pass in). Reading only the bucket produced a field labelled "imported from
  // you" — the layer said override, the bucket was empty, and the two halves disagreed.
  const overridden =
    winner?.layerKind === 'override' ||
    (overrides?.[field] !== undefined && overrides[field] !== '')

  const present = value !== undefined && value !== null && value !== ''

  // What would be published if the override were cleared: the strongest claim that is not the
  // override itself.
  const beneath = claims.find((claim) => claim.layerKind !== 'override')
  const underlying = beneath?.value

  if (overridden) {
    return {
      state: 'overridden',
      label: 'Overridden',
      source: 'you',
      ...(underlying !== undefined ? { underlying: String(underlying) } : {}),
      canRevert: true,
    }
  }

  if (!present) {
    return { state: 'missing', label: 'Not set', canRevert: false }
  }

  // `config` is the owner's own file: authored, not imported. Calling it "imported" would
  // suggest a platform could change it on the next run, which it cannot.
  if (!winner || winner.layerKind === 'config' || winner.layerKind === 'manual') {
    return { state: 'configured', label: 'Configured', source: winner?.source ?? 'config', canRevert: false }
  }

  return {
    state: 'imported',
    label: 'Imported',
    // The connector key, which is what the owner recognises — "github", not "connector".
    source: winner.source,
    canRevert: false,
  }
}

/**
 * The state of a presentation setting.
 *
 * Separate from `fieldState` on purpose. A theme, a flip interval or a footer toggle is not a
 * *claim about the person* — nothing imported it, nothing can contradict it, and no source
 * will ever supply it. Routing these through the same function would manufacture provenance
 * for a value that has none, which is exactly the confusion the layered model exists to avoid.
 *
 * @param {unknown} value
 * @param {unknown} [fallback]  What the component uses when nothing is set.
 * @returns {{state: 'configured'|'default', label: string, source: undefined, canRevert: boolean}}
 */
export function presentationState(value, fallback) {
  const set = value !== undefined && value !== null && value !== ''
  return {
    state: set ? 'configured' : 'default',
    label: set ? 'Set by you' : 'Default',
    // Never a source. A presentation setting has no provenance to report.
    source: undefined,
    canRevert: set && fallback !== undefined,
  }
}
