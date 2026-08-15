/**
 * The identity layer's vocabulary.
 *
 * The shift this layer makes: a profile is not a document that sources overwrite in turn.
 * It is a set of **claims** — "LinkedIn said your title at Acme was 'Software Engineer', on
 * the 3rd of March" — and the profile you publish is a *resolution* of those claims.
 *
 * That distinction is what makes the rest of the product possible. Once disagreement is
 * representable rather than silently discarded, you can show a conflict to the person it
 * belongs to, let them decide once, and have that decision survive every future import.
 * A last-write-wins merge cannot do any of that: it throws the losing value away before
 * anyone knows there was a disagreement.
 *
 * @module core/identity/types
 */

/**
 * How a claim came to be known.
 *
 * Deliberately a small set of named kinds rather than a probability. A connector that read
 * an API knows its value is exactly what the API said — that is not "97% confident", it is
 * reported. A number the owner typed is not less *accurate*, it is differently *sourced*,
 * and collapsing both onto one numeric axis would invent precision that does not exist.
 *
 * `confidence` stays available for sources that can genuinely produce one — a document
 * extractor reporting how sure it is that a line was a job title — and is left undefined by
 * everything that cannot.
 *
 * @typedef {'verified'|'reported'|'stated'|'extracted'|'inferred'} ClaimKind
 */

/**
 * Relative authority of each kind, used only to break ties *within* a layer kind and to
 * order the options shown in a conflict. It never overrides layer precedence — what a
 * person says about themselves still beats what a platform's bio field happens to hold.
 *
 * @type {Record<ClaimKind, {rank: number, label: string}>}
 */
export const CLAIM_KINDS = {
  verified: { rank: 5, label: 'confirmed by you' },
  reported: { rank: 4, label: 'reported by the platform' },
  stated: { rank: 3, label: 'entered by you' },
  extracted: { rank: 2, label: 'extracted from a document' },
  inferred: { rank: 1, label: 'derived from other data' },
}

/**
 * Where a layer sits in the precedence order. Higher wins, and this is the *primary*
 * resolution key — preserving the existing guarantee that a user's own words are never
 * overwritten by an import.
 *
 * @typedef {'connector'|'document'|'manual'|'config'|'override'} LayerKind
 */

/**
 * Connectors and documents deliberately share a level.
 *
 * Both are *evidence about* a person, obtained from somewhere; neither is a statement *by*
 * them. Ranking one above the other by type would decide every LinkedIn-versus-résumé
 * disagreement on a coin-flip of architecture — a six-month-old résumé would beat a
 * LinkedIn profile synced this morning, or the reverse, for no reason connected to which
 * is actually right.
 *
 * So they tie here and are separated by recency, and where recency cannot settle it the
 * disagreement is surfaced as a conflict for the only person who can resolve it. What a
 * person says about themselves still outranks both.
 *
 * @type {Record<LayerKind, number>}
 */
export const LAYER_PRECEDENCE = {
  connector: 1,
  document: 1,
  manual: 2,
  config: 3,
  override: 4,
}

/**
 * Layer kinds that represent evidence *about* the subject rather than a statement *by*
 * them. Only these can genuinely contradict each other, so only these raise conflicts.
 *
 * @type {ReadonlySet<LayerKind>}
 */
export const EVIDENCE_LAYERS = new Set(['connector', 'document'])

/**
 * One input to the identity resolver.
 *
 * @typedef {object} Layer
 * @property {string} id          Stable identifier — a connector key, `manual`, `config`.
 * @property {LayerKind} kind
 * @property {unknown} profile    Anything `normalizeProfile` accepts.
 * @property {string} [label]     Human name for the conflict UI. Defaults to `id`.
 * @property {string} [observedAt} ISO timestamp, when this layer's data was obtained.
 */

/**
 * A single assertion by a single source about a single attribute.
 *
 * @typedef {object} Claim
 * @property {string} subject      `"experience/acme-corp-engineer"`, or `"identity"`.
 * @property {string} attribute    `"role"`, `"contact.email"`, or a socials network key.
 * @property {unknown} value
 * @property {string} source       The layer id that asserted it.
 * @property {LayerKind} layerKind
 * @property {ClaimKind} kind
 * @property {string} [observedAt] ISO timestamp — when the source reported this.
 * @property {string} [url]        Where a reader could verify it.
 * @property {number} [confidence] 0–1, only when a source can genuinely produce one.
 */

/**
 * Two or more sources disagreeing about the same attribute of the same subject.
 *
 * A conflict is specifically *not* an override: choosing to rewrite a description yourself
 * is a decision, not a disagreement, and showing it as one would bury the real conflicts in
 * noise.
 *
 * @typedef {object} Conflict
 * @property {string} id            Stable across imports, so a resolution keeps applying.
 * @property {string} subject
 * @property {string} attribute
 * @property {string} label         Human description, e.g. `Role at Acme Corp`.
 * @property {string} collection
 * @property {ConflictOption[]} options
 * @property {string} chosen        Source id of the value currently winning.
 * @property {boolean} resolved     Whether the owner has decided.
 * @property {'user'|'precedence'} resolvedBy
 */

/**
 * @typedef {object} ConflictOption
 * @property {unknown} value
 * @property {string} source
 * @property {string} sourceLabel
 * @property {ClaimKind} kind
 * @property {string} [observedAt]
 * @property {string} [url]
 */

/**
 * The resolved identity: what to publish, plus everything needed to explain it.
 *
 * @typedef {object} CanonicalIdentity
 * @property {import('../schema/types.js').Profile} profile
 * @property {Conflict[]} conflicts
 * @property {Map<string, Claim[]>} evidence  subject|attribute → every claim made about it.
 * @property {string[]} sources               Layer ids that contributed anything.
 */

export {}
