/**
 * The corpus: frozen pages and what should be read out of them.
 *
 * Frozen rather than live, for three reasons that all outrank freshness:
 *
 *   - **Determinism.** A benchmark whose inputs change underneath it cannot attribute a
 *     score change to a code change, which is the only thing a benchmark is for.
 *   - **Offline.** It runs in CI, on a plane, and in `npm test` without a network.
 *   - **Restraint.** Re-fetching real people's profile pages on every run, forever, is not
 *     something to do casually — to the platforms or to the people.
 *
 * The cost is staleness: platforms change their markup, and a fixture captured today will
 * eventually describe a page that no longer exists. That is a maintenance task, not a design
 * flaw, and `npm run benchmark -- --snapshot <url>` is how a fixture gets refreshed.
 *
 * ## Adding a case
 *
 *   1. `benchmarks/fixtures/<platform>/<slug>.html` — the frozen page.
 *   2. `benchmarks/expected/<slug>.json` — what a careful human reads from it.
 *
 * The expected file is ground truth, and writing it is the part that deserves care: it is a
 * statement about what the page *means*, not about what any extractor currently manages. Do
 * not write it by running an extractor and correcting the output — that anchors the truth to
 * today's behaviour and quietly turns the benchmark into a regression test.
 *
 * @module benchmarks/corpus
 */

import { readdir, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURES = join(HERE, 'fixtures')
const EXPECTED = join(HERE, 'expected')

/**
 * @typedef {object} Case
 * @property {string} slug
 * @property {string} platform          Fixture subdirectory — `github`, `personal`, …
 * @property {string} html
 * @property {Expected} expected
 */

/**
 * Ground truth for one page.
 *
 * `url` is the page the fixture was captured from, and is passed to the extractor so that
 * relative links resolve exactly as they would live.
 *
 * @typedef {object} Expected
 * @property {string} url
 * @property {string} [note]            Why this case is in the corpus — what it tests.
 * @property {string[]} [traits]        `javascript`, `no-structured-data`, `org-variants`, …
 * @property {Record<string, any>} profile   The profile a careful human reads from the page.
 */

/**
 * Every case, sorted by slug so reports are stable.
 *
 * @returns {Promise<Case[]>}
 */
export async function loadCorpus() {
  /** @type {Case[]} */
  const cases = []

  for (const platform of await subdirectories(FIXTURES)) {
    for (const file of await readdir(join(FIXTURES, platform))) {
      if (!file.endsWith('.html')) continue
      const slug = file.replace(/\.html$/, '')

      let expected
      try {
        expected = JSON.parse(await readFile(join(EXPECTED, `${slug}.json`), 'utf8'))
      } catch {
        // A fixture with no ground truth cannot be scored. Skipping it silently would let a
        // half-added case look like a passing one, so it is reported instead.
        throw new Error(
          `benchmarks: fixtures/${platform}/${file} has no expected/${slug}.json. `
          + 'Every fixture needs ground truth, or it scores nothing and hides that it did.',
        )
      }

      cases.push({
        slug,
        platform,
        html: await readFile(join(FIXTURES, platform, file), 'utf8'),
        expected,
      })
    }
  }

  return cases.sort((a, b) => a.slug.localeCompare(b.slug))
}

/** @param {string} dir @returns {Promise<string[]>} */
async function subdirectories(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort()
  } catch {
    return []
  }
}

export { FIXTURES, EXPECTED }
