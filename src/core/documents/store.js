/**
 * Document identity and versioning.
 *
 * A document has a **stable identity**; each import of it is a **version**. Your résumé is
 * one thing that changes over time, not a new source every time you touch it.
 *
 * Getting this wrong is worse than it sounds. Dating the identity — `resume-2026-08`,
 * `resume-2026-09` — makes every re-import a *new source* that disagrees with the old one,
 * so updating your résumé manufactures a conflict with your previous résumé, and every
 * decision you made about the old one stops applying because it names a source that is no
 * longer contributing.
 *
 * With a stable id:
 *
 *   - re-importing identical content is recognised, not duplicated;
 *   - a modified file becomes v2 of the same source, and decisions naming it still hold;
 *   - superseded versions stay on disk, so the provenance of a value you resolved months
 *     ago can still be inspected.
 *
 * @module core/documents/store
 */

/** @typedef {import('./types.js').ImportedDocument} ImportedDocument */
/** @typedef {import('./types.js').DocumentRecord} DocumentRecord */
/** @typedef {import('./types.js').DocumentVersion} DocumentVersion */

/**
 * Fold a freshly imported document into whatever is already stored under its id.
 *
 * @param {DocumentRecord|undefined} existing
 * @param {ImportedDocument} imported
 * @returns {{record: DocumentRecord, outcome: 'created'|'updated'|'unchanged'|'restored'}}
 */
export function addVersion(existing, imported) {
  const version = toVersion(imported)
  const record = existing ? { ...existing, versions: [...(existing.versions ?? [])] } : createRecord(imported)

  const match = record.versions.findIndex((v) => v.versionId === version.versionId)

  if (match !== -1) {
    // Byte-identical to something already imported. Re-recording it would create a second
    // version that can never disagree with the first — noise with no information in it.
    const wasActive = record.activeVersion === version.versionId
    record.activeVersion = version.versionId
    // The import time is refreshed so "when did I last confirm this was current" stays
    // answerable, but nothing else about the version changes.
    record.versions[match] = { ...record.versions[match], lastSeenAt: version.importedAt }
    return { record, outcome: wasActive ? 'unchanged' : 'restored' }
  }

  // Newest first, so the active version is normally the head and history reads backwards.
  record.versions.unshift(version)
  record.activeVersion = version.versionId
  record.type = imported.meta.type ?? record.type
  record.label = record.label ?? labelFor(record.type)

  return { record, outcome: existing ? 'updated' : 'created' }
}

/**
 * @param {ImportedDocument} imported
 * @returns {DocumentRecord}
 */
function createRecord(imported) {
  return {
    id: imported.meta.id,
    label: labelFor(imported.meta.type),
    type: imported.meta.type ?? 'other',
    activeVersion: '',
    versions: [],
  }
}

/**
 * @param {ImportedDocument} imported
 * @returns {DocumentVersion}
 */
function toVersion(imported) {
  const { meta } = imported
  return compact({
    versionId: meta.versionId ?? `import:${meta.importedAt}`,
    filename: meta.filename,
    importedAt: meta.importedAt,
    mediaType: meta.mediaType,
    extraction: meta.extraction,
    extractor: meta.extractor,
    bytes: meta.bytes,
    pages: meta.pages,
    profile: imported.profile,
    evidence: imported.evidence,
    warnings: imported.warnings?.length ? imported.warnings : undefined,
    extensions: imported.extensions,
  })
}

/**
 * The version a document currently speaks with.
 *
 * Explicit rather than "the newest", so a user who imports a draft by mistake can pin the
 * previous one without deleting anything — the mistake stays on disk and stops being
 * published, which is the behaviour that makes importing safe to experiment with.
 *
 * @param {DocumentRecord|undefined} record
 * @returns {DocumentVersion|undefined}
 */
export function activeVersion(record) {
  const versions = record?.versions ?? []
  if (!versions.length) return undefined
  return versions.find((v) => v.versionId === record.activeVersion) ?? versions[0]
}

/**
 * Flatten a stored document into the layer shape `buildPortfolio` consumes.
 *
 * Only the active version contributes claims. Superseded versions remain readable on disk
 * for provenance, but a portfolio must not publish two contradictory answers from one
 * source and call it a conflict with itself.
 *
 * @param {DocumentRecord} record
 * @returns {{meta: object, profile: object, evidence?: object}|null}
 */
export function toLayer(record) {
  const version = activeVersion(record)
  if (!version?.profile) return null

  return {
    meta: {
      // The *document* id, not the version — so a decision naming this source keeps
      // applying after the résumé is updated. The version is carried alongside for
      // provenance, not identity.
      id: record.id,
      versionId: version.versionId,
      filename: version.filename,
      type: record.type,
      importedAt: version.importedAt,
      extraction: version.extraction,
      extractor: version.extractor,
      pages: version.pages,
    },
    profile: version.profile,
    evidence: version.evidence,
  }
}

/**
 * Read a stored document, accepting the flat pre-versioning shape as well.
 *
 * Old files are upgraded in memory rather than rejected: someone who imported a résumé
 * before versioning existed should not have to re-import it, and silently ignoring the file
 * would make their data disappear with no explanation.
 *
 * @param {any} raw
 * @returns {DocumentRecord|null}
 */
export function readRecord(raw) {
  if (!raw || typeof raw !== 'object') return null

  if (Array.isArray(raw.versions)) {
    if (!raw.id) return null
    return raw
  }

  // Pre-versioning shape: `{meta, profile, evidence}` with a dated id.
  if (raw.meta?.id && raw.profile) {
    const id = stableIdFrom(raw.meta)
    const { record } = addVersion(undefined, {
      ...raw,
      meta: {
        ...raw.meta,
        id,
        versionId: raw.meta.versionId ?? `legacy:${raw.meta.importedAt ?? 'unknown'}`,
      },
    })
    return record
  }

  return null
}

/**
 * Recover a stable id from a legacy dated one: `resume-2026-08` → `resume`.
 * @param {{id: string, type?: string}} meta
 */
function stableIdFrom(meta) {
  const withoutDate = String(meta.id).replace(/-\d{4}-\d{2}(-\d{2})?$/, '')
  return withoutDate || meta.type || 'document'
}

/** @param {string|undefined} type */
function labelFor(type) {
  const labels = {
    resume: 'Résumé',
    cv: 'CV',
    publications: 'Publication list',
    certificate: 'Certificate',
    profile: 'Profile export',
    other: 'Document',
  }
  return labels[type ?? 'other'] ?? 'Document'
}

/** @template {Record<string, unknown>} T @param {T} object @returns {T} */
function compact(object) {
  for (const key of Object.keys(object)) {
    if (object[key] === undefined) delete object[key]
  }
  return object
}

export { labelFor }
