/**
 * Retrieval benchmark: does the query layer actually help?
 *
 *     npm run benchmark:search
 *
 * Measures paraphrase recall (does a natural rephrasing reach the same evidence as the exact
 * term?), section accuracy (does a question about education return education?), and — the one
 * that keeps the rest honest — the false-positive rate on questions the portfolio does not
 * support.
 *
 * Runs against the built manifest, so it measures what a visitor actually searches. The
 * fixture-based tests in `packages/agent/test` cover correctness on a portfolio whose contents
 * are fixed; this measures quality on a real one, where the interesting failures live.
 *
 * @module benchmarks/search
 */

import { readFileSync } from 'node:fs'
import { PortfolioAgent } from '../packages/agent/src/index.js'
import { rank } from '../packages/agent/src/search.js'
import { parseQuery } from '../packages/agent/src/query.js'
import { bold, dim, green, heading, rule, say, yellow } from '../scripts/lib/ui.mjs'

/**
 * Paraphrase pairs: an exact term, and a way a person might ask for the same thing without
 * using it. Success is reaching the same records, not identical ordering.
 */
const PARAPHRASES = [
  ['computer vision', 'recognizing things from images'],
  ['accessibility', 'making software easier for people with disabilities'],
  ['backend engineering', 'server-side development'],
  ['AI projects', 'projects involving intelligent models'],
  ['research', 'academic work and publications'],
  ['frontend', 'building user interfaces'],
  ['distributed systems', 'systems involving multiple cooperating services'],
]

/** Questions whose answer is a section of the portfolio. */
const SECTIONS = [
  ['Where did he study?', 'education'],
  ['What companies has he worked with?', 'experience'],
  ['What certifications does he have?', 'certifications'],
  ['What technologies does he use?', 'skills'],
  ['What awards has he won?', 'achievements'],
]

/**
 * Claims the portfolio does not support.
 *
 * Retrieval returning *related* records is fine and expected. What must not happen is a record
 * being returned as though it answered the question — so each case names a record that would
 * be a false positive if it appeared, and why.
 */
const NEGATIVES = [
  { query: 'Did he work at Google?', mustNotLead: /google/i, why: 'Google appears only as an API/platform, never as an employer' },
  { query: 'Did he study at Stanford?', mustNotLead: /stanford/i, why: 'Stanford appears only as a community member’s affiliation' },
  { query: 'How many years of professional experience does he have?', mustNotLead: /^$/, why: 'tenure is not stated anywhere' },
]

const manifest = JSON.parse(readFileSync(new URL('../dist/portfolio.json', import.meta.url), 'utf8'))
const agent = PortfolioAgent.fromManifest(manifest, { strict: false })

/** The previous behaviour: lexical + concept expansion, no semantic tier, no query parsing. */
const before = (query, options = {}) => rank(agent._index, query, options)
/** Current behaviour, through the public API. */
const after = (query, options = {}) => agent.search(query, options)

const titles = (results) => results.map((r) => r.title)

heading('Retrieval benchmark')
say(dim(`  ${agent._index.length} documents · ${manifest.person?.name ?? 'portfolio'} · no network, no model`))

/* Paraphrase recall --------------------------------------------------------- */

rule('Paraphrase recall')
say(dim('  Does a rephrasing reach the same records as the exact term?'))
say('')

let beforeHits = 0
let afterHits = 0

for (const [exact, paraphrase] of PARAPHRASES) {
  const target = titles(after(exact, { limit: 5 }))

  const b = titles(before(paraphrase, { limit: 5 })).filter((t) => target.includes(t)).length
  const a = titles(after(paraphrase, { limit: 5 })).filter((t) => target.includes(t)).length
  beforeHits += b > 0 ? 1 : 0
  afterHits += a > 0 ? 1 : 0

  const mark = a > 0 ? green('  hit ') : yellow(' miss ')
  say(`${mark}${paraphrase}`)
  say(dim(`        before ${b} shared · after ${a} shared${a === 0 ? '  — no overlap' : ''}`))
}

/* Section questions --------------------------------------------------------- */

rule('Section questions')
let sectionOk = 0
for (const [query, expected] of SECTIONS) {
  const top = after(query, { limit: 3 })[0]
  const ok = top?.type === expected
  if (ok) sectionOk += 1
  say(`${ok ? green('  ok  ') : yellow(' bad  ')}${query} ${dim(`→ ${top?.type ?? 'nothing'}`)}`)
}

/* False positives ----------------------------------------------------------- */

rule('Unsupported questions')
say(dim('  Related results are fine. Leading with one that reads as the answer is not.'))
say('')

let falsePositives = 0
for (const { query, mustNotLead, why } of NEGATIVES) {
  const top = after(query, { limit: 1 })[0]
  const bad = top && mustNotLead.source !== '^$' && mustNotLead.test(top.title)
  if (bad) falsePositives += 1
  say(`${bad ? yellow(' FAIL ') : green('  ok  ')}${query}`)
  say(dim(`        ${why}`))
  if (top) say(dim(`        leads with: ${top.title} (${top.type})`))
}

/* Latency ------------------------------------------------------------------- */

rule('Latency')
const sample = ['python', 'Which projects demonstrate computer vision?', 'Where did he study?', 'accessibility work']
const timed = []
for (const query of sample) {
  const start = performance.now()
  for (let i = 0; i < 20; i += 1) after(query, { limit: 24 })
  timed.push({ query, ms: (performance.now() - start) / 20 })
}
for (const { query, ms } of timed) say(`  ${ms.toFixed(2).padStart(6)}ms  ${dim(query)}`)

const indexStart = performance.now()
PortfolioAgent.fromManifest(manifest, { strict: false })
say(`  ${(performance.now() - indexStart).toFixed(1).padStart(6)}ms  ${dim('index build (lexical + semantic)')}`)

/* Summary ------------------------------------------------------------------- */

rule('Summary')
say(`  Paraphrase recall   ${bold(`${afterHits}/${PARAPHRASES.length}`)} ${dim(`(was ${beforeHits}/${PARAPHRASES.length})`)}`)
say(`  Section questions   ${bold(`${sectionOk}/${SECTIONS.length}`)}`)
say(`  False positives     ${bold(String(falsePositives))} ${dim(`of ${NEGATIVES.length}`)}`)
say('')
