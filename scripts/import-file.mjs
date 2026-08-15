#!/usr/bin/env node
/**
 * `npm run import:file -- <path>` — bring a document into your profile.
 *
 * A résumé is **not** configuration. It is evidence about you, obtained from a file,
 * extracted by a fallible process — the same category as an API response, and a very
 * different one from something you typed. So it becomes its own source with its own
 * provenance, not a merge into `manual.json`.
 *
 * That distinction is what lets a six-month-old résumé and a LinkedIn profile synced this
 * morning disagree *visibly*, and be resolved once by the only person who knows which is
 * right.
 *
 * Understands:
 *   .pdf    text-based PDFs (see the importer's limits — .docx works far better)
 *   .docx   Word documents, including heading styles
 *   .md     Markdown résumés, read by their headings
 *   .txt    plain text
 *   .json   Portfolio Standard, JSON Resume, or any profile-shaped object
 *   .yaml   the same shapes in YAML
 *   .zip    a LinkedIn data export
 *
 * @module scripts/import-file
 */

import { ingestDocument, defaultDocumentId } from '../src/core/documents/ingest.js'
import { readZip } from '../src/core/documents/zip.js'
import { addVersion, readRecord } from '../src/core/documents/store.js'
import { normalizeProfile } from '../src/core/schema/profile.js'
import { mergeProfiles } from '../src/core/schema/merge.js'
import { COLLECTIONS } from '../src/core/schema/types.js'
import { PATHS, writeJson, relative, fs, path } from './lib/portfolio.mjs'
import { bold, dim, green, say, ok, warn, fail, info, rule, wrapText, confirm, closePrompt } from './lib/ui.mjs'

async function main() {
  const args = process.argv.slice(2)
  const target = args.find((a) => !a.startsWith('-'))
  const asManual = args.includes('--manual')

  if (!target) {
    say()
    say(bold('Usage: npm run import:file -- <path>'))
    say(wrapText(
      'Accepts a PDF, Word document, Markdown or text résumé, a JSON Resume, a Portfolio '
      + 'Standard document, a YAML profile, or a LinkedIn data export (.zip).',
      2,
    ))
    say()
    say(dim(wrapText('--manual   merge into src/data/manual.json instead of creating a document source.', 2)))
    return 1
  }

  const file = path.resolve(target)
  if (!fs.existsSync(file)) {
    fail(`No such file: ${target}`)
    return 1
  }

  say()
  rule(`Importing ${path.basename(file)}`)

  const bytes = fs.readFileSync(file)
  const filename = path.basename(file)

  // A LinkedIn export is an archive of CSVs rather than one document, so it is unpacked
  // into a single document source made of its parts.
  const result = /\.zip$/i.test(filename)
    ? await ingestLinkedInExport(bytes, filename)
    : await ingestDocument({ filename, bytes })

  if (!result.ok) {
    fail(result.reason)
    if (result.hint) say(wrapText(result.hint, 2))
    return 1
  }

  const document = result.document
  const counts = countOf(normalizeProfile(document.profile))
  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  info(`Read as ${bold(document.meta.extractor)} (${document.meta.extraction}).`)

  if (!total && !document.profile.identity?.name) {
    fail('Nothing usable was found in that file.')
    say(wrapText('See docs/data-schema.md for the shape this expects, or docs/standard.md for the document format.', 2))
    return 1
  }

  say()
  for (const [collection, n] of Object.entries(counts)) {
    say(`  ${String(n).padStart(4)} ${collection}`)
  }
  if (document.profile.identity?.name) say(`  ${dim('identity')} ${document.profile.identity.name}`)

  for (const warning of document.warnings ?? []) say(dim(wrapText(`· ${warning}`, 2)))

  if (asManual) return writeAsManual(document)

  /* Store it as a version of its document ------------------------------------ */

  const store = path.join(PATHS.documents, `${document.meta.id}.json`)
  const existing = readRecord(readJsonSafe(store))
  const { record, outcome } = addVersion(existing, document)

  if (outcome === 'unchanged') {
    // Byte-identical to what is already active. Recording it again would create a version
    // that can never disagree with the one before it — noise with no information in it.
    say()
    ok(`Already imported — this file is identical to the active version of ${bold(record.label)}.`)
    say(dim(`  ${relative(store)} was left unchanged.`))
    return 0
  }

  writeJson(store, record)

  say()
  if (outcome === 'created') {
    ok(`Wrote ${relative(store)}`)
    say(dim(wrapText(
      'This is a source in its own right, like a connector. Its claims sit alongside your '
      + 'other sources and can be traced back to the page and section they came from.',
      0,
    )))
  } else if (outcome === 'restored') {
    ok(`Switched ${bold(record.label)} back to a version you had imported before.`)
  } else {
    ok(`Added version ${bold(String(record.versions.length))} of ${bold(record.label)} — ${relative(store)}`)
    say(dim(wrapText(
      'The earlier version is kept for provenance but no longer contributes. Because the '
      + 'document keeps one stable id, any conflict decisions naming it still apply.',
      0,
    )))
  }

  say()
  say(`  ${green('1.')} ${bold('npm run doctor')}  ${dim('see what it contributed, and any conflicts')}`)
  say(`  ${green('2.')} ${bold('npm run dev')}     ${dim('resolve conflicts at /admin.html#conflicts')}`)
  return 0
}

/**
 * The `--manual` path: fold the extraction into hand-written data instead.
 *
 * Kept because it is occasionally what someone wants — a one-off transcription they intend
 * to edit by hand — but it is not the default, because it discards the provenance that
 * makes the value traceable and conflict-resolvable.
 *
 * @param {import('../src/core/documents/types.js').ImportedDocument} document
 */
async function writeAsManual(document) {
  const existing = readJsonSafe(PATHS.manual)
  const hasExisting = existing && Object.keys(existing).length > 0

  say()
  warn('Importing as manual data discards the document provenance — the values will read as '
    + 'things you stated rather than as extracted from a file, and cannot raise conflicts.')

  if (hasExisting) {
    warn(`${relative(PATHS.manual)} already has data; the two will be merged.`)
  }
  if (!await confirm('Continue?', false)) {
    say(dim('Nothing was written.'))
    return 0
  }

  if (hasExisting) {
    const backup = `${PATHS.manual}.backup`
    fs.copyFileSync(PATHS.manual, backup)
    info(`Backed up to ${relative(backup)}.`)
  }

  const incoming = normalizeProfile(stripProvenance(document.profile))
  const merged = hasExisting ? mergeProfiles(existing, incoming) : incoming
  writeJson(PATHS.manual, stripEmpty(merged))

  say()
  ok(`Wrote ${relative(PATHS.manual)}.`)
  return 0
}

/* -------------------------------------------------------------------------- */
/* LinkedIn export                                                             */
/* -------------------------------------------------------------------------- */

/**
 * LinkedIn's own data export — the route LinkedIn provides, and the only permitted way to
 * get this data.
 *
 * The archive's CSVs are read into one document source rather than several, because they
 * describe one export at one moment: splitting them would produce four sources that always
 * agree, and four times the conflict noise if they ever did not.
 *
 * @param {Buffer} bytes
 * @param {string} filename
 * @returns {Promise<import('../src/core/documents/types.js').ImportResult>}
 */
async function ingestLinkedInExport(bytes, filename) {
  const entries = readZip(bytes)
  if (!entries.length) {
    return {
      ok: false,
      reason: 'That .zip could not be read, or is empty.',
      hint: 'Unzip it yourself and import the individual CSV files.',
    }
  }

  const wanted = /(positions|education|skills|certifications|profile)\.csv$/i
  const layers = []
  const seen = []
  const evidence = {}

  for (const entry of entries) {
    if (!wanted.test(entry.name)) continue
    const text = await entry.text()
    if (!text) continue
    const base = path.basename(entry.name)
    seen.push(base)
    const parsed = parseLinkedInCsv(text, base)
    layers.push(normalizeProfile(parsed))

    for (const [collection, records] of Object.entries(parsed)) {
      if (!Array.isArray(records)) continue
      for (const record of records) {
        const id = slug(record.company ?? record.institution ?? record.name)
        if (!id) continue
        // The CSV filename is the closest thing an export has to a section.
        evidence[`${collection}/${id}|@record`] = { section: base }
      }
    }
  }

  if (!layers.length) {
    return {
      ok: false,
      reason: 'No Positions.csv, Education.csv, Skills.csv or Certifications.csv was found in that archive.',
      hint: `Files present: ${entries.slice(0, 12).map((e) => path.basename(e.name)).join(', ')}`,
    }
  }

  info(`Read ${seen.join(', ')}.`)

  const now = Date.now()
  const id = defaultDocumentId(filename, 'profile', now)
  const profile = mergeProfiles(...layers)

  const { attachProvenance } = await import('../src/core/documents/ingest.js')
  const meta = {
    id,
    filename,
    type: /** @type {const} */ ('profile'),
    mediaType: 'application/zip',
    importedAt: new Date(now).toISOString(),
    extraction: /** @type {const} */ ('structured'),
    extractor: 'linkedin-export@1.0',
    bytes: bytes.length,
  }

  return {
    ok: true,
    document: {
      meta,
      // A CSV export is a table, not prose: nothing was inferred, so the claims are exact.
      profile: attachProvenance(profile, meta, evidence),
      evidence,
      warnings: [],
    },
  }
}

/**
 * @param {string} text
 * @param {string} name
 */
function parseLinkedInCsv(text, name) {
  const rows = parseCsv(text)
  if (!rows.length) return {}

  const file = name.toLowerCase()
  const get = (row, ...keys) => {
    for (const key of keys) {
      const found = Object.keys(row).find(
        (k) => k.toLowerCase().replace(/\s+/g, '') === key.toLowerCase().replace(/\s+/g, ''),
      )
      if (found && row[found]) return row[found]
    }
    return undefined
  }

  if (file.startsWith('positions')) {
    return {
      experience: rows.map((row) => ({
        company: get(row, 'Company Name'),
        role: get(row, 'Title'),
        location: get(row, 'Location'),
        startDate: get(row, 'Started On'),
        endDate: get(row, 'Finished On'),
        description: get(row, 'Description'),
      })).filter((r) => r.company),
    }
  }

  if (file.startsWith('education')) {
    return {
      education: rows.map((row) => ({
        institution: get(row, 'School Name'),
        degree: get(row, 'Degree Name'),
        field: get(row, 'Notes'),
        startDate: get(row, 'Start Date'),
        endDate: get(row, 'End Date'),
      })).filter((r) => r.institution),
    }
  }

  if (file.startsWith('skills')) {
    return { skills: rows.map((row) => ({ name: get(row, 'Name') })).filter((s) => s.name) }
  }

  if (file.startsWith('certifications')) {
    return {
      certifications: rows.map((row) => ({
        name: get(row, 'Name'),
        issuer: get(row, 'Authority'),
        date: get(row, 'Started On'),
        credentialUrl: get(row, 'Url'),
      })).filter((c) => c.name),
    }
  }

  if (file.startsWith('profile')) {
    const row = rows[0] ?? {}
    return {
      identity: {
        name: [get(row, 'First Name'), get(row, 'Last Name')].filter(Boolean).join(' '),
        headline: get(row, 'Headline'),
        summary: get(row, 'Summary'),
        location: get(row, 'Geo Location'),
      },
    }
  }

  return {}
}

/**
 * RFC 4180 CSV with quoted fields and embedded newlines — all of which LinkedIn exports
 * contain, since a job description routinely has commas and line breaks in it.
 *
 * @param {string} text
 * @returns {Record<string, string>[]}
 */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  const body = text.replace(/^﻿/, '')

  for (let i = 0; i < body.length; i += 1) {
    const char = body[i]

    if (quoted) {
      if (char === '"') {
        if (body[i + 1] === '"') { field += '"'; i += 1 }
        else quoted = false
      } else field += char
      continue
    }

    if (char === '"') { quoted = true; continue }
    if (char === ',') { row.push(field); field = ''; continue }
    if (char === '\r') continue
    if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
    field += char
  }
  if (field || row.length) { row.push(field); rows.push(row) }

  const [header, ...rest] = rows.filter((r) => r.some((c) => c.trim()))
  if (!header) return []

  return rest.map((values) =>
    Object.fromEntries(header.map((key, i) => [key.trim(), (values[i] ?? '').trim()])))
}

/* -------------------------------------------------------------------------- */

function countOf(profile) {
  const counts = {}
  for (const collection of COLLECTIONS) {
    const value = profile[collection]
    if (Array.isArray(value) && value.length) counts[collection] = value.length
  }
  return counts
}

/** Manual data is authored by the user, so carrying a document's provenance would be a lie. */
function stripProvenance(profile) {
  const out = {}
  for (const [key, value] of Object.entries(profile ?? {})) {
    out[key] = Array.isArray(value)
      ? value.map(({ source: _source, ...rest }) => rest)
      : value
  }
  return out
}

function stripEmpty(profile) {
  const out = {}
  for (const [key, value] of Object.entries(profile)) {
    if (Array.isArray(value)) { if (value.length) out[key] = value; continue }
    if (value && typeof value === 'object') {
      const inner = stripEmpty(value)
      if (Object.keys(inner).length) out[key] = inner
      continue
    }
    if (value !== undefined && value !== '') out[key] = value
  }
  return out
}

function readJsonSafe(file) {
  if (!fs.existsSync(file)) return undefined
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return undefined }
}

const slug = (text) =>
  text ? String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) : ''

main()
  .then((code) => { closePrompt(); process.exit(code ?? 0) })
  .catch((err) => {
    closePrompt()
    say()
    fail(`Import failed: ${err.message}`)
    say(dim(err.stack?.split('\n').slice(1, 4).join('\n') ?? ''))
    process.exit(1)
  })
