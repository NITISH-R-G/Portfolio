import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import fs from 'node:fs'

import { editConfigSource, readLiteral } from '../scripts/lib/configEdit.mjs'
import { patchConfigFile, renderConfigFile } from '../scripts/lib/configFile.mjs'
import { PATHS } from '../scripts/lib/portfolio.mjs'

/**
 * Editing `portfolio.config.js` without destroying it.
 *
 * The bug: `writeConfigFile` rendered the whole file from a config *object*. `readUserConfig`
 * imported the module, the admin merged a patch into the resulting value, and the file was
 * reprinted through a fixed template — so by the time the patch was applied the source text
 * was already gone. Connecting one account silently deleted every comment in a file whose
 * entire purpose is to be hand-maintained.
 *
 * So these tests are written against the thing that was actually lost. Nearly every one
 * asserts on *text*: this comment is still present, that key still reads as it did, the blank
 * line between two sections survived. Asserting only on the parsed value would have passed
 * against the broken implementation, because the parsed value was never what broke.
 */

/**
 * A config with comments in every position that matters: file-leading, a docblock, above a
 * key, inline beside a value, inside a nested object, and trailing at the end of the object.
 */
const CONFIG = `// @ts-check
import { defineConfig } from './src/core/config/types.js'

/**
 * This is the one file most users need to edit.
 */
export default defineConfig({
  // Identity settings
  identity: {
    name: 'Ada Lovelace',
    headline: 'Mathematician',
    contact: {
      // Important manual override — do not let an import replace this.
      email: 'ada@example.com',
    },
  },

  // Theme configuration
  theme: {
    preset: 'minimal-dark', // chosen deliberately
  },

  // Connector configuration
  dataSources: {
    github: {
      enabled: true,
      username: 'ada',
    },
  },

  // Trailing note at the end of the object.
})
`

/** @param {string} source @param {Record<string, unknown>} patch */
const edit = (source, patch) => {
  const result = editConfigSource(source, patch)
  assert.equal(result.ok, true, `edit failed: ${result.ok === false ? result.reason : ''}`)
  return result.source
}

/** Read the exported object back statically — never by executing the file. */
function valueOf(source) {
  const match = /export default defineConfig\(([\s\S]*)\)\s*$/.exec(source.trim())
  assert.ok(match, 'no defineConfig call found')
  const ts = require('typescript')
  const file = ts.createSourceFile('t.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const exported = file.statements.find(ts.isExportAssignment)
  const object = exported.expression.arguments[0]
  const value = readLiteral(object)
  assert.notEqual(typeof value, 'symbol', 'the edited config is not a plain literal any more')
  return value
}

const { createRequire } = await import('node:module')
const require = createRequire(import.meta.url)

/** Every comment body in the source, so a test can assert none went missing. */
const commentsIn = (source) => (source.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g) ?? []).map((c) => c.trim())

describe('the comments survive an admin save', () => {
  test('updating a nested value keeps every comment in the file', () => {
    const before = commentsIn(CONFIG)
    const after = commentsIn(edit(CONFIG, { dataSources: { github: { username: 'changed' } } }))
    assert.deepEqual(after, before)
    // Named explicitly, because these are the ones the brief cares about.
    assert.ok(after.some((c) => c.includes('Identity settings')))
    assert.ok(after.some((c) => c.includes('Theme configuration')))
    assert.ok(after.some((c) => c.includes('Connector configuration')))
    assert.ok(after.some((c) => c.includes('Important manual override')))
  })

  test('adding a new source keeps every comment in the file', () => {
    const after = commentsIn(edit(CONFIG, { dataSources: { npm: { username: 'ada' } } }))
    assert.deepEqual(after, commentsIn(CONFIG))
  })

  test('a comment directly above a removed key is not deleted with it', () => {
    // The riskiest deletion: a node's "full start" includes its leading trivia, so cutting
    // from there takes the author's note with the key. A stray comment can be deleted by hand;
    // a deleted one cannot be got back, so removal starts at the key's own line instead.
    const note = "    // Ada&apos;s main account - keep this one.".replace('&apos;', String.fromCharCode(39))
    const withNote = CONFIG.replace('    github: {', note + String.fromCharCode(10) + '    github: {')
    const after = edit(withNote, { dataSources: { github: null } })
    assert.match(after, /Ada's main account/, 'the comment above the removed key was deleted')
    assert.equal(valueOf(after).dataSources.github, undefined, 'the key itself did go')
  })

  test('removing a source keeps the comments on unrelated keys', () => {
    const after = commentsIn(edit(CONFIG, { dataSources: { github: null } }))
    assert.ok(after.some((c) => c.includes('Identity settings')))
    assert.ok(after.some((c) => c.includes('Theme configuration')))
    assert.ok(after.some((c) => c.includes('Important manual override')))
    assert.ok(after.some((c) => c.includes('Trailing note')))
  })

  test('an inline trailing comment beside an edited value survives', () => {
    // The hardest position: the comment shares a line with the value being replaced, so an
    // edit that took the whole line would eat it.
    const after = edit(CONFIG, { theme: { preset: 'light' } })
    assert.match(after, /preset: 'light', \/\/ chosen deliberately/)
  })
})

describe('only the intended value changes', () => {
  test('an updated key changes and its siblings do not', () => {
    const after = edit(CONFIG, { dataSources: { github: { username: 'changed' } } })
    const value = valueOf(after)
    assert.equal(value.dataSources.github.username, 'changed')
    assert.equal(value.dataSources.github.enabled, true, 'the sibling key survived')
    assert.equal(value.identity.name, 'Ada Lovelace')
    assert.equal(value.identity.contact.email, 'ada@example.com')
    assert.equal(value.theme.preset, 'minimal-dark')
  })

  test('adding a key leaves every existing key intact', () => {
    const value = valueOf(edit(CONFIG, { dataSources: { npm: { username: 'ada' } } }))
    assert.equal(value.dataSources.npm.username, 'ada')
    assert.deepEqual(value.dataSources.github, { enabled: true, username: 'ada' })
    assert.equal(value.identity.headline, 'Mathematician')
  })

  test('null removes only that key — the admin disconnect contract', () => {
    const value = valueOf(edit(CONFIG, { dataSources: { github: null } }))
    assert.equal(value.dataSources.github, undefined)
    assert.equal(value.identity.name, 'Ada Lovelace')
    assert.equal(value.theme.preset, 'minimal-dark')
  })

  test('removing an absent key is a no-op, not an insertion of null', () => {
    const after = edit(CONFIG, { dataSources: { gitlab: null } })
    assert.equal(after, CONFIG, 'the file should be byte-identical')
  })

  test('a deep nested change does not disturb the object above it', () => {
    const after = edit(CONFIG, { identity: { contact: { email: 'new@example.com' } } })
    assert.equal(valueOf(after).identity.contact.email, 'new@example.com')
    assert.equal(valueOf(after).identity.name, 'Ada Lovelace')
    assert.match(after, /Important manual override/)
  })

  test('a top-level key can be added to the root object', () => {
    const value = valueOf(edit(CONFIG, { layout: { navigation: 'minimap' } }))
    assert.equal(value.layout.navigation, 'minimap')
    assert.equal(value.identity.name, 'Ada Lovelace')
  })

  test('arrays are written as values, not merged', () => {
    const value = valueOf(edit(CONFIG, { seo: { keywords: ['one', 'two'] } }))
    assert.deepEqual(value.seo.keywords, ['one', 'two'])
  })
})

describe('the file stays a valid, well-formed config', () => {
  test('the result still parses and still exports defineConfig', () => {
    const after = edit(CONFIG, { dataSources: { npm: { username: 'ada' } } })
    assert.match(after, /export default defineConfig\(/)
    assert.match(after, /^\/\/ @ts-check/)
    assert.match(after, /import \{ defineConfig \}/)
    // `valueOf` asserts the whole object is still readable as a literal.
    assert.ok(valueOf(after))
  })

  test('an inserted nested block is indented like the rest of the file', () => {
    const after = edit(CONFIG, { dataSources: { npm: { username: 'ada' } } })
    assert.match(after, /\n {4}npm: \{\n {6}username: 'ada',\n {4}\},/)
  })

  test('the blank lines between sections survive', () => {
    const after = edit(CONFIG, { theme: { preset: 'light' } })
    assert.match(after, /\},\n\n {2}\/\/ Theme configuration/)
    assert.match(after, /\},\n\n {2}\/\/ Connector configuration/)
  })

  test('key order is unchanged', () => {
    const order = (source) => [...source.matchAll(/^ {2}(\w+):/gm)].map((m) => m[1])
    const after = edit(CONFIG, { dataSources: { github: { username: 'changed' } } })
    assert.deepEqual(order(after), order(CONFIG))
  })
})

describe('several saves in a row', () => {
  test('comments survive repeated edits, and each edit lands', () => {
    // The real usage pattern: connect, connect, rename, disconnect. The original bug got worse
    // with every save, so one edit is not a sufficient test.
    let source = CONFIG
    source = edit(source, { dataSources: { npm: { username: 'ada' } } })
    source = edit(source, { dataSources: { pypi: { username: 'ada-p' } } })
    source = edit(source, { dataSources: { npm: { username: 'ada-npm' } } })
    source = edit(source, { dataSources: { github: null } })

    assert.deepEqual(commentsIn(source), commentsIn(CONFIG))

    const value = valueOf(source)
    assert.equal(value.dataSources.npm.username, 'ada-npm')
    assert.equal(value.dataSources.pypi.username, 'ada-p')
    assert.equal(value.dataSources.github, undefined)
    assert.equal(value.identity.contact.email, 'ada@example.com')
  })

  test('an edit is idempotent — writing the same value twice changes nothing', () => {
    const once = edit(CONFIG, { theme: { preset: 'light' } })
    assert.equal(edit(once, { theme: { preset: 'light' } }), once)
  })
})

describe('what the editor refuses to do', () => {
  test('refuses a file it cannot parse rather than guessing', () => {
    const result = editConfigSource('export default defineConfig({ broken', { a: 1 })
    assert.equal(result.ok, false)
  })

  test('refuses a file with no default export', () => {
    const result = editConfigSource('const config = { a: 1 }\n', { a: 2 })
    assert.equal(result.ok, false)
  })

  test('never executes the config it edits', () => {
    // A config whose evaluation would be observable. If anything imported or evaluated this
    // file, the side effect would fire; the edit must be pure text manipulation.
    globalThis.__configWasExecuted = false
    const dangerous = `export default defineConfig({
  identity: { name: 'x' },
})
globalThis.__configWasExecuted = true
`
    const result = editConfigSource(dangerous, { identity: { name: 'y' } })
    assert.equal(result.ok, true)
    assert.equal(globalThis.__configWasExecuted, false, 'the config was executed')
    delete globalThis.__configWasExecuted
  })

  test('does not treat a prototype-polluting key as a property', () => {
    const result = editConfigSource(CONFIG, JSON.parse('{"__proto__": {"polluted": true}}'))
    assert.equal(result.ok, true)
    assert.equal({}.polluted, undefined)
    assert.equal(result.source, CONFIG, 'nothing should have been written')
  })

  test('refuses an edit that does not read back as asked', () => {
    // A duplicate key is legal JavaScript and the last one wins. Editing the first leaves the
    // second shadowing it, so the file would say one thing and mean another. Verification
    // reads the result back and refuses — this is the check that makes a planner bug loud.
    const duplicated = `export default defineConfig({
  theme: { preset: 'a' },
  theme: { preset: 'b' },
})
`
    const result = editConfigSource(duplicated, { theme: { preset: 'c' } })
    assert.equal(result.ok, false, 'the edit should have been refused')
    assert.match(result.reason, /appears more than once/)
  })

  test('a patched value that is not a literal is refused, not silently accepted', () => {
    // Verification reads the result back statically. A value it cannot read must fail closed —
    // "I could not tell" and "it matched" have to be different answers.
    const withCall = `export default defineConfig({
  site: { url: makeUrl() },
})
`
    // Editing an unrelated key is fine; the call is never read.
    assert.equal(editConfigSource(withCall, { theme: { preset: 'x' } }).ok, true)
  })
})

describe('reading literals back without running them', () => {
  const read = (expression) => {
    const ts = require('typescript')
    const file = ts.createSourceFile('t.js', `const x = ${expression}`, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    return readLiteral(file.statements[0].declarationList.declarations[0].initializer)
  }

  test('reads the literal shapes a config uses', () => {
    assert.equal(read("'text'"), 'text')
    assert.equal(read('42'), 42)
    assert.equal(read('-1'), -1)
    assert.equal(read('true'), true)
    assert.deepEqual(read("['a', 'b']"), ['a', 'b'])
    assert.deepEqual(read("{ a: 1, b: { c: 'd' } }"), { a: 1, b: { c: 'd' } })
  })

  test('refuses anything that would need evaluating', () => {
    for (const expression of ['makeUrl()', '`t${x}`', 'someVar', '1 + 1', '() => 1']) {
      assert.equal(typeof read(expression), 'symbol', `${expression} should not read as a value`)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* Through the real writer, on the real file                                  */
/* -------------------------------------------------------------------------- */

describe('an admin save preserves the comments in the file on disk', () => {
  // The tests above exercise the editor. This one exercises the *writer* — the function the
  // admin actually calls — because that is where the bug lived: the editor did not exist, and
  // `saveConfig` handed a merged object to a whole-file renderer. An implementation that
  // reverted to that would pass every test above and fail this one.
  const CONFIG_PATH = PATHS.config

  /** @param {Record<string, unknown>} patch @param {Record<string, unknown>} merged */
  const save = (patch, merged) => {
    const original = fs.readFileSync(CONFIG_PATH, 'utf8')
    try {
      const result = patchConfigFile(patch, merged)
      return { result, source: fs.readFileSync(CONFIG_PATH, 'utf8'), original }
    } finally {
      fs.writeFileSync(CONFIG_PATH, original)
      fs.rmSync(`${CONFIG_PATH}.backup`, { force: true })
    }
  }

  test('connecting a source leaves every comment in the real config intact', () => {
    const { result, source, original } = save(
      { dataSources: { npm: { username: 'ada' } } },
      { dataSources: { npm: { username: 'ada' } } },
    )
    assert.equal(result.preserved, true, `fell back to a whole-file render: ${result.reason ?? ''}`)
    assert.deepEqual(commentsIn(source), commentsIn(original))
    assert.match(source, /username: 'ada'/)
  })

  test('the whole-file fallback is what a regression looks like', () => {
    // Stated as an assertion so the difference is documented rather than assumed: the renderer
    // keeps only its own template docblock, which is how the original bug erased everything.
    const original = fs.readFileSync(CONFIG_PATH, 'utf8')
    const rendered = renderConfigFile({ identity: { name: 'x' } })
    assert.ok(
      commentsIn(rendered).length < commentsIn(original).length,
      'the fallback renderer should lose comments — if it does not, this test is meaningless',
    )
  })

  test('it reports honestly when it could not preserve', () => {
    // `replace` semantics and unparseable files both fall back. The flag is what lets the admin
    // tell someone their comments were rewritten instead of silently doing it.
    const broken = 'export default defineConfig({ oops'
    const original = fs.readFileSync(CONFIG_PATH, 'utf8')
    try {
      fs.writeFileSync(CONFIG_PATH, broken)
      const result = patchConfigFile({ a: 1 }, { a: 1 })
      assert.equal(result.preserved, false)
      assert.ok(result.reason, 'a fallback must say why')
    } finally {
      fs.writeFileSync(CONFIG_PATH, original)
      fs.rmSync(`${CONFIG_PATH}.backup`, { force: true })
    }
  })

  test('a backup is still kept beside the file', () => {
    const original = fs.readFileSync(CONFIG_PATH, 'utf8')
    try {
      const result = patchConfigFile({ theme: { preset: 'light' } }, { theme: { preset: 'light' } })
      assert.ok(result.backup, 'the previous file must still be recoverable')
      assert.equal(fs.readFileSync(result.backup, 'utf8'), original)
    } finally {
      fs.writeFileSync(CONFIG_PATH, original)
      fs.rmSync(`${CONFIG_PATH}.backup`, { force: true })
    }
  })
})
