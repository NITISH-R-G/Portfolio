/**
 * Document ingestion.
 *
 * Picks an importer, runs it, and attaches provenance to everything it produced. The
 * provenance step is the part that matters: an extracted value without a pointer back to
 * the page it came from is indistinguishable from something a person typed, and the whole
 * distinction this layer exists to preserve would be lost at the moment of import.
 *
 * Deliberately not a "résumé system". A résumé is one `DocumentType`; a publication list or
 * a certificate is another. All of them converge on the same claim model as an API
 * connector, which is why the resolver needs no knowledge that documents exist.
 *
 * @module core/documents/ingest
 */

import textImporter from './importers/text.js'
import structuredImporter from './importers/structured.js'
import docxImporter from './importers/docx.js'
import pdfImporter from './importers/pdf.js'

/**
 * Ordered so that content-based detection runs before extension matching — a `.txt` that is
 * actually JSON should be read as JSON.
 *
 * @type {import('./types.js').DocumentImporter[]}
 */
export const IMPORTERS = [structuredImporter, pdfImporter, docxImporter, textImporter]

/**
 * Choose an importer for a file.
 *
 * @param {import('./types.js').ImporterInput} input
 * @returns {import('./types.js').DocumentImporter|undefined}
 */
export function importerFor(input) {
  const detected = IMPORTERS.find((importer) => importer.detect?.(input))
  if (detected) return detected

  const extension = extensionOf(input.filename)
  return IMPORTERS.find((importer) => importer.extensions.includes(extension))
}

/**
 * Ingest one document.
 *
 * Never throws. An importer that cannot read a file returns a reason, which is a normal
 * outcome — a scanned PDF genuinely cannot be read, and saying so is more useful than an
 * exception or, far worse, plausible-looking garbage.
 *
 * @param {import('./types.js').ImporterInput} input
 * @param {{id?: string, type?: import('./types.js').DocumentType, now?: number}} [options]
 * @returns {Promise<import('./types.js').ImportResult>}
 */
export async function ingestDocument(input, options = {}) {
  const importer = importerFor(input)
  if (!importer) {
    return {
      ok: false,
      reason: `No importer handles "${extensionOf(input.filename) || 'that file type'}".`,
      hint: `Supported: ${[...new Set(IMPORTERS.flatMap((i) => i.extensions))].filter(Boolean).join(', ')}.`,
    }
  }

  const now = options.now ?? Date.now()
  const type = options.type ?? inferType(input.filename)
  const documentId = options.id ?? defaultDocumentId(input.filename, type, now)
  const versionId = options.versionId ?? await contentHash(input)

  /** @type {string[]} */
  const warnings = []

  let result
  try {
    result = await importer.extract(input, {
      documentId,
      type,
      now,
      warn: (message) => warnings.push(message),
    })
  } catch (err) {
    return {
      ok: false,
      reason: `${importer.name} failed to read the file: ${/** @type {Error} */ (err).message}`,
    }
  }

  if (!result?.ok) {
    return result ?? { ok: false, reason: `${importer.name} produced no result.` }
  }

  const document = result.document
  document.warnings = [...(document.warnings ?? []), ...warnings]

  // The version is stamped here rather than in each importer: it is a property of the
  // *bytes*, not of how they were read, and computing it centrally is what makes
  // "you have already imported this file" reliable across every format.
  document.meta = { ...document.meta, id: documentId, versionId }

  // Provenance is attached here for the same reason — every format gets it identically, and
  // an importer author cannot forget.
  document.profile = attachProvenance(document.profile, document.meta, document.evidence)

  return { ok: true, document }
}

/**
 * A content hash, so re-importing the same file is recognised rather than duplicated.
 *
 * Over the raw bytes, not the extraction: two runs of a better extractor over one file
 * should still be the same *version* of that document. What changed there is this project,
 * not the evidence.
 *
 * @param {import('./types.js').ImporterInput} input
 * @returns {Promise<string>}
 */
export async function contentHash(input) {
  const bytes = input.bytes ?? new TextEncoder().encode(input.text ?? '')
  try {
    const { createHash } = await import('node:crypto')
    return `sha256:${createHash('sha256').update(Buffer.from(bytes)).digest('hex').slice(0, 32)}`
  } catch {
    // No crypto (an exotic runtime); a weaker digest still distinguishes edits, which is
    // all this is used for. It is not a security boundary.
    let hash = 5381
    for (const byte of bytes) hash = (((hash << 5) + hash) ^ byte) >>> 0
    return `len${bytes.length}:${hash.toString(16)}`
  }
}

/**
 * Stamp every record with where it came from, and where in the document.
 *
 * @param {any} profile
 * @param {import('./types.js').DocumentMeta} meta
 * @param {Record<string, import('./types.js').DocumentSpan>} [evidence]
 */
export function attachProvenance(profile, meta, evidence = {}) {
  if (!profile || typeof profile !== 'object') return profile

  /** @type {Record<string, any>} */
  const out = {}

  for (const [collection, value] of Object.entries(profile)) {
    if (!Array.isArray(value)) { out[collection] = value; continue }

    out[collection] = value.map((record) => {
      if (!record || typeof record !== 'object') return record

      const id = record.id ?? slug(record.name ?? record.title ?? record.institution ?? record.company ?? record.platform)
      const span = spanFor(evidence, `${collection}/${id}`)

      return {
        ...record,
        source: {
          // The stable document id, so a decision naming this source survives the next
          // version of the file. The version is recorded inside `document` for provenance.
          connector: meta.id,
          document: {
            id: meta.id,
            ...(meta.versionId ? { versionId: meta.versionId } : {}),
            filename: meta.filename,
            ...(span?.page !== undefined ? { page: span.page } : {}),
            ...(span?.section ? { section: span.section } : {}),
            ...(span?.heading ? { heading: span.heading } : {}),
            ...(span?.text ? { text: span.text } : {}),
            ...(span?.line !== undefined ? { line: span.line } : {}),
          },
          // Only present when the extractor could genuinely produce one. A structured
          // import reports `exact`; a line segmented out of prose reports far less. No
          // number is invented for a value whose extraction confidence is unknown.
          ...(span?.confidence !== undefined ? { confidence: span.confidence } : {}),
          // Deliberately no `fetchedAt`: nothing was fetched. Its absence is what keeps a
          // document-derived figure from being labelled as platform-reported downstream.
        },
      }
    })
  }

  return out
}

/**
 * The evidence recorded for a subject — any attribute's span will do for record-level
 * provenance, and the most specific one is preferred.
 *
 * @param {Record<string, import('./types.js').DocumentSpan>} evidence
 * @param {string} subject
 */
function spanFor(evidence, subject) {
  const prefix = `${subject}|`
  /** @type {import('./types.js').DocumentSpan|undefined} */
  let best
  for (const [key, span] of Object.entries(evidence)) {
    if (!key.startsWith(prefix)) continue
    if (!best) { best = span; continue }
    // Prefer the span that knows the most about where it was.
    if (score(span) > score(best)) best = span
  }
  return best
}

/** @param {import('./types.js').DocumentSpan} span */
const score = (span) =>
  (span.page !== undefined ? 2 : 0) + (span.section ? 2 : 0) + (span.text ? 1 : 0) + (span.line !== undefined ? 1 : 0)

/**
 * The stable identity of a document.
 *
 * Derived from its *type*, not its filename or the date: `resume.pdf`, `resume-final.pdf`
 * and `resume-v3-ACTUAL-final.pdf` are one résumé that a person kept editing, and treating
 * them as three sources would have your résumé arguing with itself.
 *
 * Someone who genuinely maintains two — an academic CV and an industry résumé — gets them
 * apart through the type (`cv` versus `resume`), or by passing an explicit id.
 *
 * @param {string} filename
 * @param {import('./types.js').DocumentType} type
 * @returns {string}
 */
export function defaultDocumentId(filename, type) {
  return type || slug(filename.replace(/\.[^.]+$/, '')) || 'document'
}

/** @param {string} filename */
function inferType(filename) {
  const name = filename.toLowerCase()
  if (/\bcv\b/.test(name)) return 'cv'
  if (/resum|cv/.test(name)) return 'resume'
  if (/publication|paper|biblio/.test(name)) return 'publications'
  if (/cert/.test(name)) return 'certificate'
  if (/portfolio|profile/.test(name)) return 'profile'
  return 'resume'
}

/** @param {string} filename */
function extensionOf(filename) {
  const match = /\.[^./\\]+$/.exec(String(filename ?? ''))
  return match ? match[0].toLowerCase() : ''
}

const slug = (text) =>
  text
    ? String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
    : ''

export { extensionOf, inferType }
