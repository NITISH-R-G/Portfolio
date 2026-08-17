import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { PERSONAS, getPersona } from '../examples/personas.js'
import { buildPortfolio } from '../src/core/generate/build.js'
import { validateProfile } from '../src/core/schema/validate.js'

const NOW = Date.parse('2026-08-14T00:00:00Z')

/** Build a persona through the real pipeline, exactly as the site does. */
const build = (persona) =>
  buildPortfolio({ config: persona.config, manual: persona.profile, now: NOW })

const visibleIds = (built) => built.sections.filter((s) => s.visible).map((s) => s.id)

describe('sample profiles', () => {
  test('every persona builds without errors', () => {
    for (const persona of PERSONAS) {
      const built = build(persona)
      const errors = built.validation.findings.filter((f) => f.level === 'error')
      assert.deepEqual(errors, [], `"${persona.id}" produced validation errors`)
      assert.equal(
        built.configIssues.filter((i) => i.level === 'error').length, 0,
        `"${persona.id}" produced config errors`,
      )
    }
  })

  test('every persona names someone and says something about them', () => {
    for (const persona of PERSONAS) {
      const { profile } = build(persona)
      assert.ok(profile.identity.name, `"${persona.id}" has a name`)
      assert.ok(profile.identity.headline, `"${persona.id}" has a headline`)
      assert.ok(profile.identity.summary, `"${persona.id}" has a summary`)
    }
  })

  test('every persona scores as reasonably complete', () => {
    for (const persona of PERSONAS) {
      const { validation } = build(persona)
      assert.ok(
        validation.completeness.score >= 50,
        `"${persona.id}" scored ${validation.completeness.score}% — too thin to demonstrate anything`,
      )
    }
  })
})

describe('section auto-detection', () => {
  test('personas produce genuinely different sections', () => {
    // If auto-detection regressed into "show everything" or "show a fixed set", these
    // would collapse to one or two distinct shapes. That is the regression this catches.
    const shapes = new Set(PERSONAS.map((p) => visibleIds(build(p)).join(',')))
    assert.ok(
      shapes.size >= PERSONAS.length - 1,
      `expected nearly every persona to have a distinct section set, got ${shapes.size} shapes across ${PERSONAS.length} personas`,
    )
  })

  test('a section appears only where the data supports it', () => {
    /** @type {[string, string, boolean][]} persona id, section id, expected */
    const expectations = [
      ['researcher', 'publications', true],
      ['researcher', 'packages', false],
      ['researcher', 'competitive', false],
      ['competitive-programmer', 'competitive', true],
      ['competitive-programmer', 'publications', false],
      ['competitive-programmer', 'projects', false],
      ['ai-ml-engineer', 'models', true],
      ['open-source-maintainer', 'packages', true],
      ['open-source-maintainer', 'writing', true],
      ['hackathon-builder', 'hackathons', true],
      ['hackathon-builder', 'publications', false],
      ['student', 'education', true],
      ['student', 'languages', true],
      ['devops-engineer', 'certifications', true],
      ['frontend-developer', 'talks', true],
    ]

    for (const [personaId, sectionId, expected] of expectations) {
      const sections = visibleIds(build(getPersona(personaId)))
      assert.equal(
        sections.includes(sectionId), expected,
        `"${personaId}" should ${expected ? '' : 'not '}show "${sectionId}" (got: ${sections.join(', ')})`,
      )
    }
  })

  test('no persona renders a section with nothing in it', () => {
    for (const persona of PERSONAS) {
      const built = build(persona)
      for (const section of built.sections.filter((s) => s.visible)) {
        // hero and contact are always considered; everything else must have earned its place.
        if (section.id === 'hero' || section.id === 'contact') continue
        assert.ok(
          section.count > 0,
          `"${persona.id}" renders an empty "${section.id}" section`,
        )
      }
    }
  })

  test('hidden sections say why they are hidden', () => {
    const built = build(getPersona('competitive-programmer'))
    const publications = built.sections.find((s) => s.id === 'publications')
    assert.equal(publications.visible, false)
    assert.equal(publications.reason, 'auto-hidden')
    assert.equal(publications.count, 0)
  })
})

describe('evidence and provenance', () => {
  test('sample figures are never presented as platform-reported', () => {
    // The personas are invented. Nothing here carries a `fetchedAt`, so any statistic
    // derived from them must read as self-reported — the same rule a real manual
    // connector obeys.
    for (const persona of PERSONAS) {
      const { profile } = build(persona)
      for (const entry of profile.stats.entries) {
        assert.notEqual(
          entry.kind, 'fetched',
          `"${persona.id}" presents "${entry.id}" as fetched, but nothing was ever fetched`,
        )
      }
    }
  })

  test('the researcher h-index is computed from the publications on the page', () => {
    const { profile } = build(getPersona('researcher'))
    const hIndex = profile.stats.entries.find((e) => e.id === 'h-index')
    // Citations 142, 88, 61, 37, 12 → four papers with at least four citations each.
    assert.equal(hIndex.value, 5)
    assert.equal(hIndex.kind, 'derived')

    const citations = profile.stats.entries.find((e) => e.id === 'citations')
    assert.equal(citations.value, 142 + 88 + 61 + 37 + 12)
  })

  test('competitive totals aggregate across platforms', () => {
    const { profile } = build(getPersona('competitive-programmer'))
    const solved = profile.stats.entries.find((e) => e.id === 'problems-solved')
    assert.equal(solved.value, 1_420 + 640)

    // The peak names the platform it came from rather than pretending ratings from
    // different sites are comparable on one scale.
    const peak = profile.stats.entries.find((e) => e.id === 'peak-rating')
    assert.equal(peak.value, 2_410, 'the highest rating across platforms')
    assert.equal(peak.note, 'LeetCode')
    assert.equal(peak.kind, 'stated', 'sample data was typed, not fetched')
  })

  test('package downloads are summed and attributed', () => {
    const { profile } = build(getPersona('open-source-maintainer'))
    const downloads = profile.stats.entries.find((e) => e.id === 'downloads')
    assert.equal(downloads.value, 2_400_000 + 640_000)
    assert.match(downloads.note, /last month/)
  })
})

describe('themes and SEO across personas', () => {
  test('each persona resolves its declared theme', () => {
    for (const persona of PERSONAS) {
      const built = build(persona)
      const expected = persona.config.theme?.preset
      if (!expected) continue
      assert.equal(built.theme.presetId, expected, `"${persona.id}" theme`)
      assert.ok(built.theme.vars['--color-bg'], `"${persona.id}" resolved a background colour`)
      assert.ok(built.theme.css.startsWith(':root'), `"${persona.id}" emitted CSS`)
    }
  })

  test('SEO is generated from real data for every persona', () => {
    for (const persona of PERSONAS) {
      const { seo, profile } = build(persona)
      assert.ok(seo.title.includes(profile.identity.name), `"${persona.id}" title names the person`)
      assert.ok(seo.description.length > 20, `"${persona.id}" has a real description`)
      assert.ok(seo.html.includes('og:title'), `"${persona.id}" emits Open Graph tags`)

      const person = seo.structuredData.find((node) => node['@type'] === 'Person')
      assert.equal(person.name, profile.identity.name)
    }
  })

  test('a persona with publications emits scholarly structured data', () => {
    const { seo } = build(getPersona('researcher'))
    const types = seo.structuredData.map((node) => node['@type'])
    assert.ok(types.includes('Person'))
    assert.ok(
      seo.structuredData.some((node) => JSON.stringify(node).includes('ScholarlyArticle')),
      'publications should surface as scholarly structured data',
    )
  })
})

describe('degenerate profiles', () => {
  test('an entirely empty portfolio renders nothing at all', () => {
    // Not even an empty hero. A portfolio with no data should be blank rather than a
    // skeleton of headings with nothing under them.
    const built = buildPortfolio({ now: NOW })

    assert.deepEqual(visibleIds(built), [], 'nothing is invented from nothing')
    assert.equal(built.profile.projects.length, 0)
    assert.equal(built.profile.stats.entries.length, 0)
    assert.ok(built.seo.title, 'still produces a title rather than crashing')
  })

  test('a name alone is enough to get a hero and a working portfolio', () => {
    const built = buildPortfolio({ config: { identity: { name: 'Ada Lovelace' } }, now: NOW })

    assert.equal(built.profile.identity.name, 'Ada Lovelace')
    assert.deepEqual(visibleIds(built), ['hero'])
    assert.match(built.seo.title, /Ada Lovelace/)
    assert.equal(built.configIssues.filter((i) => i.level === 'error').length, 0)
  })

  test('malformed data is dropped rather than rendered', () => {
    const built = buildPortfolio({
      config: { identity: { name: 'Test' } },
      manual: {
        projects: [
          { name: 'Real' },
          { description: 'no name, so not a project' },
          null,
          'a bare string',
          42,
        ],
        skills: ['Python', { name: 'Go' }, null],
      },
      now: NOW,
    })

    assert.deepEqual(built.profile.projects.map((p) => p.name), ['Real'])
    assert.deepEqual(built.profile.skills.map((s) => s.name).sort(), ['Go', 'Python'])
  })

  test('a profile of only hidden records reports as empty, not broken', () => {
    const built = buildPortfolio({
      config: { identity: { name: 'Test' } },
      manual: { projects: [{ id: 'p1', name: 'One' }] },
      overrides: { hidden: { projects: ['p1'] } },
      now: NOW,
    })
    assert.equal(built.profile.projects.length, 0)
    assert.ok(!visibleIds(built).includes('projects'))
  })
})

describe('override layering', () => {
  const persona = getPersona('software-engineer')

  test('an override wins over imported data without destroying it', () => {
    const overrides = { identity: { headline: 'Principal Engineer' } }
    const built = buildPortfolio({
      config: persona.config, manual: persona.profile, overrides, now: NOW,
    })

    assert.equal(built.profile.identity.headline, 'Principal Engineer')
    // The underlying layers are untouched, which is what makes a re-import safe.
    assert.equal(persona.config.identity.headline, 'Senior Software Engineer')
  })

  test('hiding a project removes it from the totals it contributed to', () => {
    const before = build(persona)
    const beforeStars = before.profile.stats.entries.find((e) => e.id === 'stars').value

    const after = buildPortfolio({
      config: persona.config,
      manual: persona.profile,
      overrides: { hidden: { projects: ['pgqueue'] } },
      now: NOW,
    })
    const afterStars = after.profile.stats.entries.find((e) => e.id === 'stars').value

    assert.equal(beforeStars, 412 + 96)
    assert.equal(afterStars, 96, 'a portfolio must not advertise a number it is not showing')
  })

  test('an explicit order pins records ahead of the computed ranking', () => {
    const built = buildPortfolio({
      config: persona.config,
      manual: persona.profile,
      overrides: { order: { projects: ['schema-drift'] } },
      now: NOW,
    })
    assert.equal(built.profile.projects[0].id, 'schema-drift')
  })

  test('an override for a record that no longer exists becomes a record of its own', () => {
    // Otherwise a user's hand-written entry would silently vanish the first time the
    // upstream id changed.
    const built = buildPortfolio({
      config: persona.config,
      manual: persona.profile,
      overrides: { records: { projects: { 'hand-written': { name: 'Written by hand' } } } },
      now: NOW,
    })
    assert.ok(built.profile.projects.some((p) => p.name === 'Written by hand'))
  })
})
