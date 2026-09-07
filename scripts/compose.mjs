/**
 * Run the engine and write the built portfolio out as plain JSON.
 *
 * This exists because of where the data is consumed. His `USER` and `SOCIAL` are imported by
 * client components as well as server ones, so anything those modules transitively import ends
 * up in the browser chunk. A loader that reads the filesystem therefore cannot sit behind them:
 * Turbopack refuses to bundle `node:fs` for the browser, and rightly so.
 *
 * So the pipeline runs here, once, at build time, and its output is committed as data. The
 * adapter then imports a JSON file — safe in any bundle, on any runtime — and does nothing but
 * shape-mapping. It also makes the build deterministic: the page renders the profile that was
 * composed, not whatever the filesystem happened to hold when a route was first requested.
 *
 * Run by `predev` and `prebuild`; also runnable directly with `npm run compose`.
 */

import { existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { loadPortfolio, loadInputs } from '../src/core/load.node.js'

const OUT = join(process.cwd(), 'src/data/generated/portfolio.json')
/**
 * The raw layers the pipeline consumed, kept separately for the admin.
 *
 * The admin does not render `portfolio.json`: it re-runs `buildPortfolio` in the browser over
 * these layers plus the unsaved draft, which is what makes its preview the real pipeline rather
 * than an approximation of it. It cannot read them from disk, so they are emitted here.
 */
const INPUTS = join(process.cwd(), 'src/data/generated/inputs.json')

const built = loadPortfolio()

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(
  OUT,
  // Stable key order and a trailing newline: this file is committed, and a diff that reorders
  // keys on every run makes every publish look like a content change.
  // `sections` goes with them: it is the engine's visibility decision, and the page needs it in
  // order to honour `config.sections` at all. Recomputing it in the browser would mean shipping
  // the section rules to every visitor to answer a question already settled here.
  `${JSON.stringify(
    { profile: built.profile, config: built.config, sections: built.sections },
    null,
    2,
  )}\n`,
  'utf8',
)

writeFileSync(INPUTS, `${JSON.stringify(loadInputs(), null, 2)}
`, 'utf8')

/**
 * Guarantee the embedding index exists, even when it is empty.
 *
 * `src/data/generated/` is derived and gitignored, so on a fresh clone this file is absent —
 * and the search hook imports it dynamically, which the bundler resolves at *build* time
 * regardless of whether the branch ever runs. An absent file was therefore a build failure
 * rather than the graceful "no embeddings, lexical search only" the hook is written for.
 *
 * Writing an empty object costs nothing and turns that back into a runtime question. `npm run
 * embed` overwrites it with the real vectors; this only ever creates it when missing, so it
 * cannot clobber them.
 */
const EMBEDDINGS = join(process.cwd(), 'src/data/generated/embeddings.json')
if (!existsSync(EMBEDDINGS)) writeFileSync(EMBEDDINGS, '{}\n', 'utf8')

const { profile } = built
const counts = ['projects', 'experience', 'education', 'skills', 'certifications', 'achievements']
  .map((key) => `${profile[key]?.length ?? 0} ${key}`)
  .join(', ')

console.log(`composed ${profile.identity?.name || '(no name)'} — ${counts}`)

if (built.configIssues?.length) {
  for (const issue of built.configIssues) {
    console.log(`  ${issue.level}: ${issue.path} — ${issue.message}`)
  }
}
