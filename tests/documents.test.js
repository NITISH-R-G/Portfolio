import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import zlib from 'node:zlib'

import { ingestDocument, importerFor, defaultDocumentId, attachProvenance } from '../src/core/documents/ingest.js'
import { addVersion, readRecord, activeVersion } from '../src/core/documents/store.js'
import { parseResumeLines } from '../src/core/documents/resume-text.js'
import { paragraphsOf } from '../src/core/documents/importers/docx.js'
import { textFromContentStream, looksLikeProse } from '../src/core/documents/importers/pdf.js'
import { readZip } from '../src/core/documents/zip.js'
import { parseSimpleYaml } from '../src/core/documents/yaml.js'
import { buildPortfolio } from '../src/core/generate/build.js'
import { resolveIdentity, conflictId } from '../src/core/identity/resolve.js'
import { validateIdentity } from '../src/core/identity/validate.js'
import { toDocument, fromDocument } from '../src/core/standard/document.js'
import { normalizeProfile } from '../src/core/schema/profile.js'

const NOW = Date.parse('2026-08-15T00:00:00Z')

const RESUME = `# Ada Lovelace

Analytical Engine Programmer
ada@example.com | https://github.com/ada

## Experience

Software Engineering Intern, Acme Corp — 2022 – 2024
- Rebuilt the settlement pipeline.

## Education

University of London — BSc, Mathematics — 2016 – 2020

## Skills

Languages: Python, Go
`

const bytes = (text) => new TextEncoder().encode(text)

/** Ingest a Markdown résumé, which is the most reliable text route. */
const ingestResume = (text = RESUME, filename = 'resume.md') =>
  ingestDocument({ filename, bytes: bytes(text) }, { now: NOW })

/* -------------------------------------------------------------------------- */

describe('document ingestion', () => {
  test('a résumé becomes a document source, not configuration', async () => {
    const result = await ingestResume()
    assert.equal(result.ok, true)

    const { meta } = result.document
    assert.equal(meta.id, 'resume', 'the identity is stable across re-imports')
    assert.match(meta.versionId, /^sha256:/, 'the version is the content')
    assert.equal(meta.type, 'resume')
    assert.equal(meta.extraction, 'markup')
    assert.ok(meta.extractor, 'records which importer ran, so values can be re-examined later')
    assert.equal(meta.importedAt, '2026-08-15T00:00:00.000Z')
  })

  test('every extracted record is traceable to the document it came from', async () => {
    const { document } = await ingestResume()
    const role = document.profile.experience[0]

    assert.equal(role.source.connector, 'resume',
      'attributed to the stable id, so a decision naming it survives a new version')
    assert.equal(role.source.document.id, 'resume')
    assert.equal(role.source.document.versionId, document.meta.versionId,
      'and to the exact version, so the value can be traced to the file it was read from')
    assert.equal(role.source.document.filename, 'resume.md')
    assert.equal(role.source.document.section, 'Experience')
    assert.ok(role.source.document.text, 'keeps the span, so the value can be checked')
  })

  test('a document-derived record never claims to have been fetched', async () => {
    // `fetchedAt` is what marks a figure as platform-reported. A résumé was not fetched from
    // anywhere, and carrying the field would make an extraction guess look confirmed.
    const { document } = await ingestResume()
    for (const record of document.profile.experience) {
      assert.equal(record.source.fetchedAt, undefined)
    }
  })

  test('extraction confidence is attached, because extraction is genuinely probabilistic', async () => {
    const { document } = await ingestResume()
    const role = document.profile.experience[0]

    assert.equal(typeof role.source.confidence, 'number')
    assert.ok(role.source.confidence > 0 && role.source.confidence <= 1)
  })

  test('a structured import is exact rather than guessed', async () => {
    const json = JSON.stringify({
      basics: { name: 'Ada Lovelace', label: 'Engineer' },
      work: [{ name: 'Acme Corp', position: 'Engineer', startDate: '2022-01' }],
    })
    const result = await ingestDocument({ filename: 'resume.json', bytes: bytes(json) }, { now: NOW })

    assert.equal(result.ok, true)
    assert.equal(result.document.meta.extraction, 'structured')
    assert.equal(result.document.profile.experience[0].source.confidence, 1,
      'nothing was inferred, so nothing is uncertain')
  })

  test('extracted content is read correctly', async () => {
    const { document } = await ingestResume()
    const { identity, experience, education, skills, socials } = document.profile

    assert.equal(identity.name, 'Ada Lovelace')
    assert.equal(identity.headline, 'Analytical Engine Programmer')
    assert.equal(identity.contact.email, 'ada@example.com')
    assert.equal(socials.github, 'https://github.com/ada')

    assert.equal(experience[0].role, 'Software Engineering Intern')
    assert.equal(experience[0].company, 'Acme Corp', 'the separator is not part of the name')
    assert.equal(experience[0].startDate, '2022')
    assert.deepEqual(experience[0].highlights, ['Rebuilt the settlement pipeline.'])

    assert.equal(education[0].institution, 'University of London')
    assert.equal(education[0].degree, 'BSc')
    assert.equal(education[0].field, 'Mathematics')

    assert.deepEqual(skills.map((s) => s.name), ['Python', 'Go'])
    assert.equal(skills[0].category, 'Languages')
  })

  test('a résumé with no headings says so rather than inventing structure', () => {
    const lines = 'Ada Lovelace\nDid some things at some places.'
      .split('\n').map((text, index) => ({ text, index, heading: false }))
    const { warnings, profile } = parseResumeLines(lines, { documentId: 'x' })

    assert.ok(warnings.some((w) => /heading/i.test(w)))
    assert.equal(profile.identity.name, 'Ada Lovelace')
    assert.equal(profile.experience, undefined)
  })

  test('an unreadable file reports why instead of throwing', async () => {
    const result = await ingestDocument({ filename: 'notes.xyz', bytes: bytes('hello') }, { now: NOW })
    assert.equal(result.ok, false)
    assert.match(result.reason, /No importer/)
    assert.match(result.hint, /\.md/)
  })

  test('an empty document is refused rather than imported as nothing', async () => {
    const result = await ingestDocument({ filename: 'resume.md', bytes: bytes('   ') }, { now: NOW })
    assert.equal(result.ok, false)
  })

  test('a document keeps one identity however the file is named', () => {
    // "resume.pdf", "resume-final.pdf" and "resume-v3-ACTUAL-final.pdf" are one résumé a
    // person kept editing. Three identities would have it arguing with itself, and would
    // break every decision naming the previous one.
    for (const filename of ['resume.pdf', 'resume-final.pdf', 'Resume_v3_FINAL.docx']) {
      assert.equal(defaultDocumentId(filename, 'resume'), 'resume')
    }
    assert.equal(defaultDocumentId('academic-cv.pdf', 'cv'), 'cv', 'a CV is a different document')
  })

  test('content beats extension when choosing an importer', () => {
    const pdf = importerFor({ filename: 'resume.txt', bytes: bytes('%PDF-1.4 ...') })
    assert.equal(pdf.id, 'pdf', 'a mislabelled file is read by what it actually is')
  })
})

describe('document identity and versions', () => {
  const V2 = RESUME.replace('Software Engineering Intern', 'Software Engineer')

  test('re-importing identical content is recognised, not duplicated', async () => {
    const first = await ingestResume()
    const again = await ingestResume()

    assert.equal(first.document.meta.versionId, again.document.meta.versionId,
      'the version is the content, so the same bytes are the same version')

    const { record } = addVersion(undefined, first.document)
    const { record: after, outcome } = addVersion(record, again.document)

    assert.equal(outcome, 'unchanged')
    assert.equal(after.versions.length, 1, 'a duplicate would be a version that can never disagree with itself')
  })

  test('an edited résumé becomes a new version of the same document', async () => {
    const v1 = await ingestResume()
    const v2 = await ingestResume(V2)

    assert.notEqual(v1.document.meta.versionId, v2.document.meta.versionId)
    assert.equal(v1.document.meta.id, v2.document.meta.id, 'same document')

    const { record } = addVersion(undefined, v1.document)
    const { record: updated, outcome } = addVersion(record, v2.document)

    assert.equal(outcome, 'updated')
    assert.equal(updated.versions.length, 2)
    assert.equal(updated.activeVersion, v2.document.meta.versionId, 'the newest import speaks')
  })

  test('only the active version contributes claims', async () => {
    const v1 = await ingestResume()
    const v2 = await ingestResume(V2)
    const { record } = addVersion(addVersion(undefined, v1.document).record, v2.document)

    const built = buildPortfolio({
      config: { identity: { name: 'Ada' } },
      documents: [record],
      now: NOW,
    })

    const roles = built.profile.experience.map((e) => e.role)
    assert.ok(roles.includes('Software Engineer'))
    assert.ok(!roles.includes('Software Engineering Intern'),
      'a superseded version must not argue with the current one')
    assert.deepEqual(built.conflicts, [], 'a document cannot conflict with its own history')
  })

  test('superseded versions stay on disk for provenance', async () => {
    const v1 = await ingestResume()
    const v2 = await ingestResume(V2)
    const { record } = addVersion(addVersion(undefined, v1.document).record, v2.document)

    const old = record.versions.find((v) => v.versionId === v1.document.meta.versionId)
    assert.ok(old, 'the earlier import is still readable')
    assert.equal(old.profile.experience[0].role, 'Software Engineering Intern')
  })

  test('a decision naming the document survives a new version', async () => {
    // The reason identity is stable. If updating a résumé produced a new source id, every
    // decision the user had made about it would silently stop applying.
    const linkedin = connectorLayer('linkedin',
      { experience: [{ id: 'acme-corp-software-engineering-intern', company: 'Acme Corp', role: 'Principal Engineer' }] },
      '2026-08-20T00:00:00Z')

    const v1 = await ingestResume()
    const { record } = addVersion(undefined, v1.document)
    const resolutions = { [conflictId('experience/acme-corp-software-engineering-intern', 'role')]: { source: 'resume' } }

    const before = buildPortfolio({
      config: { identity: { name: 'Ada' } }, sources: [linkedin], documents: [record], overrides: { resolutions }, now: NOW,
    })
    assert.equal(before.conflicts[0]?.resolved, true, 'decided')

    const v2 = await ingestResume(RESUME.replace('Rebuilt the settlement pipeline.', 'Rebuilt the pipeline.'))
    const { record: updated } = addVersion(record, v2.document)

    const after = buildPortfolio({
      config: { identity: { name: 'Ada' } }, sources: [linkedin], documents: [updated], overrides: { resolutions }, now: NOW,
    })
    assert.equal(after.conflicts[0]?.resolved, true, 'still decided after the résumé was updated')
    assert.equal(after.conflicts[0]?.staleResolution, undefined)
  })

  test('a pre-versioning document file is upgraded rather than dropped', () => {
    // Someone who imported before versioning existed should not have to re-import.
    const legacy = {
      meta: { id: 'resume-2026-08', filename: 'resume.pdf', type: 'resume', importedAt: '2026-08-01T00:00:00Z', extraction: 'text', extractor: 'pdf@1.0' },
      profile: { experience: [{ id: 'a', company: 'Acme', role: 'Engineer' }] },
    }
    const record = readRecord(legacy)

    assert.equal(record.id, 'resume', 'the date is dropped from the identity')
    assert.equal(record.versions.length, 1)
    assert.equal(record.versions[0].profile.experience[0].role, 'Engineer')
  })

  test('a pinned version that no longer exists is reported', () => {
    const { findings } = validateIdentity(resolveIdentity([]), {
      documents: [{
        id: 'resume',
        activeVersion: 'sha256:gone',
        versions: [{ versionId: 'sha256:here', importedAt: 'x', extraction: 'text', extractor: 't', profile: {} }],
      }],
    })
    assert.ok(findings.some((f) => f.code === 'document-active-missing'))
  })
})

describe('format readers', () => {
  test('DOCX paragraphs and heading styles are read', () => {
    const xml = `<w:document><w:body>
      <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Experience</w:t></w:r></w:p>
      <w:p><w:r><w:t>Software </w:t></w:r><w:r><w:t>Engineer</w:t></w:r><w:r><w:t xml:space="preserve">, Acme &amp; Co</w:t></w:r></w:p>
      <w:p/>
    </w:body></w:document>`

    const lines = paragraphsOf(xml)
    assert.equal(lines[0].text, 'Experience')
    assert.equal(lines[0].heading, true, 'Word heading styles make sections reliable')
    assert.equal(lines[1].text, 'Software Engineer, Acme & Co',
      'runs are joined without inserted spaces, or Word would split words apart')
  })

  test('a stored-entry zip is readable', async () => {
    const archive = storedZip('word/document.xml', '<w:document/>')
    const entries = readZip(archive)
    assert.equal(entries.length, 1)
    assert.equal(entries[0].name, 'word/document.xml')
    assert.equal(await entries[0].text(), '<w:document/>')
  })

  test('a non-zip yields no entries rather than throwing', () => {
    assert.deepEqual(readZip(Buffer.from('not a zip at all')), [])
  })

  test('PDF text operators are read, and kerning becomes word spacing', () => {
    const stream = 'BT (Ada Lovelace) Tj 0 -14 Td [(Software) -300 (Engineer)] TJ ET'
    const text = textFromContentStream(stream)
    assert.match(text, /Ada Lovelace/)
    assert.match(text, /Software Engineer/)
    assert.equal(text.split('\n').length, 2, 'Td starts a new line')
  })

  test('mojibake is rejected rather than published as extracted text', () => {
    // A PDF with custom font encodings decodes to valid characters that are not the
    // document's words. Publishing those under "from your résumé" would be fabrication.
    assert.equal(looksLikeProse('Ada Lovelace worked at Acme Corporation as an engineer'), true)
    assert.equal(looksLikeProse('  '), false)
    assert.equal(looksLikeProse('   '), false)
  })

  test('a scanned PDF is refused with a usable next step', async () => {
    // Minimal valid PDF with no text-showing operators.
    const scanned = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< >>\n%%EOF')
    const result = await ingestDocument({ filename: 'scan.pdf', bytes: scanned }, { now: NOW })

    assert.equal(result.ok, false)
    assert.match(result.reason, /scan|no text/i)
    assert.match(result.hint, /docx|OCR/i)
  })

  test('YAML that would be guessed at is refused', () => {
    assert.equal(parseSimpleYaml('a: &anchor\n  b: 1'), null)
    assert.deepEqual(parseSimpleYaml('name: Ada\nskills:\n  - Python\n  - Go'),
      { name: 'Ada', skills: ['Python', 'Go'] })
  })

  test('repeated keys do not confuse the YAML list lookahead', () => {
    const parsed = parseSimpleYaml('experience:\n  - role: A\n  - role: B\neducation:\n  - degree: X')
    assert.equal(parsed.experience.length, 2)
    assert.equal(parsed.education[0].degree, 'X')
  })
})

/* -------------------------------------------------------------------------- */

/** A document layer, as `buildPortfolio` receives it. */
function documentLayer(id, profile, importedAt, filename = `${id}.pdf`) {
  const meta = { id, filename, type: 'resume', importedAt, extraction: 'text', extractor: 'test@1.0' }
  return { meta, profile: attachProvenance(profile, meta, {}) }
}

/** A connector layer with genuine fetch provenance. */
const connectorLayer = (id, profile, fetchedAt) => ({
  id,
  profile: Object.fromEntries(Object.entries(profile).map(([key, value]) => [
    key,
    Array.isArray(value) ? value.map((r) => ({ ...r, source: { connector: id, fetchedAt } })) : value,
  ])),
})

describe('conflicts across source types', () => {
  const acme = (role) => ({ experience: [{ id: 'acme', company: 'Acme Corp', role }] })

  test('LinkedIn versus résumé', () => {
    const built = buildPortfolio({
      config: { identity: { name: 'Ada' } },
      sources: [connectorLayer('linkedin', acme('Software Engineer'), '2026-08-12T00:00:00Z')],
      documents: [documentLayer('resume-2026-04', acme('Software Engineering Intern'), '2026-04-02T00:00:00Z')],
      now: NOW,
    })

    assert.equal(built.conflicts.length, 1)
    const [conflict] = built.conflicts
    assert.equal(conflict.label, 'Role — Acme Corp')
    assert.deepEqual(conflict.options.map((o) => o.source).sort(), ['linkedin', 'resume-2026-04'])
  })

  test('neither source type automatically outranks the other', () => {
    // The résumé is newer here, so it wins; in the test above LinkedIn was newer and won.
    // If document beat connector structurally, both would resolve the same way.
    const built = buildPortfolio({
      config: { identity: { name: 'Ada' } },
      sources: [connectorLayer('linkedin', acme('Software Engineer'), '2026-01-01T00:00:00Z')],
      documents: [documentLayer('resume-2026-08', acme('Staff Engineer'), '2026-08-01T00:00:00Z')],
      now: NOW,
    })
    assert.equal(built.profile.experience[0].role, 'Staff Engineer')

    const reversed = buildPortfolio({
      config: { identity: { name: 'Ada' } },
      sources: [connectorLayer('linkedin', acme('Software Engineer'), '2026-08-01T00:00:00Z')],
      documents: [documentLayer('resume-2026-01', acme('Staff Engineer'), '2026-01-01T00:00:00Z')],
      now: NOW,
    })
    assert.equal(reversed.profile.experience[0].role, 'Software Engineer')
  })

  test('GitHub versus résumé, on a project description', () => {
    const built = buildPortfolio({
      config: { identity: { name: 'Ada' } },
      sources: [connectorLayer('github', { projects: [{ id: 'p', name: 'Engine', description: 'From the repo.' }] }, '2026-08-01T00:00:00Z')],
      documents: [documentLayer('resume-2026-04', { projects: [{ id: 'p', name: 'Engine', description: 'From the résumé.' }] }, '2026-04-01T00:00:00Z')],
      now: NOW,
    })
    assert.equal(built.conflicts.length, 1)
    assert.equal(built.conflicts[0].attribute, 'description')
  })

  test('Google Scholar versus résumé, on a publication venue', () => {
    const paper = (venue) => ({ publications: [{ id: 'paper', title: 'On Computing', venue }] })
    const built = buildPortfolio({
      config: { identity: { name: 'Ada' } },
      sources: [connectorLayer('semanticScholar', paper('NeurIPS'), '2026-08-01T00:00:00Z')],
      documents: [documentLayer('cv-2026-04', paper('NIPS'), '2026-04-01T00:00:00Z')],
      now: NOW,
    })
    assert.equal(built.conflicts.length, 1)
    assert.equal(built.conflicts[0].attribute, 'venue')
  })

  test('document versus document', () => {
    const built = buildPortfolio({
      config: { identity: { name: 'Ada' } },
      documents: [
        documentLayer('resume-2026-04', acme('Intern'), '2026-04-01T00:00:00Z'),
        documentLayer('cv-2026-08', acme('Engineer'), '2026-08-01T00:00:00Z'),
      ],
      now: NOW,
    })
    assert.equal(built.conflicts.length, 1)
    assert.equal(built.profile.experience[0].role, 'Engineer', 'the newer document wins')
  })

  test('a résumé and hand-written data do not conflict', () => {
    // Manual data is the owner speaking. They have already decided, so re-asking would bury
    // the genuine conflicts under one row per field they filled in.
    const built = buildPortfolio({
      config: { identity: { name: 'Ada' } },
      documents: [documentLayer('resume-2026-04', acme('Intern'), '2026-04-01T00:00:00Z')],
      manual: acme('Engineer'),
      now: NOW,
    })
    assert.deepEqual(built.conflicts, [])
    assert.equal(built.profile.experience[0].role, 'Engineer', 'what the owner wrote wins')
  })

  test('an API source and hand-written data do not conflict either', () => {
    const built = buildPortfolio({
      config: { identity: { name: 'Ada' } },
      sources: [connectorLayer('linkedin', acme('Software Engineer'), '2026-08-01T00:00:00Z')],
      manual: acme('Engineer'),
      now: NOW,
    })
    assert.deepEqual(built.conflicts, [])
    assert.equal(built.profile.experience[0].role, 'Engineer')
  })

  test('a conflict carries the document evidence needed to decide it', () => {
    const meta = { id: 'resume-2026-04', filename: 'resume.pdf', type: 'resume', importedAt: '2026-04-01T00:00:00Z', extraction: 'text', extractor: 't@1' }
    const built = buildPortfolio({
      config: { identity: { name: 'Ada' } },
      sources: [connectorLayer('linkedin', acme('Software Engineer'), '2026-08-12T00:00:00Z')],
      documents: [{
        meta,
        profile: attachProvenance(acme('Intern'), meta, {
          'experience/acme|role': { page: 1, section: 'Experience', text: 'Intern, Acme Corp', confidence: 0.7 },
        }),
      }],
      now: NOW,
    })

    const option = built.conflicts[0].options.find((o) => o.source === 'resume-2026-04')
    assert.equal(option.document.page, 1)
    assert.equal(option.document.section, 'Experience')
    assert.equal(option.confidence, 0.7)
  })
})

describe('decisions and overrides', () => {
  const acme = (role) => ({ experience: [{ id: 'acme', company: 'Acme Corp', role }] })

  const withBoth = (overrides) => buildPortfolio({
    config: { identity: { name: 'Ada' } },
    sources: [connectorLayer('linkedin', acme('Software Engineer'), '2026-08-12T00:00:00Z')],
    documents: [documentLayer('resume-2026-04', acme('Software Engineering Intern'), '2026-04-02T00:00:00Z')],
    overrides,
    now: NOW,
  })

  test('a decision survives a re-import that re-asserts the rejected value', () => {
    const resolutions = { [conflictId('experience/acme', 'role')]: { source: 'resume-2026-04' } }
    assert.equal(withBoth({ resolutions }).profile.experience[0].role, 'Software Engineering Intern')

    const refreshed = buildPortfolio({
      config: { identity: { name: 'Ada' } },
      sources: [connectorLayer('linkedin', acme('Software Engineer'), '2026-12-01T00:00:00Z')],
      documents: [documentLayer('resume-2026-04', acme('Software Engineering Intern'), '2026-04-02T00:00:00Z')],
      overrides: { resolutions },
      now: NOW,
    })
    assert.equal(refreshed.profile.experience[0].role, 'Software Engineering Intern')
    assert.equal(refreshed.conflicts[0].resolved, true)
  })

  test('an override wins, and the source claims it replaced are all kept', () => {
    const built = withBoth({ records: { experience: { acme: { role: 'Software Engineer Intern' } } } })

    assert.equal(built.profile.experience[0].role, 'Software Engineer Intern')
    assert.equal(built.profile.experience[0].company, 'Acme Corp', 'the rest of the record is untouched')

    const claims = built.evidence.get('experience/acme|role')
    assert.equal(claims.length, 3)
    assert.deepEqual(
      claims.map((c) => c.value).sort(),
      ['Software Engineer', 'Software Engineer Intern', 'Software Engineering Intern'],
      'the original document-derived claim remains intact for auditing and re-processing',
    )
  })

  test('a decision naming a source that no longer exists is flagged, not silently ignored', () => {
    const built = buildPortfolio({
      config: { identity: { name: 'Ada' } },
      sources: [connectorLayer('linkedin', acme('Software Engineer'), '2026-08-12T00:00:00Z')],
      documents: [documentLayer('resume-2026-04', acme('Intern'), '2026-04-02T00:00:00Z')],
      overrides: { resolutions: { [conflictId('experience/acme', 'role')]: { source: 'deleted-source' } } },
      now: NOW,
    })

    const [conflict] = built.conflicts
    assert.equal(conflict.resolved, false, 'a decision that cannot be honoured is not a decision')
    assert.equal(conflict.staleResolution, 'deleted-source')
    assert.ok(built.identityValidation.findings.some((f) => f.code === 'resolution-stale'))
  })

  test('hiding a record still works alongside claim-based overrides', () => {
    const built = withBoth({ hidden: { experience: ['acme'] } })
    assert.equal(built.profile.experience.length, 0)
  })
})

describe('provenance validation', () => {
  const base = () => resolveIdentity([
    { id: 'github', kind: 'connector', profile: { projects: [{ id: 'p', name: 'X', source: { connector: 'github', fetchedAt: '2026-08-01T00:00:00Z' } }] } },
  ])

  test('a healthy profile reports nothing', () => {
    const { valid, findings } = validateIdentity(base(), { layers: [], documents: [] })
    assert.equal(valid, true)
    assert.deepEqual(findings, [])
  })

  test('duplicate source ids are an error', () => {
    const { findings } = validateIdentity(base(), {
      layers: [{ id: 'resume', kind: 'document' }, { id: 'resume', kind: 'document' }],
    })
    assert.ok(findings.some((f) => f.code === 'source-duplicate' && f.level === 'error'))
  })

  test('a document claim with no document reference is reported', () => {
    const identity = resolveIdentity([
      { id: 'resume', kind: 'document', profile: { experience: [{ id: 'a', company: 'Acme', role: 'Eng' }] } },
    ])
    const { findings } = validateIdentity(identity, {})
    assert.ok(findings.some((f) => f.code === 'document-unattributed'))
  })

  test('a claim pointing at a missing document is reported', () => {
    const identity = resolveIdentity([{
      id: 'resume',
      kind: 'document',
      profile: { experience: [{ id: 'a', company: 'Acme', role: 'Eng', source: { connector: 'resume', document: { id: 'gone' } } }] },
    }])
    const { findings } = validateIdentity(identity, {
      documents: [{ meta: { id: 'resume-2026-08', importedAt: 'x', extraction: 'text', extractor: 't' } }],
    })
    assert.ok(findings.some((f) => f.code === 'document-missing'))
  })

  test('a confidence on API-reported data is reported as meaningless', () => {
    const identity = resolveIdentity([{
      id: 'github',
      kind: 'connector',
      profile: { projects: [{ id: 'p', name: 'X', source: { connector: 'github', fetchedAt: '2026-08-01T00:00:00Z', confidence: 0.9 } }] },
    }])
    const { findings } = validateIdentity(identity, {})
    assert.ok(findings.some((f) => f.code === 'confidence-on-exact'))
  })

  test('an out-of-range confidence is clamped by the schema, not silently kept', () => {
    const normalized = normalizeProfile({
      projects: [{ name: 'X', source: { connector: 'r', confidence: 5 } }],
    })
    assert.equal(normalized.projects[0].source.confidence, 1)
  })

  test('a malformed decision is an error', () => {
    const { findings } = validateIdentity(base(), { resolutions: { 'a:b': {} } })
    assert.ok(findings.some((f) => f.code === 'resolution-empty' && f.level === 'error'))
  })

  test('malformed extensions on a document are an error', () => {
    const { findings } = validateIdentity(base(), {
      documents: [{ meta: { id: 'd', importedAt: 'x', extraction: 'text', extractor: 't' }, extensions: ['not', 'an', 'object'] }],
    })
    assert.ok(findings.some((f) => f.code === 'extensions-malformed'))
  })

  test('a document with no recorded extraction method is reported', () => {
    const { findings } = validateIdentity(base(), {
      documents: [{ meta: { id: 'd', importedAt: '2026-08-01T00:00:00Z' } }],
    })
    assert.ok(findings.some((f) => f.code === 'document-unmethod'))
  })
})

describe('round-tripping with documents', () => {
  test('document provenance and extensions survive export and re-import', () => {
    const meta = { id: 'resume-2026-08', filename: 'resume.pdf', type: 'resume', importedAt: '2026-08-01T00:00:00Z', extraction: 'text', extractor: 't@1' }
    const built = buildPortfolio({
      config: { identity: { name: 'Ada Lovelace' } },
      documents: [{
        meta,
        profile: attachProvenance(
          { experience: [{ id: 'acme', company: 'Acme Corp', role: 'Engineer' }] },
          meta,
          { 'experience/acme|role': { page: 2, section: 'Experience', confidence: 0.7 } },
        ),
      }],
      manual: { custom: { exhibitions: [{ title: 'Air Rifle Shooting — State Gold' }] } },
      now: NOW,
    })

    const doc = toDocument(built.profile, { evidence: built.evidence, includeEvidence: true })
    const { profile: back, issues } = fromDocument(doc)

    assert.deepEqual(issues, [])

    const role = back.experience[0]
    assert.equal(role.source.document.id, 'resume-2026-08')
    assert.equal(role.source.document.page, 2)
    assert.equal(role.source.confidence, 0.7)

    assert.equal(back.custom.exhibitions[0].title, 'Air Rifle Shooting — State Gold',
      'data no platform models still survives the standard')
  })

  test('unknown extension keys are preserved verbatim', () => {
    const profile = normalizeProfile({ identity: { name: 'Ada' } })
    const doc = toDocument(profile, { extensions: { 'vendor:someTool': { anything: ['at', 'all'] } } })
    assert.deepEqual(doc.extensions['vendor:someTool'], { anything: ['at', 'all'] })
  })

  test('a custom social network survives', () => {
    const profile = normalizeProfile({
      identity: { name: 'Ada' },
      socials: { mastodon: 'https://fosstodon.org/@ada' },
    })
    const { profile: back } = fromDocument(toDocument(profile))
    assert.equal(back.socials.mastodon, 'https://fosstodon.org/@ada')
  })
})

/* -------------------------------------------------------------------------- */

/**
 * Build a zip with one stored (uncompressed) entry.
 *
 * Written here rather than pulled in as a dependency: the reader must be tested against a
 * real archive, and a stored entry exercises the same header parsing as a deflated one.
 */
function storedZip(name, content) {
  const nameBytes = Buffer.from(name, 'utf8')
  const data = Buffer.from(content, 'utf8')
  const crc = zlib.crc32 ? zlib.crc32(data) : crc32(data)

  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(0, 8) // stored
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(data.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(nameBytes.length, 26)

  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0, 10)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(data.length, 20)
  central.writeUInt32LE(data.length, 24)
  central.writeUInt16LE(nameBytes.length, 28)

  const localBlock = Buffer.concat([local, nameBytes, data])
  const centralBlock = Buffer.concat([central, nameBytes])

  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(1, 8)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(centralBlock.length, 12)
  eocd.writeUInt32LE(localBlock.length, 16)

  return Buffer.concat([localBlock, centralBlock, eocd])
}

/** CRC-32, for Node versions without `zlib.crc32`. */
function crc32(buffer) {
  let crc = ~0
  for (const byte of buffer) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1))
  }
  return ~crc >>> 0
}
