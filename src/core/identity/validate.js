/**
 * Checking the identity layer's own integrity.
 *
 * Distinct from `schema/validate.js`, which asks whether a *profile* is complete and
 * well-formed. This asks whether the *provenance* holds up: can every published value be
 * traced to a source, does every document claim say which document, is every confidence a
 * real number, and does every decision still point at a source that exists.
 *
 * These are the failures that stay invisible without a check. A value that lost its
 * provenance still renders; a decision pointing at a deleted source still looks decided.
 * Both quietly break the guarantee that the page can be traced back to evidence, and
 * neither surfaces on its own.
 *
 * @module core/identity/validate
 */

import { CLAIM_KINDS, EVIDENCE_LAYERS } from './types.js'

/**
 * @typedef {object} IdentityFinding
 * @property {'error'|'warning'} level
 * @property {string} code
 * @property {string} path
 * @property {string} message
 * @property {string} [hint]
 */

/**
 * @param {import('./types.js').CanonicalIdentity} identity
 * @param {{
 *   layers?: import('./types.js').Layer[],
 *   resolutions?: Record<string, {source?: string, value?: unknown}>,
 *   documents?: import('../documents/types.js').ImportedDocument[],
 * }} [context]
 * @returns {{valid: boolean, findings: IdentityFinding[]}}
 */
export function validateIdentity(identity, context = {}) {
  /** @type {IdentityFinding[]} */
  const findings = []

  const add = (level, code, path, message, hint) =>
    findings.push({ level, code, path, message, ...(hint ? { hint } : {}) })

  const layers = context.layers ?? []
  const documents = context.documents ?? []
  const resolutions = context.resolutions ?? {}

  const knownSources = new Set(identity.sources ?? [])
  const documentIds = new Set(documents.map((doc) => doc?.id ?? doc?.meta?.id).filter(Boolean))

  /* Source ids -------------------------------------------------------------- */

  const seen = new Set()
  for (const layer of layers) {
    if (!layer?.id) {
      add('error', 'source-unnamed', 'layers', 'A source was supplied without an id, so its claims cannot be attributed.')
      continue
    }
    if (seen.has(layer.id)) {
      // Two sources sharing an id makes their claims indistinguishable, which silently
      // breaks both conflict detection and any decision referring to either.
      add('error', 'source-duplicate', `layers.${layer.id}`,
        `Two sources share the id "${layer.id}".`,
        'Rename one — a document id is taken from its filename, so importing two files with the same name collides.')
    }
    seen.add(layer.id)
  }

  /* Claims ------------------------------------------------------------------ */

  let missingProvenance = 0
  let badConfidence = 0

  for (const [key, claims] of identity.evidence ?? []) {
    const [subject, attribute] = splitKey(key)
    if (attribute === '@exists') continue

    for (const claim of claims) {
      if (!claim.source) {
        missingProvenance += 1
        continue
      }

      if (!CLAIM_KINDS[claim.kind]) {
        add('error', 'claim-kind', subject,
          `A claim from "${claim.source}" has an unrecognised kind "${claim.kind}".`)
      }

      // A document claim that cannot say which document it came from provides no more
      // traceability than an anonymous one, which defeats the point of the layer.
      if (claim.layerKind === 'document' && !claim.document?.id) {
        add('warning', 'document-unattributed', `${subject}.${attribute}`,
          `"${claim.source}" is a document source but this claim carries no document reference.`,
          'The importer should attach `source.document.id`. See docs/standard.md.')
      }

      if (claim.document?.id && documentIds.size && !documentIds.has(claim.document.id)) {
        add('warning', 'document-missing', `${subject}.${attribute}`,
          `This claim points at document "${claim.document.id}", which is not among the imported documents.`,
          'The document may have been deleted from src/data/documents/.')
      }

      if (claim.confidence !== undefined) {
        if (typeof claim.confidence !== 'number' || !Number.isFinite(claim.confidence)
          || claim.confidence < 0 || claim.confidence > 1) {
          badConfidence += 1
        } else if (EVIDENCE_LAYERS.has(claim.layerKind) && claim.kind === 'reported') {
          // An API returned exactly what it returned. A probability on that is meaningless,
          // and would make genuinely uncertain extraction look no different.
          add('warning', 'confidence-on-exact', `${subject}.${attribute}`,
            `"${claim.source}" reported this from an API but attached a confidence of ${claim.confidence}.`,
            'Confidence belongs only where extraction is genuinely probabilistic — see docs/standard.md.')
        }
      }
    }
  }

  if (missingProvenance) {
    add('error', 'claim-unattributed', 'evidence',
      `${missingProvenance} claim${missingProvenance === 1 ? '' : 's'} have no source, so the values they produced cannot be traced.`)
  }
  if (badConfidence) {
    add('error', 'confidence-invalid', 'evidence',
      `${badConfidence} claim${badConfidence === 1 ? '' : 's'} carry a confidence that is not a number between 0 and 1.`)
  }

  /* Decisions --------------------------------------------------------------- */

  for (const [id, resolution] of Object.entries(resolutions)) {
    if (!resolution || typeof resolution !== 'object') {
      add('error', 'resolution-malformed', `resolutions.${id}`,
        'A resolution must be an object with a `source` or a `value`.')
      continue
    }
    if (resolution.source === undefined && resolution.value === undefined) {
      add('error', 'resolution-empty', `resolutions.${id}`,
        'A resolution names neither a source nor a value, so it decides nothing.')
      continue
    }
    if (resolution.source !== undefined && !knownSources.has(resolution.source)) {
      add('warning', 'resolution-stale', `resolutions.${id}`,
        `You chose "${resolution.source}" for this, but no current source has that id.`,
        'The source was renamed or removed. Decide again in the builder, or delete the entry.')
    }
  }

  const stale = (identity.conflicts ?? []).filter((conflict) => conflict.staleResolution)
  for (const conflict of stale) {
    add('warning', 'decision-unhonoured', conflict.subject,
      `"${conflict.label}" is showing a value you did not choose — the source you picked no longer reports it.`)
  }

  /* Documents --------------------------------------------------------------- */

  for (const doc of documents) {
    // Accepts a stored record (stable id plus versions) or a single imported document, so
    // the validator works both on disk contents and on a fresh extraction.
    const id = doc?.id ?? doc?.meta?.id
    const where = `documents.${id ?? '?'}`

    if (!id) {
      add('error', 'document-unidentified', 'documents', 'An imported document has no id.')
      continue
    }

    const versions = Array.isArray(doc.versions) ? doc.versions : [doc.meta ?? {}]

    if (Array.isArray(doc.versions)) {
      if (!versions.length) {
        add('error', 'document-empty', where, 'This document has no versions, so it contributes nothing.')
        continue
      }
      if (doc.activeVersion && !versions.some((v) => v.versionId === doc.activeVersion)) {
        // Falls back to the newest, which means the published values are not the ones the
        // user pinned — invisible unless it is said out loud.
        add('warning', 'document-active-missing', `${where}.activeVersion`,
          `The pinned version "${doc.activeVersion}" is not among this document's versions; the newest is being used instead.`)
      }
      const ids = new Set()
      for (const version of versions) {
        if (!version?.versionId) {
          add('warning', 'version-unidentified', where, 'A version has no id, so re-importing the same file cannot be recognised.')
          continue
        }
        if (ids.has(version.versionId)) {
          add('error', 'version-duplicate', where,
            `Two versions share the id "${version.versionId}"; the same content was recorded twice.`)
        }
        ids.add(version.versionId)
      }
    }

    for (const version of versions) {
      if (!version?.importedAt) {
        add('warning', 'document-undated', where,
          'This document has no import timestamp, so it cannot be weighed against fresher sources by recency.')
      }
      if (!version?.extraction || !version?.extractor) {
        add('warning', 'document-unmethod', where,
          'This document does not record how it was extracted, so its values cannot be re-examined when a better extractor exists.')
      }
      if (version?.extensions !== undefined && !isPlainObject(version.extensions)) {
        add('error', 'extensions-malformed', `${where}.extensions`,
          'Extensions must be an object keyed by name; anything else cannot round-trip.')
      }
    }

    if (doc.extensions !== undefined && !isPlainObject(doc.extensions)) {
      add('error', 'extensions-malformed', `${where}.extensions`,
        'Extensions must be an object keyed by name; anything else cannot round-trip.')
    }
  }

  return { valid: !findings.some((f) => f.level === 'error'), findings }
}

/** @param {string} key */
function splitKey(key) {
  const index = key.indexOf('|')
  return [key.slice(0, index), key.slice(index + 1)]
}

/** @param {unknown} v */
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
