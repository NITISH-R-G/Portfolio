/**
 * Does the embedding model actually earn its 23 MB?
 *
 *     npm run benchmark:semantic
 *
 * Runs the same cases through both rankers — lexical/concept/distributional, and the hybrid
 * with embeddings — and reports the difference. The comparison is the point: "semantic search"
 * is only worth claiming if it retrieves things the previous system could not, and the previous
 * system is genuinely good at what it does.
 *
 * The open-vocabulary cases are the real test. Each one is phrased so that its important words
 * do **not** appear anywhere in the portfolio, which is exactly where a corpus-derived method
 * has to fail and a pretrained model does not. None of them were added to the concept
 * vocabulary — that would be measuring a lookup table.
 *
 * @module benchmarks/semantic
 */

import { readFileSync } from 'node:fs'
import { PortfolioAgent } from '../packages/agent/src/index.js'
import { tokenize } from '../packages/agent/src/search.js'
import { DEFAULT_MODEL } from '../packages/agent/src/embedding.js'
import { bold, dim, green, heading, rule, say, yellow } from '../scripts/lib/ui.mjs'

/**
 * Open-vocabulary cases: a question, and a substring the right answer's title contains.
 *
 * Chosen so the question's meaningful words are absent from the corpus. `absent` records which
 * ones, and the benchmark verifies that claim rather than trusting it — a case whose words turn
 * out to be present is not testing what it says it is.
 */
const OPEN_VOCABULARY = [
  { query: 'what did he build for recognizing emotions?', expect: /face emotion/i, absent: ['recognizing'] },
  { query: 'projects that identify things in pictures', expect: /face emotion|cnn/i, absent: ['identify', 'pictures'] },
  { query: 'software that helps people who cannot see well', expect: /screen saathi|accessib/i, absent: ['cannot', 'blind'] },
  { query: 'tools for people who struggle to use phones', expect: /screen saathi/i, absent: ['struggle'] },
  { query: 'work on teaching computers to understand language', expect: /rag|discourse|llm|agent|morph/i, absent: ['teaching'] },
  { query: 'anything about lending or borrowing money', expect: /credit/i, absent: ['lending', 'borrowing', 'money'] },
  { query: 'systems that respond when something goes wrong on the road', expect: /road|sos/i, absent: ['wrong'] },
  { query: 'programs that grade or evaluate other programs', expect: /bench|eval|raven|ambiguity/i, absent: ['grade'] },
  { query: 'building things that talk to each other automatically', expect: /agent|protocol|orchestrate/i, absent: ['talk'] },
  { query: 'experience leading or starting a community', expect: /codestreak/i, absent: ['starting'] },
  { query: 'coursework in data and statistics', expect: /iit|madras|data science/i, absent: ['coursework'] },
  { query: 'proof that he can write efficient algorithms', expect: /leetcode|hackerrank|codeforces|solution/i, absent: ['proof', 'efficient'] },
  // Added to restore the sample size after three of the originals turned out to share words
  // with the corpus. Each targets a record that genuinely exists; the vocabulary check above
  // decides whether they count, and a miss is recorded as a miss.
  { query: 'anything to do with trains or railways', expect: /rail|atc/i, absent: ['trains', 'railways'] },
  { query: 'systems that spot dishonest financial activity', expect: /raven|verification/i, absent: ['dishonest', 'spot'] },
  { query: 'moving an application from one operating system to another', expect: /clicky|windows/i, absent: ['moving', 'operating'] },
  { query: 'anything about electric vehicles or power networks', expect: /ev grid|oracle/i, absent: ['electric', 'vehicles'] },
]

/** Paraphrases carried over from the previous benchmark, so the gate is comparable. */
const PARAPHRASES = [
  { query: 'recognizing things from images', expect: /face emotion|cnn/i },
  { query: 'making software easier for people with disabilities', expect: /screen saathi|encolink|accessib/i },
  { query: 'server-side development', expect: /credit|flask|api|backend/i },
  { query: 'projects involving intelligent models', expect: /ai|agent|llm|morph|raven|bench/i },
  { query: 'academic work and publications', expect: /iit|madras|bench|raven|research/i },
  { query: 'building user interfaces', expect: /encolink|react|clicky|frontend|ui/i },
  { query: 'systems involving multiple cooperating services', expect: /raven|road|agent|protocol/i },
]

/** Must not lead with a record that reads as the answer. */
const NEGATIVES = [
  { query: 'Did he work at Google?', mustNotLead: /^google$/i },
  { query: 'Did he study at Stanford?', mustNotLead: /stanford/i },
  { query: 'Does he have a PhD?', mustNotLead: /phd|doctor/i },
]

const manifest = JSON.parse(readFileSync(new URL('../dist/portfolio.json', import.meta.url), 'utf8'))
let embeddings = null
try {
  embeddings = JSON.parse(readFileSync(new URL('../src/data/generated/embeddings.json', import.meta.url), 'utf8'))
} catch {
  say(yellow('No embedding index. Run `npm run embed` first.'))
  process.exit(1)
}

const agent = PortfolioAgent.fromManifest(manifest, { strict: false }).useEmbeddings(embeddings)

/** Every word in the corpus, to verify the open-vocabulary cases really are out of vocabulary. */
const vocabulary = new Set(
  agent._index.flatMap((d) => tokenize(`${d.title} ${d.subtitle ?? ''} ${d.tags.join(' ')} ${d.text}`)),
)

heading('Semantic benchmark')
say(dim(`  ${agent._index.length} documents · ${DEFAULT_MODEL} · local, no API key`))

/* Verify the premise ---------------------------------------------------------- */

rule('Out-of-vocabulary check')

// Each case is sorted into one of two piles before anything is scored. A case whose "absent"
// words turn out to be in the corpus is not measuring open-vocabulary retrieval — a lexical
// index could answer it — so counting it towards the open-vocabulary score would inflate that
// score with cases it was never entitled to. It is still run and still reported, just under a
// name that says what it is.
const genuine = []
const overlapping = []

for (const testCase of OPEN_VOCABULARY) {
  const present = testCase.absent.filter((word) => vocabulary.has(word))
  if (present.length) {
    overlapping.push({ ...testCase, present })
    say(yellow(`  "${present.join(', ')}" IS in the corpus — ${testCase.query.slice(0, 44)}`))
  } else {
    genuine.push(testCase)
  }
}

say(overlapping.length
  ? yellow(`  ${genuine.length} of ${OPEN_VOCABULARY.length} cases are genuinely open-vocabulary; `
    + `${overlapping.length} scored separately`)
  : green(`  all ${OPEN_VOCABULARY.length} cases use words absent from the corpus`))

/* The comparison -------------------------------------------------------------- */

const run = async (cases, label) => {
  rule(label)
  let lexical = 0
  let hybrid = 0

  for (const { query, expect } of cases) {
    const before = agent.search(query, { limit: 5 })
    const after = await agent.semanticSearch(query, { limit: 5 })

    const beforeHit = before.some((r) => expect.test(r.title))
    const afterHit = after.some((r) => expect.test(r.title))
    if (beforeHit) lexical += 1
    if (afterHit) hybrid += 1

    const mark = afterHit ? (beforeHit ? green('  both') : green('   NEW')) : yellow('  miss')
    say(`${mark}  ${query.slice(0, 56)}`)
    if (!afterHit || !beforeHit) {
      say(dim(`         → ${after.slice(0, 2).map((r) => r.title.slice(0, 30)).join(' | ') || 'nothing'}`))
    }
  }
  return { lexical, hybrid, total: cases.length }
}

const open = await run(genuine, 'Open-vocabulary queries (no corpus overlap)')
const overlap = overlapping.length
  ? await run(overlapping, 'Cases whose words are in the corpus after all')
  : { lexical: 0, hybrid: 0, total: 0 }
const para = await run(PARAPHRASES, 'Paraphrases')

/* Precision ------------------------------------------------------------------- */

rule('Negative queries')
let falsePositives = 0
for (const { query, mustNotLead } of NEGATIVES) {
  const top = (await agent.semanticSearch(query, { limit: 1 }))[0]
  const bad = top && mustNotLead.test(top.title)
  if (bad) falsePositives += 1
  say(`${bad ? yellow('  FAIL') : green('    ok')}  ${query} ${dim(`→ ${top?.title?.slice(0, 30) ?? 'nothing'}`)}`)
}

/* Latency --------------------------------------------------------------------- */

rule('Latency')
const sample = OPEN_VOCABULARY.slice(0, 8).map((c) => c.query)
const timings = []
for (const query of sample) {
  const start = performance.now()
  await agent.semanticSearch(query, { limit: 24 })
  timings.push(performance.now() - start)
}
timings.sort((a, b) => a - b)
const median = timings[Math.floor(timings.length / 2)]
const p95 = timings[Math.min(timings.length - 1, Math.ceil(0.95 * timings.length) - 1)]

const lexTimings = sample.map((q) => { const s = performance.now(); agent.search(q, { limit: 24 }); return performance.now() - s })
lexTimings.sort((a, b) => a - b)

say(`  hybrid   median ${median.toFixed(1).padStart(6)}ms   p95 ${p95.toFixed(1).padStart(6)}ms  ${dim('(model already warm)')}`)
say(`  lexical  median ${lexTimings[Math.floor(lexTimings.length / 2)].toFixed(1).padStart(6)}ms`)
say(`  index    ${(JSON.stringify(embeddings).length / 1024).toFixed(1)} kB shipped · model ~23 MB fetched once, browser-cached`)

/* Gate ------------------------------------------------------------------------ */

rule('Gate')
const checks = [
  ['paraphrases ≥ 6/7', para.hybrid >= 6, `${para.hybrid}/${para.total}`],
  ['false positives ≤ 0', falsePositives === 0, String(falsePositives)],
  // Counts only the cases that survived the vocabulary check. The gate has always been about
  // having enough genuine cases to measure; scoring the leaked ones towards it would have made
  // the number easier to hit by writing worse cases.
  ['genuinely open-vocabulary ≥ 10 cases', genuine.length >= 10, `${genuine.length} of ${OPEN_VOCABULARY.length}`],
  ['open-vocabulary majority retrieved', open.total > 0 && open.hybrid > open.total / 2, `${open.hybrid}/${open.total}`],
  // The baseline comparison spans every case, leaked ones included: it asks whether hybrid
  // retrieval beats lexical retrieval overall, which is a fair question about all of them.
  ['beats the lexical baseline',
    open.hybrid + overlap.hybrid + para.hybrid > open.lexical + overlap.lexical + para.lexical,
    `${open.hybrid + overlap.hybrid + para.hybrid} vs ${open.lexical + overlap.lexical + para.lexical}`],
]
for (const [name, passed, value] of checks) {
  say(`${passed ? green('  PASS') : yellow('  FAIL')}  ${name.padEnd(36)} ${bold(value)}`)
}

rule('Summary')
say(`  Open-vocabulary   lexical ${open.lexical}/${open.total}  →  hybrid ${bold(`${open.hybrid}/${open.total}`)}`
  + dim(`   (genuine cases only, of ${OPEN_VOCABULARY.length} written)`))
if (overlap.total) {
  say(`  Corpus overlap    lexical ${overlap.lexical}/${overlap.total}  →  hybrid ${overlap.hybrid}/${overlap.total}`
    + dim('   (not counted as open-vocabulary)'))
}
say(`  Paraphrases       lexical ${para.lexical}/${para.total}  →  hybrid ${bold(`${para.hybrid}/${para.total}`)}`)
say(`  False positives   ${bold(String(falsePositives))} of ${NEGATIVES.length}`)
say('')

process.exit(checks.every(([, passed]) => passed) ? 0 : 1)
