/**
 * Corpus-derived semantics: morphology, and what this portfolio's own words imply.
 *
 * Two mechanisms, both learned from the portfolio rather than written by hand — which is the
 * distinction the previous concept map could not claim:
 *
 * **Morphology.** `publications` and `publication`, `interfaces` and `interface`, `services`
 * and `service`, `accessible` and `accessibility` are the same idea inflected differently. A
 * light suffix stripper folds them together, so a question phrased in one form reaches text
 * written in another. This is cheap, deterministic, and needs no vocabulary list.
 *
 * **Distributional similarity.** Terms that keep appearing in the same records are related in
 * *this* portfolio, whatever a dictionary says. Scored with pointwise mutual information, so a
 * term that co-occurs with everything (`ai` on an AI-heavy portfolio) is correctly treated as
 * uninformative, while a pair that co-occurs far more than chance is treated as a real
 * association. Nobody writes these down; they are read out of the corpus at index time.
 *
 * ## The limit, stated plainly
 *
 * This can only relate words the portfolio actually contains. It cannot connect *"recognizing
 * things from images"* to a project called "FACE EMOTION DETECTION", because the corpus
 * contains none of `recognizing`, `recognition`, `image`, `images` or `vision` — that project's
 * entire text is its title and the word `Python`. No amount of co-occurrence analysis recovers
 * a relationship for a word that never appears; that needs a model carrying knowledge of
 * English from outside this portfolio.
 *
 * So this is a real improvement over hand-written synonyms and it is *not* open-vocabulary
 * semantic search. `capabilities.search` reports what is actually running rather than the more
 * flattering word.
 *
 * @module @portfolio-engine/agent/semantic
 */

import { tokenize, STOP_WORDS } from './search.js'

/**
 * Suffix rules, longest first.
 *
 * A deliberately small Porter-style subset. Aggressive stemming destroys distinctions that
 * matter in a technical corpus — `ai` and `aid`, `cs` and `css` — so this stops at the endings
 * that genuinely represent the same word, and never shortens a token below four characters.
 */
const SUFFIXES = [
  'ational', 'izations', 'iveness', 'fulness', 'ousness', 'ization',
  'ibility', 'ability', 'ication', 'ations', 'ivity', 'ation', 'ially',
  'ement', 'ingly', 'ible', 'able', 'ance', 'ence', 'ment', 'ness',
  'ical', 'ing', 'ive', 'ity', 'er', 'ed', 'ly',
]

/** Below this length a token is left alone — stemming short technical terms destroys them. */
const MIN_STEM = 4

/**
 * Reduce a term to a comparable stem.
 *
 * Plurals are handled before anything else, and deliberately conservatively. The obvious rule
 * — "strip a trailing `es`" — is wrong for the words this corpus is full of: `interfaces` is
 * `interface` + `s`, not `interfac` + `es`, so stripping two characters produced `interfac`
 * while the singular stayed `interface` and the two never matched. That is exactly the bug
 * that made "building user interfaces" miss a portfolio containing the word `interface`.
 *
 * @param {string} term
 * @returns {string}
 */
export function stem(term) {
  let word = String(term ?? '').toLowerCase()
  if (word.length <= MIN_STEM) return word

  // Plurals first, so a suffix rule never eats into the singular form.
  if (word.endsWith('ies') && word.length > 4) word = `${word.slice(0, -3)}y`
  else if (word.endsWith('sses')) word = word.slice(0, -2)
  else if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) word = word.slice(0, -1)

  if (word.length <= MIN_STEM) return word

  for (const suffix of SUFFIXES) {
    if (!word.endsWith(suffix)) continue
    const trimmed = word.slice(0, -suffix.length)
    if (trimmed.length < MIN_STEM) continue
    word = trimmed
    break
  }

  // A trailing doubled consonant left by the cut, folded so inflected pairs land together:
  // "running" loses "ing" to leave "runn", which has to become "run" before it can match "run".
  //
  // The character between the group and the anchor was a literal 0x01 byte rather than the
  // backreference `\1` it was meant to be — a control character no word contains, so the rule
  // matched nothing and every doubled stem stayed doubled.
  return word.replace(/([^aeiou])\1$/, '$1')
}

/**
 * Build the semantic index for a corpus.
 *
 * @param {import('./search.js').SearchDocument[]} documents
 * @returns {SemanticIndex}
 */
export function buildSemanticIndex(documents) {
  /** @type {Map<string, Set<number>>} stem → documents it appears in */
  const postings = new Map()
  /** @type {Map<string, string>} stem → the most common surface form, for explanations */
  const surface = new Map()

  documents.forEach((document, index) => {
    const terms = new Set(tokenize(
      `${document.title} ${document.subtitle ?? ''} ${document.tags.join(' ')} ${document.text}`,
    ))
    for (const term of terms) {
      // Stop words co-occur with everything, so without this they dominate every association
      // list — "accessibility is related to: for, be, it" is worse than no expansion at all.
      if (STOP_WORDS.has(term) || term.length < 3) continue
      const key = stem(term)
      if (!postings.has(key)) postings.set(key, new Set())
      postings.get(key).add(index)
      if (!surface.has(key) || term.length < surface.get(key).length) surface.set(key, term)
    }
  })

  return { postings, surface, size: documents.length }
}

/**
 * Terms distributionally related to a query term, strongest first.
 *
 * Pointwise mutual information over document co-occurrence. The normalisation matters: raw
 * co-occurrence counts would rank the portfolio's most common words as related to everything,
 * which is how naive expansion turns every query into a general-relevance query.
 *
 * @param {string} term
 * @param {SemanticIndex} index
 * @param {{limit?: number, minScore?: number}} [options]
 * @returns {{term: string, score: number}[]}
 */
export function relatedTerms(term, index, options = {}) {
  const key = stem(term)
  const own = index.postings.get(key)
  if (!own || own.size === 0) return []

  const total = index.size
  const limit = options.limit ?? 6
  const minScore = options.minScore ?? 0.25

  /** @type {{term: string, score: number}[]} */
  const scored = []

  for (const [other, docs] of index.postings) {
    if (other === key) continue

    let shared = 0
    for (const doc of own) if (docs.has(doc)) shared += 1
    if (shared < 2) continue

    // PMI, normalised to 0..1 so the weight is comparable across corpora of different sizes.
    const pJoint = shared / total
    const pmi = Math.log(pJoint / ((own.size / total) * (docs.size / total)))
    const normalised = pmi / -Math.log(pJoint)
    if (normalised < minScore) continue

    scored.push({ term: index.surface.get(other) ?? other, score: Number(normalised.toFixed(3)) })
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}

/**
 * @typedef {object} SemanticIndex
 * @property {Map<string, Set<number>>} postings
 * @property {Map<string, string>} surface
 * @property {number} size
 */
