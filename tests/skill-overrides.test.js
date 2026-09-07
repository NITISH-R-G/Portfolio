import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { buildPortfolio } from '../src/core/generate/build.js'

/**
 * Skill overrides, end to end through the real pipeline.
 *
 * These exist because every one of them was broken at once, silently, for three separate
 * reasons — and because the shape of the failure was the kind that testing the parts would have
 * missed. `applyOverrides` worked. `normalizeProfile` worked. `deriveSkills` worked. The bug was
 * in how the three composed:
 *
 *   1. The skill normalizer required a `name` and emitted no `id`, so a patch carrying only
 *      `{ icon }` normalized to `null` and was discarded before it could be matched.
 *   2. `deriveSkills` rebuilt an evidenced skill field by field and dropped anything it did not
 *      name — including `icon` and `url` — while the unevidenced branch spread the record and
 *      kept them. The same override worked in one branch and not the other.
 *   3. Overrides were applied *before* derivation, and `skills` is the one collection the
 *      pipeline derives. A patch against a skill computed from evidence had nothing to attach
 *      to when the override pass ran.
 *
 * So every test here goes through `buildPortfolio` — the real entry point, with all three stages
 * in their real order. A test that called `applyOverrides` directly would have passed against
 * the broken code, which is precisely what made the bug survive so long.
 *
 * "Derived" below means a skill the engine computed from evidence — a technology named by a
 * project — as opposed to one the owner declared in `manual.json`. The distinction is the whole
 * point: those are the two branches that disagreed.
 *
 * This file stops at the built profile. What the adapter and his `TechStack` component do with
 * it is covered in `src/features/portfolio/data/skill-overrides.test.ts`, which runs under
 * vitest because the adapter is TypeScript and the component has to actually render.
 */

/** A profile whose skills are all derived from project evidence, never declared. */
const derived = (overrides) =>
  buildPortfolio({
    config: { identity: { name: 'Test Person' } },
    manual: {
      projects: [
        { name: 'Alpha', technologies: ['Docker', 'TypeScript', 'Redis'] },
        { name: 'Beta', technologies: ['Docker', 'TypeScript'] },
      ],
    },
    overrides,
  })

/** The same technologies, declared by hand instead — the other branch of `deriveSkills`. */
const declared = (overrides) =>
  buildPortfolio({
    config: { identity: { name: 'Test Person' } },
    manual: {
      skills: [
        { name: 'Docker', category: 'Infrastructure' },
        { name: 'TypeScript', category: 'Languages' },
        { name: 'Redis', category: 'Data' },
      ],
    },
    overrides,
  })

const skillNamed = (built, name) =>
  (built.profile.skills ?? []).find((skill) => skill.name === name)

describe('overrides on a derived skill', () => {
  // One patch carrying all three fields, because that is how the admin writes them — and
  // because a partial patch is exactly what the normalizer used to reject.
  const patch = {
    records: {
      skills: {
        docker: { icon: 'docker', url: 'https://www.docker.com', category: 'Containers' },
      },
    },
  }

  test('icon survives normalization, merge and derivation', () => {
    assert.equal(skillNamed(derived(patch), 'Docker').icon, 'docker')
  })

  test('url survives, and is normalized as a link rather than passed through raw', () => {
    const url = skillNamed(derived(patch), 'Docker').url
    // `url()` in the schema canonicalizes and is the same guard that keeps a `javascript:`
    // URL out of a pill the page turns into an anchor.
    assert.match(url, /^https:\/\/www\.docker\.com\/?$/)
  })

  test('category survives, and replaces the one the generator inferred', () => {
    // The generator categorizes "Docker" as Infrastructure on its own. The point of the
    // assertion is that the owner's choice wins over the inference.
    assert.equal(skillNamed(derived(), 'Docker').category, 'Infrastructure')
    assert.equal(skillNamed(derived(patch), 'Docker').category, 'Containers')
  })

  test('the other derived skills are untouched', () => {
    const built = derived(patch)
    assert.equal(skillNamed(built, 'TypeScript').icon, undefined)
    assert.equal(skillNamed(built, 'TypeScript').category, 'Languages')
  })
})

describe('hiding a derived skill', () => {
  test('it is gone from the built profile', () => {
    const built = derived({ hidden: { skills: ['docker'] } })
    assert.equal(skillNamed(built, 'Docker'), undefined)
    // The others stay: hiding one must not empty the collection.
    assert.ok(skillNamed(built, 'TypeScript'))
  })
})

describe('reordering derived skills', () => {
  test('the pinned order is what the built profile holds', () => {
    // Derived skills come out ranked by evidence weight — Docker and TypeScript both appear
    // twice, Redis once — so this order is not the one the pipeline would choose.
    const built = derived({ order: { skills: ['redis', 'typescript', 'docker'] } })
    const names = (built.profile.skills ?? []).map((skill) => skill.name)
    assert.deepEqual(names.slice(0, 3), ['Redis', 'TypeScript', 'Docker'])
  })
})

describe('the same overrides on a declared skill', () => {
  // The branch that already worked. It is tested because the fix changed code both branches
  // run through, and a repair that trades one broken path for another is not a repair.
  test('icon, url and category all apply', () => {
    const built = declared({
      records: {
        skills: {
          docker: { icon: 'docker', url: 'https://www.docker.com', category: 'Containers' },
        },
      },
    })
    const skill = skillNamed(built, 'Docker')
    assert.equal(skill.icon, 'docker')
    assert.match(skill.url, /^https:\/\/www\.docker\.com\/?$/)
    assert.equal(skill.category, 'Containers')
  })

  test('hiding works', () => {
    assert.equal(skillNamed(declared({ hidden: { skills: ['docker'] } }), 'Docker'), undefined)
  })

  test('reordering works', () => {
    const built = declared({ order: { skills: ['redis', 'typescript', 'docker'] } })
    assert.deepEqual(
      (built.profile.skills ?? []).map((skill) => skill.name).slice(0, 3),
      ['Redis', 'TypeScript', 'Docker'],
    )
  })
})

describe('a declared skill that also has evidence', () => {
  /**
   * The case the post-derivation pass does not cover.
   *
   * `deriveSkills` has two branches: a skill with evidence is rebuilt field by field, one
   * without is spread. Only the rebuild can lose fields, and it did — so a technology written
   * into `manual.json` with a logo kept it right up until a project happened to mention the same
   * technology, at which point the logo silently disappeared.
   *
   * An override would survive that, because overrides are re-applied afterwards. Hand-authored
   * data is not, which is why this needs its own test: reverting the fix in `deriveSkills` alone
   * leaves every override test passing.
   */
  const declaredAndEvidenced = buildPortfolio({
    config: { identity: { name: 'Test Person' } },
    manual: {
      skills: [{ name: 'Docker', icon: 'docker', url: 'https://www.docker.com' }],
      projects: [{ name: 'Alpha', technologies: ['Docker'] }],
    },
  })

  test('the evidenced rebuild keeps the icon written by hand', () => {
    assert.equal(skillNamed(declaredAndEvidenced, 'Docker').icon, 'docker')
  })

  test('and the url', () => {
    assert.match(skillNamed(declaredAndEvidenced, 'Docker').url, /^https:\/\/www\.docker\.com\/?$/)
  })

  test('and it really did take the evidenced branch', () => {
    // Otherwise the two assertions above would be testing the spread branch, which never broke.
    assert.ok((skillNamed(declaredAndEvidenced, 'Docker').evidence ?? []).length > 0)
  })
})

describe('a patch is matched to its skill by identity', () => {
  test('a patch with no name still finds its target', () => {
    // The original failure in one line: `{ icon }` carries nothing the normalizer treats as a
    // record, so it became `null` and vanished. The key it is stored under is the identity.
    const built = derived({ records: { skills: { docker: { icon: 'docker' } } } })
    assert.equal(skillNamed(built, 'Docker').icon, 'docker')
  })

  test('and does not leak onto any other skill', () => {
    const built = derived({ records: { skills: { docker: { icon: 'docker' } } } })
    const carrying = (built.profile.skills ?? []).filter((skill) => skill.icon === 'docker')
    assert.deepEqual(carrying.map((skill) => skill.name), ['Docker'])
  })

  test('a patch whose key matches no skill adds nothing', () => {
    // An orphan patch used to be pushed onto the collection as a user-authored record. With no
    // name it cannot be one, and inventing a nameless pill is worse than ignoring the patch.
    const built = derived({ records: { skills: { kubernetes: { icon: 'docker' } } } })
    const names = (built.profile.skills ?? []).map((skill) => skill.name)
    assert.deepEqual(names.sort(), ['Docker', 'Redis', 'TypeScript'])
  })

  test('renaming a skill through a patch keeps the patch attached to it', () => {
    // The key stays the original identity even when the patch changes the name, which is what
    // stops a rename from orphaning its own override.
    const built = derived({
      records: { skills: { docker: { name: 'Docker Engine', icon: 'docker' } } },
    })
    assert.equal(skillNamed(built, 'Docker'), undefined)
    assert.equal(skillNamed(built, 'Docker Engine').icon, 'docker')
  })
})
