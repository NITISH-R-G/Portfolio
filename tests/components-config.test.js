import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { COMPONENT_LIMITS, isPlainJson, resolveConfig } from '../src/core/config/resolve.js'
import { SECTION_IDS } from '../src/core/config/defaults.js'
import { buildPortfolio } from '../src/core/generate/build.js'

/**
 * `components.instances` and `sync.endpoint`, as the engine sees them.
 *
 * The engine's job here is narrow and worth being strict about: it cannot know what any
 * component's props *mean* (the manifests live in the application), so it guarantees what must
 * be true before a manifest is even consulted — every instance has a stable id, names a
 * component, carries a version, and holds **plain JSON of bounded size**. "Plain JSON" is the
 * promise that nothing executable can be smuggled through configuration, so most of what follows
 * tries to smuggle something.
 */

const instance = (over = {}) => ({ id: 'ci_one', component: 'shimmering-text', version: 1, props: { text: 'Hello' }, ...over })
const resolve = (instances) => resolveConfig({ components: { instances } })
const warnings = (r, prefix = 'components') => r.issues.filter((i) => i.path.startsWith(prefix)).map((i) => i.message)

describe('components.instances', () => {
  test('is empty by default, and the section is absent — nothing changes for a site that never uses it', () => {
    const { config } = resolveConfig({})
    assert.deepEqual(config.components, { instances: [] })

    const built = buildPortfolio({ config: { identity: { name: 'Ada', summary: 'Hi.' } } })
    const composed = built.sections.find((s) => s.id === 'composed')
    assert.equal(composed.visible, false)
    assert.equal(composed.count, 0)
  })

  test('the section sits third, directly under the introduction, in the default order', () => {
    assert.deepEqual(SECTION_IDS.slice(0, 3), ['hero', 'about', 'composed'])
  })

  test('a placed component makes the section visible, and counts what is placed', () => {
    const built = buildPortfolio({
      config: {
        identity: { name: 'Ada' },
        components: { instances: [instance({ id: 'a' }), instance({ id: 'b' })] },
      },
    })
    const composed = built.sections.find((s) => s.id === 'composed')
    assert.equal(composed.visible, true)
    assert.equal(composed.count, 2)
    assert.equal(composed.reason, 'auto-shown')
  })

  test('the section can still be forced off, and says that is why', () => {
    const built = buildPortfolio({
      config: { identity: { name: 'Ada' }, sections: { composed: false }, components: { instances: [instance()] } },
    })
    const composed = built.sections.find((s) => s.id === 'composed')
    assert.equal(composed.visible, false)
    assert.equal(composed.reason, 'forced-off')
  })

  test('a valid instance is kept as a detached copy', () => {
    const input = instance({ props: { text: 'Hello', nested: { a: 1 } } })
    const { config } = resolve([input])
    assert.deepEqual(config.components.instances, [input])
    input.props.nested.a = 999
    assert.equal(config.components.instances[0].props.nested.a, 1, 'the resolved config must not alias its input')
  })

  test('props default to an empty object', () => {
    const { config } = resolve([{ id: 'a', component: 'shimmering-text', version: 1 }])
    assert.deepEqual(config.components.instances[0].props, {})
  })

  test('order is preserved', () => {
    const { config } = resolve([instance({ id: 'c' }), instance({ id: 'a' }), instance({ id: 'b' })])
    assert.deepEqual(config.components.instances.map((i) => i.id), ['c', 'a', 'b'])
  })

  test('an instance with an unusable identity is dropped with a reason, never fixed up', () => {
    const bad = [
      instance({ id: undefined }), instance({ id: '' }), instance({ id: '../../etc' }), instance({ id: 'a b' }),
      instance({ id: '-leading' }), instance({ id: 12 }), instance({ id: 'x'.repeat(COMPONENT_LIMITS.idLength + 1) }),
    ]
    const r = resolve(bad)
    assert.deepEqual(r.config.components.instances, [])
    assert.equal(warnings(r).length, bad.length, 'every drop is reported')
    assert.ok(warnings(r).every((m) => /stable id/.test(m)))
  })

  test('a duplicate id keeps the first, because an id is an identity', () => {
    const r = resolve([instance({ id: 'same', props: { text: 'first' } }), instance({ id: 'same', props: { text: 'second' } })])
    assert.equal(r.config.components.instances.length, 1)
    assert.equal(r.config.components.instances[0].props.text, 'first')
    assert.match(warnings(r)[0], /Duplicate id "same"/)
  })

  test('component names and versions are checked', () => {
    for (const component of [undefined, '', 'Shimmering', 'a/b', '../x', 'a b', 5]) {
      assert.equal(resolve([instance({ component })]).config.components.instances.length, 0, String(component))
    }
    for (const version of [undefined, 0, -1, 1.5, '1', null, NaN]) {
      assert.equal(resolve([instance({ version })]).config.components.instances.length, 0, String(version))
    }
    assert.equal(resolve([instance({ version: 7 })]).config.components.instances.length, 1, 'any positive integer is a shape-valid version')
  })

  test('non-objects and a non-array are survived', () => {
    assert.deepEqual(resolve([null, 3, 'x', [], undefined]).config.components.instances, [])
    const r = resolveConfig({ components: { instances: 'nope' } })
    assert.deepEqual(r.config.components.instances, [])
    assert.ok(warnings(r).some((m) => /Expected an array/.test(m)))
    assert.deepEqual(resolveConfig({ components: 7 }).config.components, { instances: [] })
    assert.deepEqual(resolveConfig({ components: null }).config.components, { instances: [] })
  })

  test('at most 100 are kept, and it says so', () => {
    const many = Array.from({ length: COMPONENT_LIMITS.instances + 25 }, (_, i) => instance({ id: `i${i}` }))
    const r = resolve(many)
    assert.equal(r.config.components.instances.length, COMPONENT_LIMITS.instances)
    assert.ok(warnings(r).some((m) => /first 100/.test(m)))
  })
})

describe('props are data, never code', () => {
  const dropped = (props) => resolve([instance({ props })]).config.components.instances.length === 0

  test('functions, class instances, dates and symbols cannot pass', () => {
    assert.ok(dropped({ onClick: () => 'x' }))
    assert.ok(dropped({ run: function evil() {} }))
    assert.ok(dropped({ when: new Date() }))
    assert.ok(dropped({ re: /x/ }))
    assert.ok(dropped({ s: Symbol('x') }))
    assert.ok(dropped({ m: new Map() }))
    assert.ok(dropped({ big: 10n }))
    class Thing { constructor() { this.a = 1 } }
    assert.ok(dropped({ t: new Thing() }))
  })

  test('non-finite numbers and undefined do not pass either', () => {
    assert.ok(dropped({ n: NaN }))
    assert.ok(dropped({ n: Infinity }))
    assert.ok(dropped({ n: undefined }))
  })

  test('a cycle cannot pass (and cannot hang the resolver)', () => {
    const cyclic = { a: {} }
    cyclic.a.back = cyclic
    assert.ok(dropped(cyclic))
  })

  test('props that are not an object are dropped', () => {
    for (const props of [[], 'text', 5, true]) assert.ok(dropped(props), JSON.stringify(props))
  })

  test('nesting deeper than the limit is refused', () => {
    let deep = { v: 1 }
    for (let i = 0; i < COMPONENT_LIMITS.depth + 1; i += 1) deep = { child: deep }
    assert.ok(dropped(deep))
    assert.ok(!dropped({ a: { b: { c: 1 } } }))
  })

  test('oversized props are refused', () => {
    assert.ok(dropped({ text: 'x'.repeat(COMPONENT_LIMITS.propsBytes + 1) }))
    assert.ok(!dropped({ text: 'x'.repeat(2000) }))
  })

  test('prototype pollution keys are refused, and Object.prototype stays clean', () => {
    // `JSON.parse` creates an *own* `__proto__` key, which is how this arrives from config.json.
    const polluted = JSON.parse('{"text":"hi","__proto__":{"isAdmin":true}}')
    assert.ok(dropped(polluted))
    assert.ok(dropped(JSON.parse('{"constructor":{"prototype":{"x":1}}}')))
    assert.equal({}.isAdmin, undefined)
    assert.equal({}.x, undefined)
  })

  test('isPlainJson accepts exactly what JSON.parse can produce', () => {
    const roundTrip = { a: [1, 'two', null, true, { b: 2.5 }], c: 'x' }
    assert.equal(isPlainJson(roundTrip), true)
    assert.equal(isPlainJson(JSON.parse(JSON.stringify(roundTrip))), true)
    assert.equal(isPlainJson(Object.create(null)), true, 'a null-prototype object is plain data')
    assert.equal(isPlainJson(Object.create({ inherited: 1 })), false)
  })
})

describe('sync.endpoint', () => {
  const endpoint = (value) => resolveConfig({ sync: { endpoint: value } })

  test('is empty by default with no warning — having no service is a supported state', () => {
    const r = resolveConfig({})
    assert.deepEqual(r.config.sync, { endpoint: '' })
    assert.deepEqual(warnings(r, 'sync'), [])
    assert.deepEqual(warnings(endpoint(''), 'sync'), [])
  })

  test('accepts an https URL and tidies the trailing slash', () => {
    assert.equal(endpoint('https://portfolio-sync.ada.workers.dev').config.sync.endpoint, 'https://portfolio-sync.ada.workers.dev')
    assert.equal(endpoint('https://portfolio-sync.ada.workers.dev/').config.sync.endpoint, 'https://portfolio-sync.ada.workers.dev')
    assert.equal(endpoint('  https://sync.example/api/  ').config.sync.endpoint, 'https://sync.example/api')
  })

  test('plain http is allowed on loopback only, for local development', () => {
    for (const url of ['http://localhost:8787', 'http://127.0.0.1:8787']) {
      assert.equal(endpoint(url).config.sync.endpoint, url)
    }
    assert.equal(endpoint('http://sync.example').config.sync.endpoint, '')
  })

  test('refuses anything that could point the admin somewhere surprising', () => {
    for (const bad of [
      'http://sync.example', 'ftp://sync.example', 'javascript:alert(1)', 'data:text/html,x',
      'https://user:pass@sync.example', 'https://sync.example/?token=x', 'https://sync.example/#frag',
      'not a url', 42, {}, [], true,
    ]) {
      const r = endpoint(bad)
      assert.equal(r.config.sync.endpoint, '', String(bad))
      assert.ok(warnings(r, 'sync').length === 1, `no warning for ${String(bad)}`)
    }
  })

  test('a non-object sync block is survived', () => {
    assert.deepEqual(resolveConfig({ sync: 'x' }).config.sync, { endpoint: '' })
    assert.deepEqual(resolveConfig({ sync: null }).config.sync, { endpoint: '' })
  })
})
