import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { mergeOverrides, applyClears, CLEARED } from '../src/admin/drafts.js'
import { buildPortfolio } from '../src/core/generate/build.js'

/**
 * Layering a draft on top of what is already published.
 *
 * `mergeOverrides` combines the overrides committed to `overrides.json` with the ones the editor
 * is holding but has not saved. It merged at the *collection* level and replaced at the record
 * level, so a draft patch for a record took the place of the published patch for that record
 * rather than layering onto it. Editing one field of a project silently discarded every other
 * field already published for it.
 *
 * The failure needed two conditions to be visible — a record with published overrides, and an
 * edit to a *different* field of that record — and until this repository had a non-empty
 * `overrides.json` the first condition never held. So the bug shipped, and was found by hand:
 * renaming a showcased project made it disappear from the showcase, because `showcase: true`
 * went with the name.
 *
 * These tests are the generic statement of the rule. It is not a project concern: the same code
 * path carries every collection, so a second one is tested to keep the fix from being read as a
 * project-specific patch.
 */

describe('a draft patch layers onto the published one', () => {
  const published = {
    records: {
      projects: {
        'my-app': {
          showcase: true,
          category: 'SaaS',
          liveUrl: 'https://my-app.example',
          description: 'Billing for small teams',
        },
      },
    },
  }

  test('editing the name keeps every other published field', () => {
    const merged = mergeOverrides(published, {
      records: { projects: { 'my-app': { name: 'New name' } } },
    })

    assert.deepEqual(merged.records.projects['my-app'], {
      showcase: true,
      category: 'SaaS',
      liveUrl: 'https://my-app.example',
      description: 'Billing for small teams',
      name: 'New name',
    })
  })

  test('and editing the category keeps the name, url and showcase flag', () => {
    // The inverse, because a merge that happened to preserve fields in one direction only
    // would still be wrong.
    const merged = mergeOverrides(
      { records: { projects: { 'my-app': { name: 'Kept', liveUrl: 'https://kept.example', showcase: true } } } },
      { records: { projects: { 'my-app': { category: 'Dashboards' } } } },
    )

    assert.deepEqual(merged.records.projects['my-app'], {
      name: 'Kept',
      liveUrl: 'https://kept.example',
      showcase: true,
      category: 'Dashboards',
    })
  })

  test('the draft still wins on a field they both set', () => {
    const merged = mergeOverrides(
      { records: { projects: { 'my-app': { name: 'Published', showcase: true } } } },
      { records: { projects: { 'my-app': { name: 'Drafted' } } } },
    )
    assert.equal(merged.records.projects['my-app'].name, 'Drafted')
    assert.equal(merged.records.projects['my-app'].showcase, true)
  })

  test('a cleared field still overrides a published value', () => {
    // Clearing has to survive the deeper merge. The sentinel is how "I emptied this" is told
    // apart from "I never touched this"; if the merge dropped it, the published text would come
    // straight back and the box would refill itself.
    const merged = mergeOverrides(
      { records: { projects: { 'my-app': { description: 'Old', showcase: true } } } },
      { records: { projects: { 'my-app': { description: CLEARED } } } },
    )
    assert.equal(merged.records.projects['my-app'].description, CLEARED)

    // `applyClears` then turns the marker back into the absence it stands for — the key goes,
    // so the override stops speaking for that field and whatever was imported applies again.
    // The sibling field must not go with it.
    const cleared = applyClears(merged)
    assert.ok(!('description' in cleared.records.projects['my-app']))
    assert.equal(cleared.records.projects['my-app'].showcase, true)
  })

  test('a record the draft does not mention is untouched', () => {
    const merged = mergeOverrides(
      { records: { projects: { a: { showcase: true }, b: { category: 'Tools' } } } },
      { records: { projects: { a: { name: 'Edited' } } } },
    )
    assert.deepEqual(merged.records.projects.b, { category: 'Tools' })
  })
})

describe('the same rule holds for other collections', () => {
  // Not a project-specific workaround: `mergeBuckets` is the one path every collection's
  // record patches travel, so if it were wrong here it would be wrong everywhere.
  test('a skill keeps its published icon when its category is edited', () => {
    const merged = mergeOverrides(
      { records: { skills: { docker: { icon: 'docker', url: 'https://www.docker.com' } } } },
      { records: { skills: { docker: { category: 'Containers' } } } },
    )
    assert.deepEqual(merged.records.skills.docker, {
      icon: 'docker',
      url: 'https://www.docker.com',
      category: 'Containers',
    })
  })

  test('an experience record keeps its published fields too', () => {
    const merged = mergeOverrides(
      { records: { experience: { acme: { role: 'Engineer', location: 'Remote' } } } },
      { records: { experience: { acme: { description: 'Did the work' } } } },
    )
    assert.deepEqual(merged.records.experience.acme, {
      role: 'Engineer',
      location: 'Remote',
      description: 'Did the work',
    })
  })
})

describe('the merged result survives the real pipeline', () => {
  // The unit assertions above prove the shape. This proves the shape is the one that matters:
  // the merged overrides are what `buildPortfolio` is handed, and the fields have to arrive on
  // the built record, not merely in the object passed to it.
  test('a partial edit over published overrides keeps the showcase flag', () => {
    const merged = mergeOverrides(
      {
        records: {
          projects: {
            'my-app': { showcase: true, category: 'SaaS', liveUrl: 'https://my-app.example' },
          },
        },
      },
      { records: { projects: { 'my-app': { name: 'Renamed' } } } },
    )

    const built = buildPortfolio({
      config: { identity: { name: 'Someone Else' } },
      overrides: applyClears(merged),
    })

    const project = (built.profile.projects ?? []).find((p) => p.name === 'Renamed')
    assert.ok(project, 'the renamed project exists')
    assert.equal(project.showcase, true, 'and is still in the showcase')
    assert.equal(project.category, 'SaaS')
    assert.match(project.liveUrl, /^https:\/\/my-app\.example\/?$/)
  })
})
