import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { resolveIdentity, conflictId, evidenceFor, sourcesFor } from '../src/core/identity/resolve.js'
import { collectClaims, policyFor, claimKindFor } from '../src/core/identity/claims.js'
import { buildPortfolio } from '../src/core/generate/build.js'
import { toDocument, fromDocument, validateDocument, SCHEMA_VERSION } from '../src/core/standard/document.js'
import { normalizeProfile } from '../src/core/schema/profile.js'

/* -------------------------------------------------------------------------- */

/** A connector layer: fetched, so its claims are `reported`. */
const connector = (id, profile, fetchedAt = '2026-08-01T00:00:00Z') => ({
  id,
  kind: 'connector',
  label: id,
  profile: stamp(profile, id, fetchedAt),
})

/** Stamp every record so it looks like genuinely fetched data. */
function stamp(profile, id, fetchedAt) {
  const out = {}
  for (const [key, value] of Object.entries(profile)) {
    out[key] = Array.isArray(value)
      ? value.map((r) => ({ ...r, source: { connector: id, fetchedAt } }))
      : value
  }
  return out
}

const manual = (profile) => ({ id: 'manual', kind: 'manual', label: 'Entered by hand', profile })
const config = (profile) => ({ id: 'config', kind: 'config', label: 'config', profile })

/* -------------------------------------------------------------------------- */

describe('claims', () => {
  test('a claim records who said it, and when', () => {
    const claims = collectClaims([
      connector('github', { projects: [{ id: 'p', name: 'Thing', stars: 5 }] }, '2026-07-04T00:00:00Z'),
    ])

    const stars = claims.find((c) => c.attribute === 'stars')
    assert.equal(stars.subject, 'projects/p')
    assert.equal(stars.value, 5)
    assert.equal(stars.source, 'github')
    assert.equal(stars.kind, 'reported')
    assert.equal(stars.observedAt, '2026-07-04T00:00:00Z')
  })

  test('a connector that never fetched makes stated claims, not reported ones', () => {
    // The absence of `fetchedAt` is the signal, exactly as it is on the rendered page.
    assert.equal(claimKindFor('connector', { source: { connector: 'codechef' } }), 'stated')
    assert.equal(claimKindFor('connector', { source: { connector: 'gh', fetchedAt: 'x' } }), 'reported')
    assert.equal(claimKindFor('manual', {}), 'stated')
    assert.equal(claimKindFor('document', {}), 'extracted')
  })

  test('set-valued attributes are unioned, not contested', () => {
    assert.equal(policyFor('technologies'), 'union')
    assert.equal(policyFor('stars'), 'newest')
    assert.equal(policyFor('role'), 'preferred')
  })
})

describe('resolution', () => {
  test('a later layer wins, so an import never overwrites what you wrote', () => {
    const { profile } = resolveIdentity([
      connector('github', { identity: { headline: 'From my GitHub bio' } }),
      config({ identity: { headline: 'What I actually do' } }),
    ])
    assert.equal(profile.identity.headline, 'What I actually do')
  })

  test('two connectors are resolved by recency rather than filename order', () => {
    const { profile } = resolveIdentity([
      connector('aaa', { experience: [{ id: 'x', company: 'Acme', role: 'Older' }] }, '2020-01-01T00:00:00Z'),
      connector('zzz', { experience: [{ id: 'x', company: 'Acme', role: 'Newer' }] }, '2026-01-01T00:00:00Z'),
    ])
    assert.equal(profile.experience[0].role, 'Newer')
  })

  test('technologies from different sources combine instead of replacing', () => {
    const { profile, conflicts } = resolveIdentity([
      connector('github', { projects: [{ id: 'p', name: 'Thing', technologies: ['Go', 'Docker'] }] }),
      connector('gitlab', { projects: [{ id: 'p', name: 'Thing', technologies: ['Go', 'Kubernetes'] }] }),
    ])
    assert.deepEqual(profile.projects[0].technologies, ['Go', 'Docker', 'Kubernetes'])
    assert.equal(conflicts.length, 0, 'sources adding to each other are not in disagreement')
  })

  test('the first spelling of a unioned value is kept', () => {
    const { profile } = resolveIdentity([
      connector('github', { projects: [{ id: 'p', name: 'T', technologies: ['PyTorch'] }] }),
      connector('gitlab', { projects: [{ id: 'p', name: 'T', technologies: ['pytorch'] }] }),
    ])
    assert.deepEqual(profile.projects[0].technologies, ['PyTorch'])
  })

  test('a count is taken from the most recent observation', () => {
    const { profile, conflicts } = resolveIdentity([
      connector('a', { projects: [{ id: 'p', name: 'T', stars: 12 }] }, '2026-01-01T00:00:00Z'),
      connector('b', { projects: [{ id: 'p', name: 'T', stars: 40 }] }, '2026-08-01T00:00:00Z'),
    ])
    assert.equal(profile.projects[0].stars, 40)
    assert.equal(conflicts.length, 0, 'a stale number is not a competing opinion')
  })
})

describe('conflicts', () => {
  const disagreeing = [
    connector('linkedin', { experience: [{ id: 'acme', company: 'Acme Corp', role: 'Software Engineer' }] }, '2026-08-01T00:00:00Z'),
    connector('resume', { experience: [{ id: 'acme', company: 'Acme Corp', role: 'Software Engineering Intern' }] }, '2026-02-01T00:00:00Z'),
  ]

  test('two independent sources disagreeing is a conflict', () => {
    const { conflicts } = resolveIdentity(disagreeing)
    assert.equal(conflicts.length, 1)

    const [conflict] = conflicts
    assert.equal(conflict.attribute, 'role')
    assert.equal(conflict.label, 'Role — Acme Corp', 'named by the record, not its id')
    assert.equal(conflict.options.length, 2)
    assert.equal(conflict.resolved, false)
    assert.equal(conflict.chosen, 'linkedin', 'the most recent observation wins by default')
  })

  test('a decision overrides precedence, and is reported as yours', () => {
    const { profile, conflicts } = resolveIdentity(disagreeing, {
      resolutions: { [conflictId('experience/acme', 'role')]: { source: 'resume' } },
    })
    assert.equal(profile.experience[0].role, 'Software Engineering Intern')
    assert.equal(conflicts[0].resolved, true)
    assert.equal(conflicts[0].resolvedBy, 'user')
  })

  test('a decision survives a re-import that re-asserts the rejected value', () => {
    // The whole reason a decision is stored against the fact rather than typed into a field.
    const resolutions = { [conflictId('experience/acme', 'role')]: { source: 'resume' } }
    const reimported = [
      connector('linkedin', { experience: [{ id: 'acme', company: 'Acme Corp', role: 'Software Engineer' }] }, '2026-12-01T00:00:00Z'),
      disagreeing[1],
    ]
    const { profile } = resolveIdentity(reimported, { resolutions })
    assert.equal(profile.experience[0].role, 'Software Engineering Intern')
  })

  test('a typed replacement wins over every source', () => {
    const { profile } = resolveIdentity(disagreeing, {
      resolutions: { [conflictId('experience/acme', 'role')]: { value: 'Platform Engineer' } },
    })
    assert.equal(profile.experience[0].role, 'Platform Engineer')
  })

  test('your own config is a decision, not a disagreement', () => {
    // Otherwise every field a person filled in would raise a conflict against whatever
    // their GitHub bio happens to hold, and the real conflicts would be buried.
    const { conflicts } = resolveIdentity([
      connector('github', { identity: { headline: 'Bio text from GitHub' } }),
      config({ identity: { headline: 'What I actually do' } }),
    ])
    assert.deepEqual(conflicts, [])
  })

  test('values differing only in case or spacing are not a conflict', () => {
    const { conflicts } = resolveIdentity([
      connector('a', { experience: [{ id: 'x', company: 'Acme', role: 'Software Engineer' }] }),
      connector('b', { experience: [{ id: 'x', company: 'Acme', role: '  software engineer ' }] }),
    ])
    assert.deepEqual(conflicts, [])
  })

  test('agreement between sources produces nothing to resolve', () => {
    const { conflicts } = resolveIdentity([
      connector('a', { experience: [{ id: 'x', company: 'Acme', role: 'Engineer' }] }),
      connector('b', { experience: [{ id: 'x', company: 'Acme', role: 'Engineer' }] }),
    ])
    assert.deepEqual(conflicts, [])
  })
})

describe('nothing is lost in resolution', () => {
  test('provenance survives, because every downstream claim about honesty depends on it', () => {
    // Dropping `source` while resolving would silently un-attribute every record: the
    // "reported" vs "self-reported" labels, the repository count, and the sourced-from line
    // all read it, and all would quietly degrade rather than fail.
    const { profile } = resolveIdentity([
      connector('github', { projects: [{ id: 'p', name: 'Thing' }] }, '2026-07-04T00:00:00Z'),
    ])
    assert.equal(profile.projects[0].source.connector, 'github')
    assert.equal(profile.projects[0].source.fetchedAt, '2026-07-04T00:00:00Z')
  })

  test('structured fields survive, and never raise a conflict', () => {
    const { profile, conflicts } = resolveIdentity([
      connector('a', {
        competitive: [{
          platform: 'LeetCode',
          breakdown: { easy: 180, medium: 340, hard: 120 },
          metrics: [{ label: 'Percentile', value: 'Top 2%' }],
        }],
        projects: [{ id: 'p', name: 'T', links: [{ label: 'Docs', url: 'https://example.com' }] }],
      }),
    ])

    assert.deepEqual(profile.competitive[0].breakdown, { easy: 180, medium: 340, hard: 120 })
    assert.equal(profile.competitive[0].metrics[0].value, 'Top 2%')
    assert.equal(profile.projects[0].links[0].url, 'https://example.com/')
    assert.deepEqual(conflicts, [])
  })

  test('every field of a record round-trips through resolution', () => {
    const input = {
      id: 'p',
      name: 'Thing',
      description: 'A thing',
      technologies: ['Go'],
      repository: 'https://github.com/a/b',
      stars: 5,
      primaryLanguage: 'Go',
      topics: ['cli'],
      isFork: false,
      status: 'active',
      problem: 'It was slow',
      impact: 'It is fast',
    }
    const { profile } = resolveIdentity([connector('github', { projects: [input] })])
    const output = profile.projects[0]

    for (const key of Object.keys(input)) {
      assert.notEqual(output[key], undefined, `"${key}" was dropped during resolution`)
    }
  })
})

describe('evidence', () => {
  test('every claim about a value is retained, not just the winner', () => {
    const identity = resolveIdentity([
      connector('linkedin', { experience: [{ id: 'x', company: 'Acme', role: 'Engineer' }] }, '2026-08-01T00:00:00Z'),
      connector('resume', { experience: [{ id: 'x', company: 'Acme', role: 'Intern' }] }, '2026-02-01T00:00:00Z'),
    ])

    const claims = evidenceFor(identity, 'experience/x', 'role')
    assert.equal(claims.length, 2, 'the losing claim is kept, so the choice can be explained')
    assert.equal(claims[0].source, 'linkedin')
    assert.deepEqual(sourcesFor(identity, 'experience/x'), ['linkedin', 'resume'])
  })
})

describe('records that only one source knows about', () => {
  test('a hand-added achievement no platform knows survives resolution', () => {
    // The "Air Rifle Shooting" case: nothing can import it, and nothing may drop it.
    const { profile } = resolveIdentity([
      connector('github', { projects: [{ id: 'p', name: 'Thing' }] }),
      manual({ achievements: [{ title: 'Air Rifle Shooting — State Gold', date: '2025-03' }] }),
    ])
    assert.equal(profile.achievements.length, 1)
    assert.equal(profile.achievements[0].title, 'Air Rifle Shooting — State Gold')
  })

  test('a custom section survives resolution', () => {
    const { profile } = resolveIdentity([
      manual({ custom: { exhibitions: [{ title: 'Group show', date: '2025-03' }] } }),
    ])
    assert.equal(profile.custom.exhibitions.length, 1)
    assert.equal(profile.custom.exhibitions[0].title, 'Group show')
  })
})

describe('the pipeline still behaves', () => {
  test('conflicts reach the built portfolio', () => {
    const built = buildPortfolio({
      config: { identity: { name: 'Ada' } },
      sources: [
        { id: 'linkedin', profile: { experience: [{ id: 'x', company: 'Acme', role: 'Engineer', source: { connector: 'linkedin', fetchedAt: '2026-08-01T00:00:00Z' } }] } },
        { id: 'resume', profile: { experience: [{ id: 'x', company: 'Acme', role: 'Intern', source: { connector: 'resume', fetchedAt: '2026-02-01T00:00:00Z' } }] } },
      ],
      now: Date.parse('2026-08-14'),
    })
    assert.equal(built.conflicts.length, 1)
    assert.deepEqual(built.sources, ['config', 'linkedin', 'resume'])
  })

  test('untagged sources still resolve, for callers that pass bare profiles', () => {
    const built = buildPortfolio({
      config: { identity: { name: 'Ada' } },
      sources: [{ projects: [{ name: 'Thing' }] }],
      now: Date.parse('2026-08-14'),
    })
    assert.equal(built.profile.projects.length, 1)
  })
})

/* -------------------------------------------------------------------------- */

describe('the portable standard', () => {
  const profile = normalizeProfile({
    identity: { name: 'Ada Lovelace', headline: 'Engineer', contact: { email: 'ada@example.com' } },
    projects: [{ name: 'Note G', technologies: ['Analysis'], stars: 5 }],
    posts: [{ title: 'On computing', url: 'https://example.com/a' }],
    competitive: [{ platform: 'Codeforces', rating: 1700 }],
    custom: { exhibitions: [{ title: 'Air Rifle Shooting — State Gold' }] },
    socials: { github: 'https://github.com/ada' },
  })

  test('a document declares its version and its spec', () => {
    const doc = toDocument(profile)
    assert.equal(doc.schemaVersion, SCHEMA_VERSION)
    assert.match(doc.spec, /^https?:\/\//)
  })

  test('the standard uses names a reader can understand without this codebase', () => {
    const doc = toDocument(profile)
    assert.equal(doc.writing.length, 1, '`posts` is published as `writing`')
    assert.equal(doc.competitions.length, 1, '`competitive` is published as `competitions`')
    assert.equal(doc.person.name, 'Ada Lovelace', '`identity` is published as `person`')
  })

  test('data the standard does not model round-trips through extensions', () => {
    // Without this, an "open standard" is just this project's internal shape with a version
    // number, and any tool adopting it would fork the moment it needed a field.
    const doc = toDocument(profile)
    const { profile: back, issues } = fromDocument(doc)

    assert.deepEqual(issues, [])
    assert.equal(back.custom.exhibitions[0].title, 'Air Rifle Shooting — State Gold')
    assert.equal(back.posts[0].title, 'On computing')
    assert.equal(back.competitive[0].platform, 'Codeforces')
    assert.equal(back.identity.name, 'Ada Lovelace')
  })

  test('an unreadable major version is refused rather than mangled', () => {
    const { valid, issues } = validateDocument({ schemaVersion: '9.0', person: { name: 'X' } })
    assert.equal(valid, false)
    assert.ok(issues.some((i) => i.level === 'error' && /cannot read/.test(i.message)))
  })

  test('a same-major future version loads with a warning', () => {
    const doc = { ...toDocument(profile), schemaVersion: '1.99' }
    const { valid, issues } = validateDocument(doc)
    assert.equal(valid, true)
    assert.ok(issues.some((i) => i.level === 'warning'))
  })

  test('a document must name someone', () => {
    assert.equal(validateDocument({ schemaVersion: SCHEMA_VERSION, person: {} }).valid, false)
  })

  test('evidence is optional and only carries disputed values', () => {
    const identity = resolveIdentity([
      connector('a', { experience: [{ id: 'x', company: 'Acme', role: 'Engineer' }] }),
      connector('b', { experience: [{ id: 'x', company: 'Acme', role: 'Intern' }] }),
    ])
    const bare = toDocument(identity.profile)
    assert.equal(bare.evidence, undefined)

    const audited = toDocument(identity.profile, { evidence: identity.evidence, includeEvidence: true })
    assert.ok(audited.evidence.length >= 1)
    assert.ok(audited.evidence.every((e) => e.claims.length >= 2), 'only disputes are worth the bytes')
  })
})

describe('record identity', () => {
  test('C, C++ and C# are three different skills', () => {
    // They collapse to one key under a naive slug, which silently merges three distinct
    // skills and then shows them as disagreeing with each other.
    const { profile, conflicts } = resolveIdentity([
      manual({ skills: [{ name: 'C' }, { name: 'C++' }, { name: 'C#' }] }),
    ])
    assert.deepEqual(profile.skills.map((s) => s.name).sort(), ['C', 'C#', 'C++'])
    assert.deepEqual(conflicts, [])
  })
})
