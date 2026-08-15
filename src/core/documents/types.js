/**
 * The document ingestion contract.
 *
 * A résumé is not configuration. It is *evidence about* a person, obtained from a file they
 * provided, extracted by a fallible process — which puts it in the same category as an API
 * response and a very different one from something they typed. Treating it as manual input
 * would collapse that distinction and make a PDF-parsing guess indistinguishable from a
 * deliberate statement.
 *
 * So documents get their own layer kind, their own provenance, and their own evidence
 * model pointing back at the page and section a value came from.
 *
 * This file defines the interface only. Extraction quality is expected to improve — a real
 * PDF pipeline, an LLM-assisted extractor — and the point of the abstraction is that doing
 * so requires no change to the identity layer, the resolver, the schema or the UI.
 *
 * @module core/documents/types
 */

/**
 * What kind of document this is. Affects how its content is interpreted, not how it is
 * parsed — a résumé and a publication list are both text, but mean different things.
 *
 * @typedef {'resume'|'cv'|'publications'|'certificate'|'profile'|'other'} DocumentType
 */

/**
 * How the content was obtained. Recorded so that a value can be re-examined later when a
 * better extractor exists, and so a user can tell a structured import from a guess.
 *
 * - `structured` — the file already carried the schema (JSON, YAML). Not a guess at all.
 * - `markup`     — headings and lists were read from a marked-up text format.
 * - `text`       — plain prose was segmented heuristically. The most fallible route.
 * - `manual`     — a person transcribed it.
 *
 * @typedef {'structured'|'markup'|'text'|'manual'} ExtractionMethod
 */

/**
 * @typedef {object} DocumentMeta
 * @property {string} id              Stable identity, e.g. `"resume"`. Becomes the source id.
 * @property {string} [versionId]     Content hash. Identifies *this import* of the document.
 * @property {string} filename
 * @property {DocumentType} type
 * @property {string} [mediaType]     e.g. `application/pdf`.
 * @property {string} importedAt      ISO 8601.
 * @property {ExtractionMethod} extraction
 * @property {string} extractor       Which importer ran, and its version.
 * @property {number} [bytes]
 * @property {number} [pages]
 */

/**
 * A document as stored: one stable identity, many versions.
 *
 * The separation is the whole point. `id` is what a claim is attributed to and what a user's
 * conflict decision names, so it must not change when the file does. `activeVersion` is
 * which import currently speaks. Superseded versions stay on disk so the provenance of a
 * value resolved months ago is still inspectable.
 *
 * @typedef {object} DocumentRecord
 * @property {string} id
 * @property {string} label
 * @property {DocumentType} type
 * @property {string} activeVersion   The `versionId` currently contributing claims.
 * @property {DocumentVersion[]} versions  Newest first.
 */

/**
 * One import of a document.
 *
 * @typedef {object} DocumentVersion
 * @property {string} versionId       Content hash of the file's bytes.
 * @property {string} filename
 * @property {string} importedAt      ISO 8601.
 * @property {string} [lastSeenAt]    When this exact content was last re-imported.
 * @property {string} [mediaType]
 * @property {ExtractionMethod} extraction
 * @property {string} extractor
 * @property {number} [bytes]
 * @property {number} [pages]
 * @property {object} profile
 * @property {Record<string, DocumentSpan>} [evidence]
 * @property {string[]} [warnings]
 * @property {Record<string, unknown>} [extensions]
 */

/**
 * An imported document: its metadata, what was extracted, and what went wrong.
 *
 * The profile and the evidence are kept apart rather than interleaved so the profile stays
 * exactly the shape every other source produces. A document is not a special case in the
 * pipeline; it is a source that happens to know more about where its values came from.
 *
 * @typedef {object} ImportedDocument
 * @property {DocumentMeta} meta
 * @property {object} profile                       Profile-shaped extraction result.
 * @property {Record<string, DocumentSpan>} [evidence]
 *   `"subject|attribute"` → where in the document that value was read.
 * @property {string[]} [warnings]                  Non-fatal extraction problems.
 * @property {Record<string, unknown>} [extensions] Anything the schema does not model.
 */

/**
 * @typedef {object} DocumentSpan
 * @property {number} [page]
 * @property {string} [section]
 * @property {string} [heading]
 * @property {string} [text]
 * @property {number} [line]
 * @property {number} [confidence]  0–1, only if the extractor can genuinely produce one.
 */

/**
 * The result of running an importer.
 *
 * `ok: false` is a normal outcome, not an exception: a scanned PDF genuinely cannot be read
 * without OCR, and saying so plainly is more useful than throwing or — far worse —
 * returning plausible-looking garbage.
 *
 * @typedef {{ok: true, document: ImportedDocument} | {ok: false, reason: string, hint?: string}} ImportResult
 */

/**
 * A document importer.
 *
 * @typedef {object} DocumentImporter
 * @property {string} id
 * @property {string} name
 * @property {string[]} extensions        File extensions it claims, e.g. `['.md', '.txt']`.
 * @property {ExtractionMethod} method
 * @property {string} [limits}            What it cannot do. Shown to the user verbatim.
 * @property {(input: ImporterInput) => boolean} [detect]
 *   Content-based detection, for files whose extension lies. Beats extension matching.
 * @property {(input: ImporterInput, ctx: ImporterContext) => Promise<ImportResult>|ImportResult} extract
 */

/**
 * @typedef {object} ImporterInput
 * @property {string} filename
 * @property {Uint8Array} [bytes]   Present for binary formats.
 * @property {string} [text]        Present when the caller already has decoded text.
 */

/**
 * Services handed to an importer. Passing them in keeps importers pure and testable, and
 * keeps the clock out of extraction so a test can assert on an exact document id.
 *
 * @typedef {object} ImporterContext
 * @property {string} documentId
 * @property {DocumentType} type
 * @property {number} now
 * @property {(message: string) => void} warn
 */

/**
 * Confidence values an extractor may report, as named tiers rather than invented decimals.
 *
 * A heuristic extractor cannot compute a calibrated probability, and writing `0.94` because
 * it looks precise would be fabrication. What it *can* say is how the value was recognised:
 * a line under an "Experience" heading matching `Role, Company` is a stronger signal than a
 * bare line of prose. These tiers encode that, and each maps to a number only so the values
 * can be compared and displayed.
 *
 * A future extractor that genuinely produces calibrated probabilities may report those
 * directly instead.
 */
export const EXTRACTION_CONFIDENCE = {
  /** The file carried the schema. Nothing was inferred. */
  exact: 1,
  /** Matched a strong structural pattern — a dated role line under an Experience heading. */
  strong: 0.9,
  /** Matched a heading or list structure, but the value itself was read loosely. */
  moderate: 0.7,
  /** Segmented out of prose. Plausible, and worth a person's review. */
  weak: 0.5,
}

export {}
