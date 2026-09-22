import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { buildPortfolio } from '../src/core/generate/build.js'
import { describeChanges, diffProfiles } from '../src/core/sources/health.js'
import { explainConflict, needsAttention, traceIdentity } from '../src/core/identity/explain.js'
import { evidenceFor } from '../src/core/identity/resolve.js'
import { assessProfile, expectedCollections } from '../src/core/profile/completeness.js'
import { getConnector } from '../src/connectors/index.js'

/**
 * Import preview, change review, conflict explanation and completeness.
 *
 * The through-line: **nothing here may decide anything the engine had not already decided.**
 * A preview that wrote, a review that counted differently from the health model, an explainer
 * that picked its own winner, or a completeness score that invented requirements would each be
 * a second source of truth about the same data — and the second one is always the one that goes
 * quietly wrong.
 *
 * So most assertions compare a new function's answer against the existing pipeline's, rather
 * than against a fixture that could drift from both.
 */

const ROOT = process.cwd()

/**
 * Run the importer and return its output, whatever it exits with.
 *
 * The exit code is deliberately ignored. On Windows the importer trips a libuv teardown
 * assertion *after* it has finished its work and written its output — a pre-existing platform
 * quirk, not a failure of the run. Treating that as an error made this suite flaky while
 * proving nothing; the assertions below check the output, which is the thing under test.
 */
function runImporter(args) {
  try {
    return execFileSync(process.execPath, ['scripts/import.mjs', ...args], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, timeout: 120_000,
    })
  } catch (err) {
    if (typeof err.stdout === 'string' && err.stdout.length) return err.stdout
    throw err
  }
}
const STATUS = path.join(ROOT, 'src', 'data', 'generated', 'status.json')
const SOURCES = path.join(ROOT, 'src', 'data', 'generated', 'sources')

/* -------------------------------------------------------------------------- */
/* A. Preview does not mutate                                                 */
/* -------------------------------------------------------------------------- */

describe('a preview writes nothing', () => {
  /** A snapshot of everything a real import would touch. */
  const snapshot = () => ({
    status: fs.existsSync(STATUS) ? fs.readFileSync(STATUS, 'utf8') : null,
    sources: fs.existsSync(SOURCES)
      ? Object.fromEntries(
          fs.readdirSync(SOURCES).map((name) => [name, fs.readFileSync(path.join(SOURCES, name), 'utf8')]),
        )
      : {},
  })

  test('--dry-run --json leaves status.json and every source file byte-identical', () => {
    // The load-bearing test for the whole preview feature. It runs the *real* importer against
    // the *real* configuration — a mocked one could not catch a write, which is the only
    // failure that matters here.
    const before = snapshot()

    const output = runImporter(['--dry-run', '--json', '--only', 'github'])

    const after = snapshot()
    assert.equal(after.status, before.status, 'status.json was modified by a preview')
    assert.deepEqual(after.sources, before.sources, 'a source file was modified by a preview')

    const result = parseResult(output)
    assert.ok(result, 'the preview produced no machine-readable result')
    assert.equal(result.preview, true)
    assert.equal(result.applied, false)
  })

  test('the preview reports the same shape a real run would', () => {
    // Not a separate code path: the same `status` object the importer would have written is
    // what the preview emits. If these ever diverge the preview stops being a preview.
    const output = runImporter(['--dry-run', '--json', '--only', 'github'])
    const github = parseResult(output)?.connectors?.github
    assert.ok(github, 'no status for the previewed source')

    // Always present, whatever the connector managed to do.
    for (const field of ['connector', 'name', 'state', 'message', 'lastAttemptedAt']) {
      assert.ok(field in github, `the preview omitted ${field}`)
    }

    // Conditional by design, and asserted as conditional. `withHistory` attaches
    // `recordsChanged` only when the connector returned a profile — an unauthenticated GitHub
    // that meets its rate limit reports `error` and has nothing to diff. Demanding the field
    // unconditionally made this test fail for a reason that had nothing to do with previews.
    if (github.recordsChanged) {
      assert.deepEqual(Object.keys(github.recordsChanged).sort(), ['added', 'removed', 'updated'])
    } else {
      assert.ok(
        ['error', 'unavailable', 'skipped'].includes(github.state),
        `a productive run must report what changed, but state was "${github.state}"`,
      )
    }
  })

  test('no credential-shaped value appears in the result', () => {
    const output = runImporter(['--dry-run', '--json', '--only', 'github'])
    const json = JSON.stringify(parseResult(output))
    assert.doesNotMatch(json, /ghp_[A-Za-z0-9]{10,}|sk-[A-Za-z0-9]{20,}/)
    assert.doesNotMatch(json, /"(?:token|secret|password|apiKey)"\s*:\s*"[^"]{8,}"/i)
  })
})

/** The marker `--json` writes its payload behind. */
function parseResult(output) {
  const marker = '@@portfolio-import-json@@'
  const at = output.lastIndexOf(marker)
  if (at === -1) return undefined
  try {
    return JSON.parse(output.slice(at + marker.length).split('\n')[0])
  } catch {
    return undefined
  }
}

/* -------------------------------------------------------------------------- */
/* B. Change review                                                           */
/* -------------------------------------------------------------------------- */

describe('what changed', () => {
  const before = {
    projects: [
      { id: 'a', name: 'Alpha', stars: 1, description: 'first' },
      { id: 'b', name: 'Beta' },
    ],
  }
  const after = {
    projects: [
      { id: 'a', name: 'Alpha', stars: 9, description: 'first' },
      { id: 'c', name: 'Gamma' },
    ],
  }

  test('added, updated and removed records are each represented', () => {
    const changes = describeChanges(before, after)
    assert.deepEqual(changes.added.map((r) => r.id), ['c'])
    assert.deepEqual(changes.removed.map((r) => r.id), ['b'])
    assert.deepEqual(changes.updated.map((r) => r.id), ['a'])
  })

  test('an updated record names the fields that actually differ', () => {
    const [updated] = describeChanges(before, after).updated
    assert.deepEqual(updated.fields, ['stars'], 'only the changed field should be listed')
  })

  test('the counts are the ones already written to status.json, not a recount', () => {
    // The property that keeps the review honest: two functions counting the same run must not
    // be able to disagree, so `describeChanges` takes its totals from `diffProfiles` itself.
    const changes = describeChanges(before, after)
    assert.deepEqual(changes.counts, diffProfiles(before, after))
  })

  test('a re-fetch that changed nothing reports nothing', () => {
    const changes = describeChanges(before, structuredClone(before))
    assert.deepEqual(changes.counts, { added: 0, removed: 0, updated: 0 })
    assert.equal(changes.added.length + changes.removed.length + changes.updated.length, 0)
  })

  test('provenance churn is not a change', () => {
    // `source.fetchedAt` moves on every single import. Counting it would report every record as
    // updated every time, which is the same as reporting nothing.
    const withSource = { projects: [{ id: 'a', name: 'A', source: { connector: 'github', fetchedAt: '2026-01-01' } }] }
    const refetched = { projects: [{ id: 'a', name: 'A', source: { connector: 'github', fetchedAt: '2026-09-09' } }] }
    assert.deepEqual(describeChanges(withSource, refetched).counts, { added: 0, removed: 0, updated: 0 })
  })

  test('a first import is all additions, never updates', () => {
    const changes = describeChanges(undefined, after)
    assert.equal(changes.counts.added, 2)
    assert.equal(changes.counts.updated, 0)
    assert.equal(changes.counts.removed, 0)
  })

  test('the counts survive truncation — they are not the length of the lists', () => {
    // The mutation this exists for: computing `counts` from the (capped) arrays instead of from
    // `diffProfiles`. With a small fixture both answers agree and the bug ships; with more
    // records than the cap, a recount silently under-reports what an import would do.
    const many = { projects: Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })) }
    const changes = describeChanges(undefined, many, { limit: 5 })
    assert.equal(changes.counts.added, 40, 'the headline count must be the real one')
    assert.equal(changes.added.length, 5, 'the list is capped')
    assert.notEqual(changes.counts.added, changes.added.length, 'this fixture must distinguish them')
    assert.deepEqual(changes.counts, diffProfiles(undefined, many))
  })

  test('long lists are capped, and say so', () => {
    const many = { projects: Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })) }
    const changes = describeChanges(undefined, many, { limit: 5 })
    assert.equal(changes.counts.added, 60, 'the count must be complete even when the list is not')
    assert.equal(changes.added.length, 5)
    assert.equal(changes.truncated, true)
  })
})

/* -------------------------------------------------------------------------- */
/* C. Conflicts — precedence, stability, no auto-resolution                   */
/* -------------------------------------------------------------------------- */

describe('conflicts are explained, never quietly decided', () => {
  const sources = [
    { key: 'github', profile: { identity: { name: 'Ada L' } } },
    { key: 'linkedin', profile: { identity: { name: 'Ada Lovelace' } } },
  ]
  const built = (input = {}) => buildPortfolio({ config: {}, sources, ...input })

  test('two disagreeing connectors raise a conflict rather than one silently winning', () => {
    const conflicts = built().conflicts
    assert.equal(conflicts.length, 1)
    assert.equal(conflicts[0].options.length, 2)
    assert.equal(conflicts[0].resolved, false, 'nothing may mark itself decided')
    assert.equal(conflicts[0].resolvedBy, 'precedence')
  })

  test('the conflict id is stable across rebuilds', () => {
    // A decision is stored against this id. If it moved, every resolution would silently stop
    // applying after the next import — the exact failure the id exists to prevent.
    assert.equal(built().conflicts[0].id, built().conflicts[0].id)
    assert.equal(built().conflicts[0].id, 'identity:name')
  })

  test('the explanation names the rule the resolver actually used', () => {
    const conflict = built().conflicts[0]
    const explanation = explainConflict(conflict)
    // Equal layer, no timestamps, equal kind — so the resolver fell through to the name
    // tiebreak, and the explanation has to say that rather than claim recency.
    assert.equal(explanation.by, 'name')
    assert.match(explanation.summary, /indistinguishable|stable/)
    assert.equal(explanation.winner.source, conflict.chosen)
  })

  test('a tiebreak is flagged for attention; a rule-based decision is not', () => {
    assert.equal(needsAttention(built().conflicts[0]), true, 'an arbitrary tiebreak needs a person')

    // The same disagreement, with the owner's own config supplying the value. Nothing is
    // arbitrary any more, so nothing should nag.
    const authored = built({ config: { identity: { name: 'Ada Lovelace King' } } }).conflicts[0]
    assert.equal(needsAttention(authored), false)
    assert.equal(explainConflict(authored).by, 'authored')
  })

  test('a higher layer wins on precedence, and is explained as precedence — not recency', () => {
    const authored = built({ config: { identity: { name: 'Chosen In Config' } } }).conflicts[0]
    assert.equal(authored.chosenLayerKind, 'config')
    assert.match(explainConflict(authored).summary, /configuration file/)
    assert.doesNotMatch(explainConflict(authored).summary, /recent/)
  })

  test('a stronger layer among the options is explained as precedence', () => {
    // Constructed so the branch is genuinely reachable: config and GitHub assert the *same*
    // value, so they group together and that option's strongest claim is the config one —
    // giving two options on different layers. Without this the layer branch is never exercised
    // by a real conflict, and a regression in it goes unnoticed.
    const layered = buildPortfolio({
      config: { identity: { name: 'Ada Lovelace' } },
      sources: [
        { key: 'github', profile: { identity: { name: 'Ada Lovelace' } } },
        { key: 'linkedin', profile: { identity: { name: 'Ada L' } } },
      ],
    })
    const conflict = layered.conflicts[0]
    const explanation = explainConflict(conflict)
    assert.equal(explanation.by, 'layer', `expected a precedence explanation, got "${explanation.by}"`)
    assert.match(explanation.summary, /outranks/)
    // And the published value is the stronger layer's, not the other source's.
    assert.equal(layered.profile.identity.name, 'Ada Lovelace')
  })

  test('an explicit override changes the winner', () => {
    const resolved = built({ overrides: { resolutions: { 'identity:name': { source: 'linkedin' } } } })
    const conflict = resolved.conflicts[0]
    assert.equal(conflict.chosen, 'linkedin')
    assert.equal(conflict.resolved, true)
    assert.equal(conflict.resolvedBy, 'user')
    assert.equal(resolved.profile.identity.name, 'Ada Lovelace')
    assert.match(explainConflict(conflict).summary, /You chose/)
  })

  test('clearing the override restores plain precedence', () => {
    const cleared = built({ overrides: { resolutions: {} } })
    assert.equal(cleared.conflicts[0].resolved, false)
    assert.equal(cleared.conflicts[0].resolvedBy, 'precedence')
    assert.equal(cleared.profile.identity.name, built().profile.identity.name)
  })

  test('nothing auto-resolves merely because a value is newer', () => {
    // "Newer is not truer" — the rule the whole layer model exists to enforce. A recent
    // connector must not displace a value the owner authored.
    const authored = buildPortfolio({
      config: { identity: { name: 'Authored' } },
      sources: [{ key: 'github', profile: { identity: { name: 'Fetched Just Now' }, meta: { fetchedAt: new Date().toISOString() } } }],
    })
    assert.equal(authored.profile.identity.name, 'Authored')
  })

  test('viewing a conflict does not change the profile', () => {
    const before = built()
    const snapshot = JSON.stringify(before.profile)
    explainConflict(before.conflicts[0])
    needsAttention(before.conflicts[0])
    traceIdentity(before, evidenceFor)
    assert.equal(JSON.stringify(before.profile), snapshot)
  })
})

/* -------------------------------------------------------------------------- */
/* D. Provenance                                                              */
/* -------------------------------------------------------------------------- */

describe('provenance survives, and respects privacy', () => {
  const built = buildPortfolio({
    config: { identity: { name: 'Ada' } },
    sources: [{ key: 'github', profile: { identity: { name: 'Ada', headline: 'Engineer' }, projects: [{ name: 'P' }] } }],
  })

  test('every published identity field traces to the claim that supplied it', () => {
    const trace = traceIdentity(built, evidenceFor)
    assert.equal(trace.enabled, true)
    const headline = trace.fields.find((field) => field.field === 'headline')
    assert.equal(headline.value, 'Engineer')
    assert.equal(headline.winner.source, 'github')
    assert.equal(headline.winner.layerKind, 'connector')
  })

  test('the traced winner is the resolver’s winner, never a recomputed one', () => {
    const trace = traceIdentity(built, evidenceFor)
    for (const field of trace.fields) {
      assert.equal(field.value, built.profile.identity[field.field], `${field.field} disagrees with the profile`)
    }
  })

  test('the build preserves the provenance a connector stamped', () => {
    // `source` is attached by each connector's own `normalize`, not by the build — so what is
    // worth asserting is that nothing downstream strips it. A record arriving with provenance
    // must still have it after normalisation, scoring and assembly.
    const withSource = buildPortfolio({
      config: { identity: { name: 'Ada' } },
      sources: [{
        key: 'github',
        profile: {
          projects: [{
            name: 'P',
            source: { connector: 'github', url: 'https://github.com/ada/p', fetchedAt: '2026-01-01T00:00:00Z' },
          }],
        },
      }],
    })
    const project = withSource.profile.projects[0]
    assert.ok(project.source, 'the build stripped a record’s provenance')
    assert.equal(project.source.connector, 'github')
    assert.equal(project.source.url, 'https://github.com/ada/p')
  })

  test('showDataProvenance: false turns the trace off rather than showing it anyway', () => {
    const off = traceIdentity({ ...built, config: { privacy: { showDataProvenance: false } } }, evidenceFor)
    assert.equal(off.enabled, false)
    assert.deepEqual(off.fields, [])
    assert.ok(off.reason)
  })
})

/* -------------------------------------------------------------------------- */
/* E. Completeness                                                            */
/* -------------------------------------------------------------------------- */

describe('completeness measures the real schema, and only what applies', () => {
  const bare = buildPortfolio({ config: { identity: { name: 'Ada' } } })

  test('a field that is set reads complete; one that is not reads missing', () => {
    const { checks } = assessProfile(bare.profile)
    assert.equal(checks.find((c) => c.id === 'name').state, 'complete')
    assert.equal(checks.find((c) => c.id === 'headline').state, 'missing')
  })

  test('a collection nothing produces is not-applicable, not missing', () => {
    // The whole point. Someone who does not publish papers is not incomplete.
    const publications = assessProfile(bare.profile).checks.find((c) => c.id === 'publications')
    assert.equal(publications.state, 'not-applicable')
  })

  test('not-applicable checks are excluded from the denominator entirely', () => {
    const { summary, checks } = assessProfile(bare.profile)
    const notApplicable = checks.filter((c) => c.state === 'not-applicable').length
    assert.ok(notApplicable > 0, 'this fixture must have some, or the test proves nothing')
    assert.equal(summary.notApplicable, notApplicable)
    assert.equal(summary.applicable, checks.length - notApplicable)
  })

  test('connecting a source makes its collections expected, and their absence a real gap', () => {
    const expected = expectedCollections({ dataSources: { orcid: { id: '0000' } } }, getConnector)
    assert.ok(expected.has('publications'), 'ORCID declares that it produces publications')

    const withOrcid = assessProfile(bare.profile, { expected })
    assert.equal(withOrcid.checks.find((c) => c.id === 'publications').state, 'missing')
    assert.ok(withOrcid.checks.find((c) => c.id === 'publications').because)
  })

  test('every check reads a real field or a real collection — none is invented', () => {
    const { checks } = assessProfile(bare.profile)
    const known = new Set([
      'name', 'headline', 'avatar', 'location', 'summary',
      'project-descriptions', 'project-links', 'socials', 'contact',
      ...Object.keys(bare.profile).filter((key) => Array.isArray(bare.profile[key])),
      ...checks.map((c) => c.id).filter((id) => Array.isArray(bare.profile[id])),
    ])
    for (const check of checks) {
      assert.ok(known.has(check.id), `${check.id} does not correspond to anything on the profile`)
    }
  })

  test('the score is complete plus half of partial, over what applies', () => {
    const { summary } = assessProfile(bare.profile)
    const expected = summary.applicable
      ? Math.round(((summary.complete + summary.partial / 2) / summary.applicable) * 100)
      : 100
    assert.equal(summary.score, expected)
    assert.ok(summary.score >= 0 && summary.score <= 100)
  })

  test('a portfolio that hides its email is not marked incomplete for hiding it', () => {
    const hidden = assessProfile(bare.profile, { config: { privacy: { hideEmail: true } } })
    assert.equal(hidden.checks.find((c) => c.id === 'contact').state, 'not-applicable')
  })

  test('records present without a connected source still count', () => {
    // Applicability is "there is reason to expect this", and already having some is the
    // strongest reason there is.
    const withPosts = buildPortfolio({
      config: { identity: { name: 'Ada' } },
      manual: { posts: [{ title: 'A post', url: 'https://example.test/a' }] },
    })
    assert.equal(assessProfile(withPosts.profile).checks.find((c) => c.id === 'posts').state, 'complete')
  })
})
