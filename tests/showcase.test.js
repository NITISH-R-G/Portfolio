import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { buildPortfolio } from '../src/core/generate/build.js'

/**
 * The showcase data path.
 *
 * A showcase item is a project the owner marked, so most of this is really asking whether the
 * `showcase` and `category` fields survive the same journey every other project field takes —
 * normalization, layering, override, ranking, section resolution. They are new fields on an old
 * record, and the failure mode for a new field in this schema is silent: the normalizer drops
 * what it does not name, which is exactly how `icon` and `url` on skills went missing.
 *
 * The tests build with no connector data at all, because the reusability claim is the point: an
 * engine user who has connected nothing must still be able to assemble a showcase by hand.
 *
 * What the adapter and the rendered component do with this is in
 * `src/features/portfolio/data/showcase.test.ts`, which runs under vitest.
 */

/** A fork with nothing imported, building a showcase purely through the admin's own path. */
const byHand = (records) =>
  buildPortfolio({
    config: { identity: { name: 'Someone Else' } },
    overrides: { records: { projects: records } },
  })

const showcasedIn = (built) => (built.profile.projects ?? []).filter((p) => p.showcase === true)

describe('a showcase built entirely by hand', () => {
  // This is the "another developer forks the repository" case: no GitHub, no manual.json, only
  // what the admin writes. If the override system could not create records this would be empty.
  const built = byHand({
    'manual-a': {
      name: 'My SaaS',
      description: 'Billing for small teams',
      liveUrl: 'https://saas.test',
      repository: 'https://github.com/someone/saas',
      showcase: true,
      category: 'SaaS',
    },
    'manual-b': { name: 'My Tool', liveUrl: 'https://tool.test', showcase: true },
    'manual-c': { name: 'Not shown', liveUrl: 'https://other.test' },
  })

  test('the marked projects exist and carry their fields', () => {
    const saas = showcasedIn(built).find((p) => p.name === 'My SaaS')
    assert.ok(saas, 'a hand-added project reaches the built profile')
    assert.equal(saas.category, 'SaaS')
    assert.equal(saas.description, 'Billing for small teams')
    assert.match(saas.liveUrl, /^https:\/\/saas\.test\/?$/)
    assert.match(saas.repository, /github\.com\/someone\/saas/)
  })

  test('an unmarked project is not in the showcase', () => {
    assert.ok(!showcasedIn(built).some((p) => p.name === 'Not shown'))
  })

  test('the section turns itself on, and counts what is marked', () => {
    const section = (built.sections ?? []).find((s) => s.id === 'showcase')
    assert.equal(section.visible, true)
    assert.equal(section.count, 2)
    assert.equal(section.reason, 'auto-shown')
  })

  test('and turns itself off when nothing is marked', () => {
    // The empty case has to be invisible rather than an empty grid: this is what an
    // unconfigured fork looks like on its first run.
    const empty = byHand({ 'manual-a': { name: 'My SaaS', liveUrl: 'https://saas.test' } })
    const section = (empty.sections ?? []).find((s) => s.id === 'showcase')
    assert.equal(section.visible, false)
  })
})

describe('editing a showcase item', () => {
  const edited = byHand({
    'manual-a': {
      name: 'Renamed',
      description: 'New words',
      liveUrl: 'https://changed.test',
      showcase: true,
      category: 'Dashboards',
    },
  })

  test('title, description, url and category all reach the built profile', () => {
    const item = showcasedIn(edited)[0]
    assert.equal(item.name, 'Renamed')
    assert.equal(item.description, 'New words')
    assert.match(item.liveUrl, /^https:\/\/changed\.test\/?$/)
    assert.equal(item.category, 'Dashboards')
  })

  test('unmarking removes it from the showcase without deleting the project', () => {
    const off = byHand({
      'manual-a': { name: 'Renamed', liveUrl: 'https://changed.test', showcase: false },
    })
    assert.equal(showcasedIn(off).length, 0)
    assert.ok((off.profile.projects ?? []).some((p) => p.name === 'Renamed'))
  })
})

describe('order and visibility', () => {
  const records = {
    'manual-a': { name: 'Alpha', liveUrl: 'https://a.test', showcase: true },
    'manual-b': { name: 'Beta', liveUrl: 'https://b.test', showcase: true },
    'manual-c': { name: 'Gamma', liveUrl: 'https://c.test', showcase: true },
  }

  test('a pinned order survives generation', () => {
    // Projects are ranked before they are rendered, so an order that holds here is one that
    // survived the ranking rather than one the ranking happened to agree with.
    const built = buildPortfolio({
      config: { identity: { name: 'Someone Else' } },
      overrides: {
        records: { projects: records },
        order: { projects: ['manual-c', 'manual-a', 'manual-b'] },
      },
    })
    assert.deepEqual(
      showcasedIn(built).map((p) => p.name),
      ['Gamma', 'Alpha', 'Beta'],
    )
  })

  test('a hidden project leaves the showcase', () => {
    const built = buildPortfolio({
      config: { identity: { name: 'Someone Else' } },
      overrides: { records: { projects: records }, hidden: { projects: ['manual-b'] } },
    })
    assert.deepEqual(
      showcasedIn(built).map((p) => p.name),
      ['Alpha', 'Gamma'],
    )
  })
})

describe('the reusable parts carry no personal data', () => {
  const read = (relative) => readFileSync(join(import.meta.dirname, '..', relative), 'utf8')

  test('the showcase component names no project, url or person', () => {
    // The component must be a renderer, not a copy of one portfolio. Anything specific to a
    // deployment belongs in the data layer, which is what makes the engine reusable.
    const source = read('src/features/portfolio/components/showcase/index.tsx')
    assert.ok(!/https?:\/\/(?!\S*example)/.test(source), 'no hard-coded URLs')
    assert.ok(!/nitish|amypo|intelli|vercel\.app/i.test(source), 'no project or owner names')
  })

  test('the admin panel names none either', () => {
    const source = read('src/admin/panels/ShowcasePanel.jsx')
    assert.ok(!/nitish|amypo|intelli|vercel\.app/i.test(source))
  })

  test('the owner\'s own showcase lives in the data layer', () => {
    // Where it should be: a fork replaces this file and keeps every line of the components.
    const overrides = JSON.parse(read('src/data/overrides.json'))
    const marked = Object.values(overrides.records?.projects ?? {}).filter((p) => p.showcase)
    assert.ok(marked.length > 0, 'this portfolio configures its showcase as data')
  })
})
