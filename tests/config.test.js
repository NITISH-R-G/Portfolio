import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { resolveConfig, normalizeBase, absoluteBaseUrl, resolveSectionOrder } from '../src/core/config/resolve.js'
import { SECTION_IDS } from '../src/core/config/defaults.js'

describe('base path normalization', () => {
  test('produces the leading-and-trailing-slash form Vite needs', () => {
    assert.equal(normalizeBase('repo'), '/repo/')
    assert.equal(normalizeBase('/repo'), '/repo/')
    assert.equal(normalizeBase('/repo/'), '/repo/')
    assert.equal(normalizeBase('/'), '/')
    assert.equal(normalizeBase(''), '/')
    assert.equal(normalizeBase(undefined), '/')
    assert.equal(normalizeBase('//repo//'), '/repo/')
  })

  test('accepts a pasted full URL and takes its path', () => {
    assert.equal(normalizeBase('https://user.github.io/Portfolio'), '/Portfolio/')
    assert.equal(normalizeBase('https://ada.dev'), '/')
  })
})

describe('absolute base url', () => {
  test('joins origin and mount path', () => {
    assert.equal(absoluteBaseUrl('https://ada.dev', '/'), 'https://ada.dev/')
    assert.equal(absoluteBaseUrl('https://user.github.io', '/Portfolio/'), 'https://user.github.io/Portfolio/')
  })

  test('does not double up when the url already contains the base', () => {
    assert.equal(
      absoluteBaseUrl('https://user.github.io/Portfolio', '/Portfolio/'),
      'https://user.github.io/Portfolio/',
    )
  })

  test('returns empty when no url is configured', () => {
    assert.equal(absoluteBaseUrl('', '/x/'), '')
  })
})

describe('config resolution', () => {
  test('an empty config resolves to a complete working config', () => {
    const { config, issues } = resolveConfig({})
    assert.equal(config.site.base, '/')
    assert.equal(config.theme.preset, 'minimal-dark')
    assert.equal(config.layout.navigation, 'minimap')
    assert.equal(Object.keys(config.sections).length, SECTION_IDS.length)
    assert.ok(!issues.some((i) => i.level === 'error'))
  })

  test('a name-only config is enough', () => {
    const { config, issues } = resolveConfig({ identity: { name: 'Ada Lovelace' } })
    assert.equal(config.identity.name, 'Ada Lovelace')
    assert.equal(config.site.title, 'Ada Lovelace')
    assert.equal(issues.filter((i) => i.level === 'error').length, 0)
  })

  test('derives title and description from identity when unset', () => {
    const { config } = resolveConfig({
      identity: { name: 'Ada', headline: 'Engineer', summary: 'Builds things.' },
    })
    assert.equal(config.site.title, 'Ada — Engineer')
    assert.equal(config.site.description, 'Builds things.')
  })

  test('an explicit title is not overwritten', () => {
    const { config } = resolveConfig({ identity: { name: 'Ada' }, site: { title: 'My Site' } })
    assert.equal(config.site.title, 'My Site')
  })

  test('user values merge over defaults without clobbering siblings', () => {
    const { config } = resolveConfig({ theme: { accent: '#ff0000' } })
    assert.equal(config.theme.accent, '#ff0000')
    assert.equal(config.theme.preset, 'minimal-dark', 'sibling default survives')
  })

  test('invalid enum values fall back with a warning instead of breaking the build', () => {
    const { config, issues } = resolveConfig({
      layout: { navigation: 'holographic' },
      animations: { intensity: 'ludicrous' },
    })
    assert.equal(config.layout.navigation, 'minimap')
    assert.equal(config.animations.intensity, 'standard')
    assert.equal(issues.filter((i) => i.path === 'layout.navigation').length, 1)
    assert.equal(issues.filter((i) => i.path === 'animations.intensity').length, 1)
  })

})

describe('section order', () => {
  test('a partial order is honoured and the rest appended', () => {
    const order = resolveSectionOrder(['contact', 'projects'], [...SECTION_IDS])
    assert.equal(order[0], 'contact')
    assert.equal(order[1], 'projects')
    assert.equal(order.length, SECTION_IDS.length, 'every known section still appears')
    assert.equal(new Set(order).size, order.length, 'no duplicates')
  })

  test('unknown ids are dropped with a warning', () => {
    const issues = []
    const order = resolveSectionOrder(['projects', 'nope'], [...SECTION_IDS], issues)
    assert.ok(!order.includes('nope'))
    assert.ok(issues.some((i) => i.message.includes('nope')))
  })

  test('duplicates in the requested order are collapsed', () => {
    const order = resolveSectionOrder(['projects', 'projects'], [...SECTION_IDS])
    assert.equal(order.filter((id) => id === 'projects').length, 1)
  })

  test('no order given yields the canonical order', () => {
    assert.deepEqual(resolveSectionOrder(undefined, [...SECTION_IDS]), [...SECTION_IDS])
  })

  test('custom section ids declared in sections are included', () => {
    const { sectionOrder } = resolveConfig({ sections: { volunteering: true } })
    assert.ok(sectionOrder.includes('volunteering'))
  })
})
