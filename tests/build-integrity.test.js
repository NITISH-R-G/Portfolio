import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Rules about the *shape* of the repository that only a clean checkout would otherwise catch.
 *
 * Everything under `src/data/generated/` is derived output and gitignored, so a fresh clone
 * does not have it. That is intentional — a connector's output is reproducible and does not
 * belong in anyone's git history — but it means source code must treat those files as things
 * that might not exist yet.
 *
 * A bare `import('../data/generated/embeddings.json')` does not. The bundler resolves dynamic
 * imports at build time, so the missing file was not a caught rejection at runtime; it was
 * `[UNRESOLVED_IMPORT]` and a build that produced nothing. The `.catch()` next to it, which
 * documented graceful degradation, could never run. `npm run build` was broken in every fresh
 * clone until `npm run embed` had been run, and in CI a transient CDN failure surfaced as an
 * unresolved-import error that said nothing about embeddings.
 *
 * These are cheap source-text assertions rather than a build harness, because the failure they
 * guard is categorical: either the path goes through a glob or it does not.
 */

const ROOT = join(import.meta.dirname, '..')

/** Every JS/JSX file under src/, which is where the bundler's resolution rules apply. */
function sources(dir = join(ROOT, 'src'), found = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (name === 'generated') continue
      sources(path, found)
    } else if (/\.(js|jsx)$/.test(name)) {
      found.push(path)
    }
  }
  return found
}

describe('generated files are never a hard dependency of the build', () => {
  test('no source file statically or dynamically imports a generated path', () => {
    // `import.meta.glob` is exempt: it yields an empty map when nothing matches, which is the
    // whole point. Anything else naming that directory would be resolved eagerly.
    const offenders = []

    for (const file of sources()) {
      const text = readFileSync(file, 'utf8')
      for (const line of text.split('\n')) {
        if (!/data\/generated\//.test(line)) continue
        if (/import\.meta\.glob/.test(line)) continue
        // Prose, including the comment in useSearch.js that explains why the glob is there.
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue
        // `import(...)` or `from '...'` naming the directory.
        if (/\bimport\s*\(\s*['"][^'"]*data\/generated\//.test(line)
          || /\bfrom\s+['"][^'"]*data\/generated\//.test(line)) {
          offenders.push(`${relative(ROOT, file)}: ${line.trim()}`)
        }
      }
    }

    assert.deepEqual(offenders, [], `use import.meta.glob for generated files:\n${offenders.join('\n')}`)
  })
})

describe('the deployment workflow refuses to ship a degraded site', () => {
  const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'deploy.yml'), 'utf8')

  test('it generates the semantic index before building', () => {
    const embed = workflow.indexOf('npm run embed')
    const build = workflow.indexOf('run: npm run build')
    assert.ok(embed > 0, 'the workflow must generate the embedding index')
    assert.ok(embed < build, 'the index must be generated before the build that reads it')
  })

  test('it fails rather than deploying without the index', () => {
    // The index is not committed, so this assertion is the only thing between a CDN failure
    // and a deployment that silently answers every query lexically.
    assert.match(workflow, /capabilities\.search/)
    assert.match(workflow, /!= "hybrid-semantic"/)
    assert.match(workflow, /::error::Built site reports/)
  })

  test('the order is checkout, install, verify, build, deploy', () => {
    // Asserting presence rather than trusting `indexOf`: a renamed step returns -1, and -1 is
    // less than every real index, so a missing marker would have satisfied the comparisons
    // below and reported a passing ordering test for a workflow that no longer has the step.
    const at = (needle) => {
      const index = workflow.indexOf(needle)
      assert.ok(index >= 0, `the workflow no longer contains ${needle}`)
      return index
    }
    assert.ok(at('actions/checkout') < at('npm ci'))
    assert.ok(at('npm ci') < at('npm test'))
    assert.ok(at('npm test') < at('run: npm run build'))
    assert.ok(at('run: npm run build') < at('upload-pages-artifact'))
    assert.ok(at('upload-pages-artifact') < at('deploy-pages'))
  })
})
