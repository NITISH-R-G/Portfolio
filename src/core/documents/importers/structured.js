/**
 * JSON and YAML.
 *
 * The only importer whose output is not a guess: the file already carries the schema, so
 * nothing is inferred and its claims are `exact`. Recognises the Portfolio Standard, JSON
 * Resume, and anything already profile-shaped.
 *
 * @module core/documents/importers/structured
 */

import { EXTRACTION_CONFIDENCE } from '../types.js'
import { fromDocument } from '../../standard/document.js'
import { parseSimpleYaml } from '../yaml.js'

/** @type {import('../types.js').DocumentImporter} */
const structuredImporter = {
  id: 'structured',
  name: 'JSON / YAML',
  extensions: ['.json', '.yaml', '.yml'],
  method: 'structured',
  limits: 'The YAML reader handles nested maps and lists. Anchors, multi-line blocks and flow maps are refused rather than guessed at.',

  extract(input, ctx) {
    const text = input.text ?? new TextDecoder('utf-8').decode(input.bytes ?? new Uint8Array())
    const isYaml = /\.ya?ml$/i.test(input.filename)

    let parsed
    if (isYaml) {
      parsed = parseSimpleYaml(text)
      if (!parsed) {
        return {
          ok: false,
          reason: 'That YAML uses features this reader does not support (anchors, multi-line blocks, or flow maps).',
          hint: 'Convert it to JSON first — `npx js-yaml file.yaml > file.json` — and import that.',
        }
      }
    } else {
      try {
        parsed = JSON.parse(text)
      } catch (err) {
        return { ok: false, reason: `Not valid JSON: ${/** @type {Error} */ (err).message}` }
      }
    }

    const { profile, format, warnings } = interpret(parsed)
    if (!profile) {
      return { ok: false, reason: 'The file parsed, but contained nothing shaped like a profile.' }
    }

    // Every value came through unchanged, so each is exact rather than recognised. There is
    // no span to point at — the whole file is the evidence.
    const evidence = {}
    for (const [collection, records] of Object.entries(profile)) {
      if (!Array.isArray(records)) continue
      for (const record of records) {
        const id = record?.id ?? slug(record?.name ?? record?.title ?? record?.institution ?? record?.company)
        if (!id) continue
        for (const attribute of Object.keys(record)) {
          evidence[`${collection}/${id}|${attribute}`] = {
            section: format,
            confidence: EXTRACTION_CONFIDENCE.exact,
          }
        }
      }
    }

    return {
      ok: true,
      document: {
        meta: {
          id: ctx.documentId,
          filename: input.filename,
          type: ctx.type,
          mediaType: isYaml ? 'application/yaml' : 'application/json',
          importedAt: new Date(ctx.now).toISOString(),
          extraction: 'structured',
          extractor: `structured@1.0 (${format})`,
          bytes: input.bytes?.length,
        },
        profile,
        evidence,
        warnings,
        // Anything the schema does not model is carried rather than dropped, so importing
        // a document from another tool and exporting it again does not silently lose the
        // parts this project happens not to understand.
        extensions: parsed?.extensions,
      },
    }
  },
}

/**
 * Identify the shape by its content, not its filename — people rename these constantly.
 *
 * @param {any} parsed
 */
function interpret(parsed) {
  if (!parsed || typeof parsed !== 'object') return { profile: null, format: 'unknown', warnings: [] }

  if (parsed.schemaVersion) {
    const { profile, issues } = fromDocument(parsed)
    return {
      profile,
      format: 'Portfolio Standard',
      warnings: issues.filter((i) => i.level !== 'error').map((i) => `${i.path}: ${i.message}`),
    }
  }

  if (parsed.basics || String(parsed.$schema ?? '').includes('resume-schema')) {
    return { profile: fromJsonResume(parsed), format: 'JSON Resume', warnings: [] }
  }

  const looksLikeProfile = parsed.identity || parsed.person
    || ['experience', 'education', 'projects', 'skills'].some((key) => Array.isArray(parsed[key]))
  if (looksLikeProfile) {
    return {
      profile: parsed.person ? { ...parsed, identity: parsed.person } : parsed,
      format: 'profile',
      warnings: [],
    }
  }

  return { profile: null, format: 'unknown', warnings: [] }
}

/** @param {any} doc */
function fromJsonResume(doc) {
  const b = doc.basics ?? {}
  return {
    identity: {
      name: b.name,
      headline: b.label,
      summary: b.summary,
      avatar: b.image,
      location: [b.location?.city, b.location?.region, b.location?.countryCode]
        .filter(Boolean).join(', ') || b.location?.address,
      contact: { email: b.email, phone: b.phone, website: b.url },
    },
    socials: Object.fromEntries(
      (b.profiles ?? [])
        .filter((p) => p?.url)
        .map((p) => [String(p.network ?? 'link').toLowerCase().replace(/\s+/g, ''), p.url]),
    ),
    experience: (doc.work ?? []).map((w) => ({
      company: w.name ?? w.company,
      role: w.position,
      location: w.location,
      startDate: w.startDate,
      endDate: w.endDate,
      description: w.summary,
      highlights: w.highlights,
      links: w.url ? [{ url: w.url }] : undefined,
    })),
    education: (doc.education ?? []).map((e) => ({
      institution: e.institution,
      degree: e.studyType,
      field: e.area,
      startDate: e.startDate,
      endDate: e.endDate,
      grade: e.score,
      courses: e.courses,
    })),
    projects: (doc.projects ?? []).map((p) => ({
      name: p.name,
      description: p.description,
      technologies: p.keywords,
      liveUrl: p.url,
      date: p.startDate,
      role: p.roles?.[0],
    })),
    // JSON Resume nests keywords under a named group; this schema keeps skills flat with a
    // category, which is what lets several sources contribute evidence to the same skill.
    skills: (doc.skills ?? []).flatMap((group) =>
      (group.keywords?.length ? group.keywords : [group.name])
        .filter(Boolean)
        .map((name) => ({ name, category: group.keywords?.length ? group.name : undefined }))),
    achievements: (doc.awards ?? []).map((a) => ({
      title: a.title, organization: a.awarder, date: a.date, description: a.summary,
    })),
    certifications: (doc.certificates ?? []).map((c) => ({
      name: c.name, issuer: c.issuer, date: c.date, credentialUrl: c.url,
    })),
    publications: (doc.publications ?? []).map((p) => ({
      title: p.name, venue: p.publisher, date: p.releaseDate, url: p.url, abstract: p.summary,
    })),
    languages: (doc.languages ?? []).map((l) => ({ name: l.language, label: l.fluency })),
  }
}

const slug = (text) =>
  text ? String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) : ''

export default structuredImporter
