import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { parseDate, parseRange, formatDate, formatRange, dateValue, rangeValue } from '../src/core/schema/date.js'
import { normalizeProfile, createEmptyProfile, url, imageRef, strArray, num, slugify } from '../src/core/schema/profile.js'
import { mergeProfiles, applyOverrides, deepMerge, recordKey } from '../src/core/schema/merge.js'
import { validateProfile } from '../src/core/schema/validate.js'
import { COLLECTIONS } from '../src/core/schema/types.js'

describe('date parsing', () => {
  test('parses the precisions a portfolio actually contains', () => {
    assert.deepEqual(parseDate('2024'), { iso: '2024-01-01', precision: 'year' })
    assert.deepEqual(parseDate('2024-03'), { iso: '2024-03-01', precision: 'month' })
    assert.deepEqual(parseDate('Mar 2024'), { iso: '2024-03-01', precision: 'month' })
    assert.deepEqual(parseDate('March 2024'), { iso: '2024-03-01', precision: 'month' })
    assert.deepEqual(parseDate('03/2024'), { iso: '2024-03-01', precision: 'month' })
    assert.deepEqual(parseDate('2024-03-15'), { iso: '2024-03-15', precision: 'day' })
    assert.deepEqual(parseDate('2024-03-15T10:30:00Z'), { iso: '2024-03-15', precision: 'day' })
    assert.deepEqual(parseDate('March 15, 2024'), { iso: '2024-03-15', precision: 'day' })
    assert.deepEqual(parseDate('15 March 2024'), { iso: '2024-03-15', precision: 'day' })
  })

  test('returns undefined instead of throwing on junk', () => {
    for (const junk of ['', '   ', 'sometime', 'Q3', null, undefined, {}, [], NaN, 'present']) {
      assert.equal(parseDate(junk), undefined, `expected undefined for ${JSON.stringify(junk)}`)
    }
  })

  test('rejects calendar-invalid dates that Date would silently roll over', () => {
    assert.equal(parseDate('2023-02-30'), undefined)
    assert.equal(parseDate('2024-13-01'), undefined)
  })

  test('round-trips an existing PortfolioDate', () => {
    const d = { iso: '2024-03-01', precision: 'month' }
    assert.deepEqual(parseDate(d), d)
  })

  test('formats at the precision it actually has', () => {
    assert.equal(formatDate({ iso: '2024-03-15', precision: 'year' }), '2024')
    assert.equal(formatDate({ iso: '2024-03-15', precision: 'month' }), 'Mar 2024')
    assert.equal(formatDate({ iso: '2024-03-15', precision: 'day' }), 'Mar 15, 2024')
    assert.equal(formatDate(undefined), '')
  })

  test('parses the free-text ranges found in hand-written portfolios', () => {
    assert.deepEqual(parseRange('Nov 2025 – Present'), {
      start: { iso: '2025-11-01', precision: 'month' },
      current: true,
    })
    assert.deepEqual(parseRange('2019-2023'), {
      start: { iso: '2019-01-01', precision: 'year' },
      end: { iso: '2023-01-01', precision: 'year' },
    })
    assert.deepEqual(parseRange('Sep 2025 to May 2029'), {
      start: { iso: '2025-09-01', precision: 'month' },
      end: { iso: '2029-05-01', precision: 'month' },
    })
    assert.deepEqual(parseRange({ start: '2020', end: '2024' }), {
      start: { iso: '2020-01-01', precision: 'year' },
      end: { iso: '2024-01-01', precision: 'year' },
    })
  })

  test('formats a range with a present marker', () => {
    assert.equal(formatRange(parseRange('Nov 2025 – Present')), 'Nov 2025 – Present')
    assert.equal(formatRange(parseRange('2019-2023')), '2019 – 2023')
    assert.equal(formatRange(undefined), '')
  })

  test('sorts current roles above ended ones', () => {
    const now = Date.parse('2026-01-01T00:00:00Z')
    const current = rangeValue(parseRange('Nov 2025 – Present'), now)
    const ended = rangeValue(parseRange('2019-2023'), now)
    assert.ok(current > ended)
    assert.equal(dateValue(undefined), -Infinity)
  })
})

describe('coercion', () => {
  test('url() rejects non-http schemes', () => {
    assert.equal(url('https://example.com/x'), 'https://example.com/x')
    assert.equal(url('example.com'), 'https://example.com/')
    assert.equal(url('mailto:a@b.com'), 'mailto:a@b.com')
    assert.equal(url('javascript:alert(1)'), undefined)
    assert.equal(url('data:text/html,<script>'), undefined)
    assert.equal(url('   '), undefined)
  })

  test('imageRef() allows relative paths and data images but not protocol-relative', () => {
    assert.equal(imageRef('/assets/me.png'), '/assets/me.png')
    assert.equal(imageRef('assets/me.png'), 'assets/me.png')
    assert.equal(imageRef('data:image/png;base64,AAA'), 'data:image/png;base64,AAA')
    assert.equal(imageRef('//evil.example/x.png'), undefined)
    assert.equal(imageRef('javascript:alert(1)'), undefined)
  })

  test('strArray() splits, trims and de-duplicates case-insensitively', () => {
    assert.deepEqual(strArray('Python, TypeScript , python'), ['Python', 'TypeScript'])
    assert.deepEqual(strArray(['a', '', '  ', 'A']), ['a'])
    assert.equal(strArray(42), undefined)
  })

  test('num() handles separators and rejects junk', () => {
    assert.equal(num('1,250'), 1250)
    assert.equal(num(12), 12)
    assert.equal(num('12abc'), undefined)
    assert.equal(num(Infinity), undefined)
  })

  test('slugify() produces stable override keys', () => {
    assert.equal(slugify('RAVEN — Relational Verification Engine'), 'raven-relational-verification-engine')
    assert.equal(slugify(''), 'item')
  })
})

describe('normalizeProfile', () => {
  test('produces a structurally complete profile from nothing', () => {
    const p = normalizeProfile(undefined)
    for (const c of COLLECTIONS) assert.ok(Array.isArray(p[c]), `${c} should be an array`)
    assert.equal(p.identity.name, '')
    assert.deepEqual(p.stats.entries, [])
  })

  test('never throws on hostile input', () => {
    for (const junk of [null, 42, 'string', [], { projects: 'nope' }, { identity: 7 }]) {
      assert.doesNotThrow(() => normalizeProfile(junk))
    }
  })

  test('drops unidentifiable records rather than rendering blanks', () => {
    const p = normalizeProfile({
      projects: [{ name: 'Real' }, { description: 'no name' }, null, 'string'],
    })
    assert.equal(p.projects.length, 1)
    assert.equal(p.projects[0].name, 'Real')
  })

  test('accepts alias field names used by other portfolio formats', () => {
    const p = normalizeProfile({
      profile: { name: 'A', role: 'Dev', bio: 'Hi' },
      experience: [{ organization: 'Acme', title: 'Eng', period: '2020-2022', tools: 'Go, Rust' }],
    })
    assert.equal(p.identity.headline, 'Dev')
    assert.equal(p.identity.summary, 'Hi')
    assert.equal(p.experience[0].company, 'Acme')
    assert.equal(p.experience[0].role, 'Eng')
    assert.deepEqual(p.experience[0].technologies, ['Go', 'Rust'])
  })

  test('expands bare strings in skill arrays', () => {
    const p = normalizeProfile({ skills: ['Python', { name: 'Rust', category: 'Languages' }] })
    assert.equal(p.skills.length, 2)
    assert.equal(p.skills[0].name, 'Python')
    assert.equal(p.skills[1].category, 'Languages')
  })

  test('strips unsafe urls throughout', () => {
    const p = normalizeProfile({
      identity: { contact: { website: 'javascript:alert(1)' } },
      socials: { github: 'javascript:alert(1)', gitlab: 'https://gitlab.com/x' },
      projects: [{ name: 'X', links: [{ label: 'bad', url: 'javascript:alert(1)' }] }],
    })
    assert.equal(p.identity.contact, undefined)
    assert.deepEqual(Object.keys(p.socials), ['gitlab'])
    assert.equal(p.projects[0].links, undefined)
  })

  test('rejects a malformed email rather than rendering a broken mailto', () => {
    assert.equal(normalizeProfile({ identity: { contact: { email: 'not-an-email' } } }).identity.contact, undefined)
    assert.equal(normalizeProfile({ identity: { contact: { email: 'a@b.co' } } }).identity.contact.email, 'a@b.co')
  })

  test('clamps proficiency into range', () => {
    const p = normalizeProfile({ skills: [{ name: 'X', proficiency: 99 }] })
    assert.equal(p.skills[0].proficiency, 5)
  })
})

describe('merge', () => {
  test('deepMerge replaces arrays instead of concatenating', () => {
    assert.deepEqual(deepMerge({ tags: ['a', 'b'] }, { tags: ['c'] }), { tags: ['c'] })
  })

  test('deepMerge ignores undefined but honours null as a delete', () => {
    assert.deepEqual(deepMerge({ a: 1, b: 2 }, { a: undefined, b: null }), { a: 1 })
  })

  test('deepMerge refuses prototype pollution', () => {
    const out = deepMerge({}, JSON.parse('{"__proto__":{"polluted":true}}'))
    assert.equal(/** @type {any} */ ({}).polluted, undefined)
    assert.equal(Object.prototype.hasOwnProperty.call(out, '__proto__'), false)
  })

  test('later layers win per field, not per record', () => {
    const imported = { projects: [{ id: 'p', name: 'repo-name', stars: 10, description: 'from github' }] }
    const manual = { projects: [{ id: 'p', name: 'Nice Name' }] }
    const merged = mergeProfiles(imported, manual)
    assert.equal(merged.projects.length, 1)
    assert.equal(merged.projects[0].name, 'Nice Name')
    assert.equal(merged.projects[0].stars, 10, 'imported field survives a manual title override')
    assert.equal(merged.projects[0].description, 'from github')
  })

  test('matches records across layers without ids via a natural key', () => {
    const a = { experience: [{ company: 'Acme', role: 'Engineer', description: 'imported' }] }
    const b = { experience: [{ company: 'Acme', role: 'Engineer', highlights: ['manual'] }] }
    const merged = mergeProfiles(a, b)
    assert.equal(merged.experience.length, 1)
    assert.equal(merged.experience[0].description, 'imported')
    assert.deepEqual(merged.experience[0].highlights, ['manual'])
  })

  test('an empty later name does not blank an earlier one', () => {
    const merged = mergeProfiles({ identity: { name: 'Real Name' } }, { identity: { headline: 'Dev' } })
    assert.equal(merged.identity.name, 'Real Name')
    assert.equal(merged.identity.headline, 'Dev')
  })

  test('recordKey is stable for the same logical record', () => {
    assert.equal(
      recordKey('experience', { company: 'Acme', role: 'Engineer' }),
      recordKey('experience', { company: 'acme', role: 'ENGINEER' }),
    )
  })
})

describe('overrides', () => {
  const base = mergeProfiles({
    identity: { name: 'A', headline: 'Imported headline' },
    projects: [
      { id: 'one', name: 'One', stars: 5 },
      { id: 'two', name: 'Two', stars: 1 },
      { id: 'three', name: 'Three' },
    ],
  })

  test('field pins survive a re-import of other fields', () => {
    const out = applyOverrides(base, { records: { projects: { one: { name: 'Renamed' } } } })
    assert.equal(out.projects[0].name, 'Renamed')
    assert.equal(out.projects[0].stars, 5)
  })

  test('hidden records are removed', () => {
    const out = applyOverrides(base, { hidden: { projects: ['two'] } })
    assert.deepEqual(out.projects.map((p) => p.id), ['one', 'three'])
  })

  test('explicit order pins listed ids first and keeps the rest', () => {
    const out = applyOverrides(base, { order: { projects: ['three', 'two'] } })
    assert.deepEqual(out.projects.map((p) => p.id), ['three', 'two', 'one'])
  })

  test('a patch with no matching record becomes a user-authored record', () => {
    const out = applyOverrides(base, { records: { projects: { four: { name: 'Four' } } } })
    assert.equal(out.projects.length, 4)
    assert.equal(out.projects[3].name, 'Four')
  })

  test('overrides cannot smuggle in an unsafe url', () => {
    const out = applyOverrides(base, { records: { projects: { one: { liveUrl: 'javascript:alert(1)' } } } })
    assert.equal(out.projects[0].liveUrl, undefined)
  })

  test('identity overrides win over imported identity', () => {
    const out = applyOverrides(base, { identity: { headline: 'My headline' } })
    assert.equal(out.identity.headline, 'My headline')
    assert.equal(out.identity.name, 'A')
  })

  test('does not mutate its input', () => {
    const before = JSON.stringify(base)
    applyOverrides(base, { hidden: { projects: ['one'] }, records: { projects: { two: { name: 'X' } } } })
    assert.equal(JSON.stringify(base), before)
  })

  test('null and undefined overrides are a no-op', () => {
    assert.equal(applyOverrides(base, null), base)
    assert.equal(applyOverrides(base, undefined), base)
  })
})

describe('validation', () => {
  test('an empty profile reports the missing name as an error', () => {
    const r = validateProfile(createEmptyProfile())
    assert.equal(r.valid, false)
    assert.ok(r.findings.some((f) => f.level === 'error' && f.path === 'identity.name'))
    assert.equal(r.completeness.score, 0)
  })

  test('a minimal profile is valid but incomplete', () => {
    const r = validateProfile(normalizeProfile({ identity: { name: 'A' } }))
    assert.equal(r.valid, true)
    assert.ok(r.completeness.score > 0 && r.completeness.score < 100)
    assert.ok(r.completeness.missing.includes('Projects'))
  })

  test('a full profile scores 100', () => {
    const r = validateProfile(normalizeProfile({
      identity: {
        name: 'A', headline: 'Dev', summary: 'Hi',
        contact: { email: 'a@b.co' },
      },
      socials: { github: 'https://github.com/a' },
      projects: [{ name: 'P', stars: 3 }],
      skills: [{ name: 'S', evidence: [{ label: '3 repos' }] }],
      experience: [{ company: 'Acme' }],
    }))
    assert.equal(r.completeness.score, 100)
    assert.deepEqual(r.completeness.missing, [])
  })

  test('duplicate ids are flagged because they make overrides ambiguous', () => {
    const r = validateProfile(normalizeProfile({
      identity: { name: 'A' },
      projects: [{ id: 'x', name: 'One' }, { id: 'x', name: 'Two' }],
    }))
    assert.ok(r.findings.some((f) => f.message.includes('Duplicate id')))
  })

  test('never throws on a malformed profile', () => {
    assert.doesNotThrow(() => validateProfile(/** @type {any} */ (null)))
    assert.doesNotThrow(() => validateProfile(/** @type {any} */ ({ projects: 'nope' })))
  })
})
