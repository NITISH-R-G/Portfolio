/**
 * Run the extraction benchmark.
 *
 *     npm run benchmark                    every provider, summary table
 *     npm run benchmark -- --detail        per-case breakdown
 *     npm run benchmark -- --misses        every field that was missed or wrong
 *     npm run benchmark -- --case <slug>   one case
 *     npm run benchmark -- --json          machine-readable, for tracking over time
 *     npm run benchmark -- --snapshot <url> [--as <platform>/<slug>]
 *
 * Providers are compared on the same frozen corpus, in the same process, with the fetch step
 * replaced by the fixture. What is measured is therefore *extraction*, not network luck —
 * which is the only way a comparison between a local parser and a hosted service says
 * anything about the thing being bought.
 *
 * @module benchmarks/run
 */

import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { loadCorpus, FIXTURES } from './corpus.js'
import { scoreCase, aggregate } from './score.js'
import { PROVIDERS, providerById } from './providers.js'
import { normalizeSignals } from '../src/core/extraction/normalize.js'
import { bold, dim, green, heading, ok, rule, say, warn, yellow } from '../scripts/lib/ui.mjs'

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const value = (name) => {
  const at = argv.indexOf(`--${name}`)
  return at === -1 ? undefined : argv[at + 1]
}

if (flag('snapshot')) {
  await snapshot(value('snapshot'), value('as'))
} else {
  await run()
}

/* -------------------------------------------------------------------------- */

async function run() {
  const only = value('case')
  const corpus = (await loadCorpus()).filter((c) => !only || c.slug === only)

  if (!corpus.length) {
    warn(only ? `No case named "${only}".` : 'The corpus is empty. Add a fixture and its expected file.')
    process.exit(1)
  }

  const requested = value('provider')
  const providers = requested ? [providerById(requested)].filter(Boolean) : PROVIDERS
  if (!providers.length) {
    warn(`No provider named "${requested}". Known: ${PROVIDERS.map((p) => p.id).join(', ')}.`)
    process.exit(1)
  }

  /** @type {Record<string, {summary: any, scores: any[]}>} */
  const results = {}

  for (const provider of providers) {
    /** @type {any[]} */
    const scores = []

    for (const testCase of corpus) {
      const started = performance.now()
      let extraction = { profile: {}, evidence: {} }
      let failed = false

      try {
        // The fixture *is* the fetch. Every provider sees identical bytes, so a difference
        // in score is a difference in extraction and nothing else.
        const signals = await provider.extract(
          { html: testCase.html, url: testCase.expected.url, rendered: provider.capabilities.javascript },
          { url: testCase.expected.url },
        )
        extraction = normalizeSignals(signals, { url: testCase.expected.url, sourceId: provider.id })
        // Nothing at all is a failure; *little* is not. The distinction matters because the
        // corpus deliberately contains a page with almost nothing on it, and an extractor
        // that correctly declines to invent a person there is behaving perfectly — counting
        // that as a failed page would penalise the restraint the case exists to reward.
        failed = !hasAnyValue(extraction.profile)
      } catch (err) {
        failed = true
        if (flag('detail')) warn(`${provider.id} / ${testCase.slug}: ${err.message}`)
      }

      scores.push(scoreCase(testCase, extraction, { ms: performance.now() - started, failed }))
    }

    results[provider.id] = { summary: aggregate(scores), scores }
  }

  if (flag('json')) {
    const path = join(process.cwd(), 'benchmarks', 'results', `${stamp()}.json`)
    await mkdir(join(process.cwd(), 'benchmarks', 'results'), { recursive: true })
    await writeFile(path, JSON.stringify({ corpus: corpus.map((c) => c.slug), results }, null, 2))
    ok(`Wrote ${path}`)
    return
  }

  report(corpus, providers, results)
}

/**
 * @param {any[]} corpus @param {any[]} providers @param {Record<string, any>} results
 */
function report(corpus, providers, results) {
  heading('Extraction benchmark')
  say(dim(`  ${corpus.length} case${corpus.length === 1 ? '' : 's'} · ${providers.length} provider${providers.length === 1 ? '' : 's'} · frozen fixtures, no network`))

  rule('Summary')
  const columns = ['Recall', 'Accuracy', 'Precision', 'Structure', 'Entities', 'Dates', 'Evidence', 'Failed', 'Median']
  say(`  ${'Provider'.padEnd(12)}${columns.map((c) => c.padStart(11)).join('')}`)

  for (const provider of providers) {
    const s = results[provider.id].summary
    const cells = [
      pct(s.recall), pct(s.accuracy), pct(s.precision), pct(s.structure),
      pct(s.entities), pct(s.dates), pct(s.evidence),
      pct(s.failureRate, true), `${Math.round(s.medianMs)}ms`,
    ]
    say(`  ${bold(provider.name.padEnd(12))}${cells.map((c) => c.padStart(11)).join('')}`)
  }

  say('')
  say(dim('  Recall    — of everything on the page, how much was found'))
  say(dim('  Accuracy  — of what was found, how much was right'))
  say(dim('  Precision — of what was produced, how much was real (invention is penalised)'))
  say(dim('  Structure — records that landed in the right collection'))

  /* Per case ---------------------------------------------------------------- */

  if (flag('detail') || flag('misses')) {
    for (const provider of providers) {
      rule(provider.name)
      for (const score of results[provider.id].scores) {
        const s = aggregate([score])
        const traits = score.traits.length ? dim(` ${score.traits.join(' · ')}`) : ''
        const line = `  ${score.slug.padEnd(22)}${pct(s.recall).padStart(8)} recall ${pct(s.accuracy).padStart(8)} accurate${traits}`
        say(score.failed ? yellow(`${line}  (no output)`) : line)

        if (flag('misses')) {
          for (const field of score.fields) {
            if (field.status === 'correct') continue
            const label = field.path.replace(/^(identity|socials)\./, '')
            if (field.status === 'missing') say(dim(`      missing  ${label}  ${brief(field.expected)}`))
            if (field.status === 'wrong') say(`      ${yellow('wrong')}    ${label}  expected ${brief(field.expected)}, got ${brief(field.actual)}`)
            if (field.status === 'extra') say(dim(`      invented ${label}  ${brief(field.actual)}`))
          }
        }
      }
    }
  }

  /* Verdict ----------------------------------------------------------------- */

  rule('What this says')
  for (const provider of providers) {
    const s = results[provider.id].summary
    const structural = results[provider.id].scores.filter((c) => !c.failed)
    const jsFailures = results[provider.id].scores.filter((c) => c.failed && c.traits.includes('javascript'))

    say(`  ${bold(provider.name)}`)
    say(`    Recovered ${green(String(s.fields.correct))} of ${s.fields.expectedTotal} facts across ${structural.length} readable page${structural.length === 1 ? '' : 's'}.`)
    if (s.fields.extra) {
      say(`    Invented ${yellow(String(s.fields.extra))} field${s.fields.extra === 1 ? '' : 's'} that ground truth does not contain.`)
    }
    if (jsFailures.length) {
      say(dim(`    ${jsFailures.length} page${jsFailures.length === 1 ? '' : 's'} returned nothing because the content is client-rendered.`))
    }
  }
  say('')
}

/* -------------------------------------------------------------------------- */

/**
 * Freeze a live page into the corpus.
 *
 * Deliberately a separate, explicit command rather than something a benchmark run does on
 * its own. Capturing someone's profile page is a decision — about them, and about the
 * platform's terms — and it should be made once, by a person, not implicitly on every run.
 *
 * @param {string|undefined} url @param {string|undefined} as
 */
async function snapshot(url, as) {
  if (!url) {
    warn('Usage: npm run benchmark -- --snapshot <url> [--as <platform>/<slug>]')
    process.exit(1)
  }

  const target = as ?? `misc/${new URL(url).hostname.replace(/^www\./, '').replace(/[^a-z0-9]+/gi, '-')}`
  const [platform, slug] = target.split('/')

  heading('Snapshot')
  say(dim(`  ${url}`))

  const { baseline } = await import('../src/core/extraction/providers/baseline.js')
  const fetched = await baseline.fetch(url, {})

  if (fetched.failure) {
    warn(fetched.failure)
    process.exit(1)
  }

  await mkdir(join(FIXTURES, platform), { recursive: true })
  const path = join(FIXTURES, platform, `${slug}.html`)
  await writeFile(path, fetched.html)

  ok(`Wrote ${path} (${(fetched.html.length / 1024).toFixed(1)} kB)`)
  say('')
  say(`  Now write ${bold(`benchmarks/expected/${slug}.json`)} by reading the page as a person would.`)
  say(dim('  Do not generate it from extractor output — that anchors ground truth to current'))
  say(dim('  behaviour and turns the benchmark into a regression test.'))
  say('')
}

/* -------------------------------------------------------------------------- */

/** @param {number|null} n @param {boolean} [invert] */
function pct(n, invert = false) {
  if (n === null) return dim('—')
  const shown = `${Math.round(n * 100)}%`
  const good = invert ? n <= 0.2 : n >= 0.8
  const bad = invert ? n >= 0.5 : n < 0.5
  return good ? green(shown) : bad ? yellow(shown) : shown
}

/** @param {unknown} value */
function brief(value) {
  if (value === undefined) return dim('nothing')
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return dim(text.length > 48 ? `${text.slice(0, 45)}…` : text)
}

/**
 * Did the extractor produce anything a person could use?
 *
 * @param {Record<string, any>} profile
 */
function hasAnyValue(profile) {
  return Object.values(profile).some((value) => {
    if (Array.isArray(value)) return value.length > 0
    if (value && typeof value === 'object') return Object.keys(value).length > 0
    return value !== undefined && value !== null && value !== ''
  })
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}
