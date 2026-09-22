/**
 * Editing `portfolio.config.js` in place, without rewriting it.
 *
 * ## The problem this solves
 *
 * `writeConfigFile` renders the whole file from a config *object*: `readUserConfig` imports
 * the module, the admin merges a patch into the resulting value, and `renderConfigFile`
 * prints that value through a fixed template. By the time the patch is applied the source
 * text no longer exists — comments, blank lines, key order and the author's own docblocks
 * were discarded at `import`. So connecting one account rewrote the entire file and silently
 * deleted every comment in it. For a file whose whole purpose is to be hand-maintained, that
 * is a data-loss bug wearing a save button.
 *
 * ## The approach
 *
 * Parse the file, find the object literal, and splice *only* the byte ranges that correspond
 * to the values being changed. Everything the patch does not mention — including every
 * comment, every blank line and the order the author chose — is never touched, because it is
 * never re-serialised. Only new values are printed, using the same `js()` renderer the rest
 * of the project uses, so an inserted key looks like a hand-written one.
 *
 * The parser is TypeScript's, which is already a direct dependency and reads plain JavaScript
 * with full node positions. Nothing here evaluates the config: the file is treated as text
 * with a syntax tree over it, never as code to run. That matters because this path is
 * reachable from the admin, and "apply a structured patch" must never become "execute what
 * the browser sent".
 *
 * ## Safety
 *
 * Every edit is verified before it is offered to the caller. The result is re-parsed for
 * syntax errors, and each patched path is read back *statically* — with a literal-only
 * reader, not `eval` — and compared against what was asked for. If any check fails the edit
 * is refused and the caller falls back to the previous whole-file render, which is lossy but
 * correct. A wrong config is far worse than a config that lost its comments.
 *
 * @module scripts/lib/configEdit
 */

import ts from 'typescript'

import { js } from './configFile.mjs'

/** Returned by `readLiteral` for anything that is not a plain literal. */
const NOT_LITERAL = Symbol('not-literal')

/**
 * Apply a patch to config source, preserving everything the patch does not mention.
 *
 * Patch semantics match `deepMerge`, because they have to: the admin sends one shape and both
 * writers must agree on what it means. A plain object descends, `null` removes the key, and
 * anything else replaces the value.
 *
 * @param {string} source              The current file, verbatim.
 * @param {Record<string, unknown>} patch
 * @returns {{ok: true, source: string}|{ok: false, reason: string}}
 */
export function editConfigSource(source, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { ok: false, reason: 'The patch must be an object.' }
  }

  const parsed = parse(source)
  if (!parsed.ok) return parsed

  /** @type {{start: number, end: number, text: string}[]} */
  const edits = []
  const planned = plan(parsed.object, patch, source, edits)
  if (!planned.ok) return planned

  // Applied last-first so that an earlier edit's offsets are still valid when it is reached.
  const sorted = [...edits].sort((a, b) => b.start - a.start)
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].end > sorted[i - 1].start) {
      return { ok: false, reason: 'Overlapping edits — the patch touches nested and parent values at once.' }
    }
  }

  let next = source
  for (const edit of sorted) {
    next = next.slice(0, edit.start) + edit.text + next.slice(edit.end)
  }

  const verified = verify(next, patch)
  if (!verified.ok) return verified

  return { ok: true, source: next }
}

/* -------------------------------------------------------------------------- */

/**
 * Find the object literal the config exports.
 *
 * @param {string} source
 * @returns {{ok: true, object: ts.ObjectLiteralExpression, file: ts.SourceFile}|{ok: false, reason: string}}
 */
function parse(source) {
  const file = ts.createSourceFile('portfolio.config.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)

  // `parseDiagnostics` is internal but is the only way to learn that the text did not parse;
  // `createSourceFile` reports nothing and returns a tree with error nodes in it. Guarded so a
  // future TypeScript that drops it degrades to "cannot verify" rather than throwing.
  const diagnostics = /** @type {any} */ (file).parseDiagnostics
  if (Array.isArray(diagnostics) && diagnostics.length) {
    return { ok: false, reason: 'The config file does not parse.' }
  }

  const exported = file.statements.find(ts.isExportAssignment)
  if (!exported) return { ok: false, reason: 'No default export found.' }

  // Both shapes the project writes: `defineConfig({...})`, and a bare object for anyone who
  // dropped the helper.
  const expression = exported.expression
  if (ts.isObjectLiteralExpression(expression)) return { ok: true, object: expression, file }
  if (ts.isCallExpression(expression) && expression.arguments.length === 1) {
    const [argument] = expression.arguments
    if (ts.isObjectLiteralExpression(argument)) return { ok: true, object: argument, file }
  }

  return { ok: false, reason: 'The default export is not an object literal.' }
}

/**
 * Work out the byte ranges to change.
 *
 * @param {ts.ObjectLiteralExpression} object
 * @param {Record<string, unknown>} patch
 * @param {string} source
 * @param {{start: number, end: number, text: string}[]} edits
 * @returns {{ok: true}|{ok: false, reason: string}}
 */
function plan(object, patch, source, edits) {
  for (const [key, value] of Object.entries(patch)) {
    // Matching `deepMerge`, which skips these rather than walking them.
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue

    if (countProperties(object, key) > 1) {
      return { ok: false, reason: `\`${key}\` appears more than once — editing it would change a shadowed value.` }
    }

    const property = findProperty(object, key)

    if (value === null) {
      // Absent already: nothing to remove, and inserting a `null` would be wrong.
      if (!property) continue
      edits.push(removalOf(property, source))
      continue
    }

    const isPlainObject = value && typeof value === 'object' && !Array.isArray(value)

    if (property && isPlainObject && ts.isObjectLiteralExpression(property.initializer)) {
      // Descend. The parent's own text is left completely alone, which is what keeps a comment
      // sitting above a sibling key intact when a nested value changes.
      const nested = plan(property.initializer, /** @type {Record<string, unknown>} */ (value), source, edits)
      if (!nested.ok) return nested
      continue
    }

    if (property) {
      // Replace the value only. The key, its leading comments and its trailing comma all keep
      // their exact bytes.
      edits.push({
        start: property.initializer.getStart(),
        end: property.initializer.getEnd(),
        text: js(value, depthOf(property.initializer, source)),
      })
      continue
    }

    const insertion = insertionInto(object, key, value, source)
    if (!insertion.ok) return insertion
    edits.push(insertion.edit)
  }

  return { ok: true }
}

/**
 * @param {ts.ObjectLiteralExpression} object
 * @param {string} name
 * @returns {ts.PropertyAssignment|undefined}
 */
function findProperty(object, name) {
  return /** @type {ts.PropertyAssignment|undefined} */ (
    object.properties.find(
      (property) =>
        ts.isPropertyAssignment(property) &&
        (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
        property.name.text === name,
    )
  )
}

/**
 * How many times a key appears in one object literal.
 *
 * A duplicate key is legal JavaScript and the last one wins, so editing the first would leave
 * the file saying one thing and meaning another — and the verifier, which also looks the key
 * up by name, would read back the edited one and agree. Refusing is the only honest answer:
 * the fallback rewrites the file from its evaluated value, where the duplicate has already
 * collapsed to whichever one actually applied.
 *
 * @param {ts.ObjectLiteralExpression} object
 * @param {string} name
 */
function countProperties(object, name) {
  return object.properties.filter(
    (property) =>
      ts.isPropertyAssignment(property) &&
      (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
      property.name.text === name,
  ).length
}

/**
 * The range to cut when a key is removed.
 *
 * Deliberately starts at the property's own line rather than at its full start. A full start
 * includes leading trivia, which is where a comment explaining the key lives — and a comment
 * the author wrote is not the admin's to delete. Disconnecting a source therefore leaves any
 * note above it in place, orphaned. That is the recoverable failure: a stray comment can be
 * deleted by hand, a deleted one cannot be got back.
 *
 * @param {ts.PropertyAssignment} property
 * @param {string} source
 */
function removalOf(property, source) {
  const start = lineStartOf(source, property.getStart())

  let end = property.getEnd()
  // Take the trailing comma with it, then the rest of the line, so no blank gap is left.
  while (end < source.length && source[end] !== ',' && source[end] !== '\n') end += 1
  if (source[end] === ',') end += 1
  while (end < source.length && (source[end] === ' ' || source[end] === '\t')) end += 1
  if (source[end] === '\r') end += 1
  if (source[end] === '\n') end += 1

  return { start, end, text: '' }
}

/**
 * Where to put a key the file does not have yet, and what to write there.
 *
 * @param {ts.ObjectLiteralExpression} object
 * @param {string} key
 * @param {unknown} value
 * @param {string} source
 * @returns {{ok: true, edit: {start: number, end: number, text: string}}|{ok: false, reason: string}}
 */
function insertionInto(object, key, value, source) {
  const name = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : `'${key}'`
  // The new property sits one level in from its object's closing brace, and the value must be
  // rendered at *that* depth — not the object's — or a nested block lands a level short and
  // the file, while still valid, stops looking hand-written.
  const indent = `${indentOf(object, source)}  `
  const rendered = js(value, indent.length / 2)

  const last = object.properties[object.properties.length - 1]

  if (!last) {
    // An empty object: `{}` becomes a block. Its own line indentation is the anchor.
    const open = object.getStart() + 1
    return {
      ok: true,
      edit: { start: open, end: object.getEnd() - 1, text: `\n${indent}${name}: ${rendered},\n${indentOf(object, source)}` },
    }
  }

  // After the last property, which keeps insertion order stable and predictable: a new key
  // lands at the end of its object rather than somewhere the author has to hunt for.
  let at = last.getEnd()
  const hasComma = source[at] === ','
  if (hasComma) at += 1

  return {
    ok: true,
    edit: { start: at, end: at, text: `${hasComma ? '' : ','}\n${indent}${name}: ${rendered},` },
  }
}

/** The indentation of the line an object literal's closing brace sits on. */
function indentOf(object, source) {
  const closeLine = lineStartOf(source, object.getEnd() - 1)
  const match = /^[ \t]*/.exec(source.slice(closeLine))
  return match ? match[0] : ''
}

/** How deep to render a replacement value so its inner lines line up with the file. */
function depthOf(node, source) {
  const lineStart = lineStartOf(source, node.getStart())
  const match = /^[ \t]*/.exec(source.slice(lineStart))
  return match ? Math.floor(match[0].length / 2) : 0
}

/** @param {string} source @param {number} position */
function lineStartOf(source, position) {
  const at = source.lastIndexOf('\n', position - 1)
  return at === -1 ? 0 : at + 1
}

/* -------------------------------------------------------------------------- */
/* Verification                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Confirm the edited source parses, and that every patched path now reads as asked.
 *
 * Read back statically rather than by importing the result. Importing would execute a file
 * that a moment ago was assembled from browser-supplied values, which is the one thing this
 * module exists to avoid — and it would also succeed on a file that had lost unrelated keys.
 *
 * @param {string} source
 * @param {Record<string, unknown>} patch
 * @returns {{ok: true}|{ok: false, reason: string}}
 */
function verify(source, patch) {
  const parsed = parse(source)
  if (!parsed.ok) return { ok: false, reason: `The edit produced invalid source: ${parsed.reason}` }

  /**
   * @param {ts.ObjectLiteralExpression} object
   * @param {Record<string, unknown>} expected
   * @param {string[]} trail
   * @returns {{ok: true}|{ok: false, reason: string}}
   */
  const walk = (object, expected, trail) => {
    for (const [key, value] of Object.entries(expected)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
      const path = [...trail, key].join('.')
      const property = findProperty(object, key)

      if (value === null) {
        if (property) return { ok: false, reason: `\`${path}\` was not removed.` }
        continue
      }

      if (!property) return { ok: false, reason: `\`${path}\` is missing after the edit.` }

      if (value && typeof value === 'object' && !Array.isArray(value) && ts.isObjectLiteralExpression(property.initializer)) {
        const nested = walk(property.initializer, /** @type {Record<string, unknown>} */ (value), [...trail, key])
        if (!nested.ok) return nested
        continue
      }

      const actual = readLiteral(property.initializer)
      if (actual === NOT_LITERAL) {
        return { ok: false, reason: `\`${path}\` did not become a plain value.` }
      }
      if (JSON.stringify(actual) !== JSON.stringify(value)) {
        return { ok: false, reason: `\`${path}\` reads back as ${JSON.stringify(actual)}.` }
      }
    }
    return { ok: true }
  }

  return walk(parsed.object, patch, [])
}

/**
 * Read a literal node as a value, without running anything.
 *
 * Anything that is not a literal — a call, a template string, an identifier — returns the
 * sentinel rather than a guess. This is a verifier: "I could not tell" and "it matched" must
 * never be the same answer.
 *
 * @param {ts.Node} node
 * @returns {unknown}
 */
export function readLiteral(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false
  if (node.kind === ts.SyntaxKind.NullKeyword) return null

  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
    const inner = readLiteral(node.operand)
    return typeof inner === 'number' ? -inner : NOT_LITERAL
  }

  if (ts.isArrayLiteralExpression(node)) {
    const out = []
    for (const element of node.elements) {
      const value = readLiteral(element)
      if (value === NOT_LITERAL) return NOT_LITERAL
      out.push(value)
    }
    return out
  }

  if (ts.isObjectLiteralExpression(node)) {
    /** @type {Record<string, unknown>} */
    const out = {}
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) return NOT_LITERAL
      if (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name)) return NOT_LITERAL
      const value = readLiteral(property.initializer)
      if (value === NOT_LITERAL) return NOT_LITERAL
      out[property.name.text] = value
    }
    return out
  }

  return NOT_LITERAL
}

export { NOT_LITERAL }
