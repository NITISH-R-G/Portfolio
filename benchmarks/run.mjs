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
import { scoreCase, aggregate, GATE, gateFailures } from './score.js'
import { PROVIDERS, providerById, available } from './providers.js'
import { serveFixtures } from './serve.mjs'
import { normalizeSignals } from '../src/core/extraction/normalize.js'
import { extractUrl } from '../src/core/extraction/pipeline.js'
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

  const concurrency = Number(value('concurrency') ?? 4)

  /** @type {Record<string, {summary: any, scores: any[], cost: any, skipped?: string}>} */
  const results = {}

  // Started only if a provider actually needs a URL. The built-in provider is handed the
  // fixture bytes, so a run of it alone touches no socket at all.
  const needsServer = providers.some((p) => p.capabilities.javascript)
  const server = needsServer ? await serveFixtures() : null

  try {
    for (const provider of providers) {
      const { ok: usable, detail } = await available(provider)
      if (!usable) {
        results[provider.id] = { summary: null, scores: [], cost: null, skipped: detail ?? 'unavailable' }
        continue
      }

      const cost = { coldStartMs: 0, concurrency: provider.capabilities.javascript ? concurrency : 1, renderMs: [] }

      if (provider.setup) {
        const started = performance.now()
        await provider.setup()
        cost.coldStartMs = performance.now() - started
      }

      try {
        const wallStarted = performance.now()
        const scores = await mapWithLimit(corpus, cost.concurrency, (testCase) =>
          runCase(provider, testCase, server, cost))
        cost.wallMs = performance.now() - wallStarted
        results[provider.id] = { summary: aggregate(scores), scores, cost }
      } finally {
        if (provider.teardown) await provider.teardown()
      }
    }
  } finally {
    // In a finally so a thrown provider cannot leave a listening socket behind and hang the
    // process on exit.
    await server?.close()
  }

  if (flag('json')) {
    const path = join(process.cwd(), 'benchmarks', 'results', `${stamp()}.json`)
    await mkdir(join(process.cwd(), 'benchmarks', 'results'), { recursive: true })
    await writeFile(path, JSON.stringify({ corpus: corpus.map((c) => c.slug), concurrency, results }, null, 2))
    ok(`Wrote ${path}`)
    return
  }

  report(corpus, providers, results, { concurrency })
}

/**
 * Score one page with one provider.
 *
 * @param {any} provider @param {any} testCase
 * @param {{origin: string}|null} server @param {any} cost
 */
async function runCase(provider, testCase, server, cost) {
  const started = performance.now()
  let extraction = { profile: {}, evidence: {} }
  let failed = false
  let note

  const localUrl = `${server?.origin}/${testCase.platform}/${testCase.slug}.html`

  try {
    if (provider.escalates) {
      // The policy runs the real chain and reports which rung it stopped on, so the cost
      // column reflects what escalation actually spent rather than what it might have.
      const result = await extractUrl(localUrl, {
        providers: provider.chain,
        url: testCase.expected.url,
        waitFor: testCase.expected.waitFor,
      })
      extraction = result
      failed = !hasAnyValue(extraction.profile)
      cost.escalated ??= []
      cost.escalated.push({ slug: testCase.slug, attempts: result.attempts })
      if (result.attempts?.some((a) => a.provider === 'playwright')) cost.rendered = (cost.rendered ?? 0) + 1
      return finish()
    }

    // A rendering provider is given a real URL — the fixture, served locally — because
    // navigation, status codes and script execution are the things being measured. Everyone
    // else is handed the same bytes directly. Both see the identical page.
    const fetched = provider.capabilities.javascript
      ? await provider.fetch(localUrl, { waitFor: testCase.expected.waitFor })
      : { html: testCase.html, url: testCase.expected.url, rendered: false }

    if (fetched.timings?.renderMs !== undefined) cost.renderMs.push(fetched.timings.renderMs)

    if (fetched.failure) {
      failed = true
      note = fetched.failure
    } else {
      const signals = await provider.extract(fetched, { url: testCase.expected.url })
      // Normalized against the fixture's *canonical* URL rather than the localhost address
      // that served it, so relative links resolve to where they really point.
      extraction = normalizeSignals(signals, {
        url: testCase.expected.url,
        sourceId: provider.id,
        provider: provider.id,
        rendered: Boolean(fetched.rendered),
      })
      // Nothing at all is a failure; *little* is not. The corpus deliberately contains a page
      // with almost nothing on it, and an extractor that declines to invent a person there is
      // behaving perfectly — counting that as failed would penalise the restraint the case
      // exists to reward.
      failed = !hasAnyValue(extraction.profile)
    }
  } catch (err) {
    failed = true
    note = err?.message
  }

  return finish()

  function finish() {
    const score = scoreCase(testCase, extraction, { ms: performance.now() - started, failed })
    return note ? { ...score, note } : score
  }
}

/**
 * Run tasks with a bounded number in flight.
 *
 * Bounded rather than `Promise.all`: forty concurrent Chromium contexts is a machine that
 * stops responding, and a latency figure measured under that kind of contention describes the
 * contention rather than the renderer.
 *
 * @template T, R
 * @param {T[]} items @param {number} limit @param {(item: T) => Promise<R>} run
 * @returns {Promise<R[]>}
 */
async function mapWithLimit(items, limit, run) {
  /** @type {R[]} */
  const out = new Array(items.length)
  let next = 0

  const worker = async () => {
    for (;;) {
      const index = next++
      if (index >= items.length) return
      out[index] = await run(items[index])
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
  return out
}

/**
 * @param {any[]} corpus @param {any[]} providers @param {Record<string, any>} results
 */
function report(corpus, providers, results, options = {}) {
  heading('Extraction benchmark')
  say(dim(`  ${corpus.length} case${corpus.length === 1 ? '' : 's'} · ${providers.length} provider${providers.length === 1 ? '' : 's'} · concurrency ${options.concurrency ?? 1} · frozen fixtures, no internet`))

  for (const provider of providers.filter((p) => results[p.id].skipped)) {
    warn(`${provider.name} skipped — ${results[provider.id].skipped}`)
  }

  providers = providers.filter((p) => !results[p.id].skipped)
  if (!providers.length) {
    say('')
    return
  }

  rule('Quality')
  const quality = ['Recall', 'Accuracy', 'Precision', 'Structure', 'Entities', 'Dates']
  say(`  ${'Provider'.padEnd(14)}${quality.map((c) => c.padStart(11)).join('')}`)
  for (const provider of providers) {
    const s = results[provider.id].summary
    const cells = [pct(s.recall), pct(s.accuracy), pct(s.precision), pct(s.structure), pct(s.entities), pct(s.dates)]
    say(`  ${bold(provider.name.padEnd(14))}${cells.map((c) => c.padStart(11)).join('')}`)
  }

  rule('Trust')
  const trust = ['Evidence', 'Validity', 'Traps', 'Invented', 'JS pages', 'Failed', 'Median']
  say(`  ${'Provider'.padEnd(14)}${trust.map((c) => c.padStart(11)).join('')}`)
  for (const provider of providers) {
    const s = results[provider.id].summary
    const cells = [
      pct(s.evidence), pct(s.validity), pct(s.traps.rate), pct(s.inventionRate, true),
      pct(s.jsRecall), pct(s.failureRate, true), `${Math.round(s.medianMs)}ms`,
    ]
    say(`  ${bold(provider.name.padEnd(14))}${cells.map((c) => c.padStart(11)).join('')}`)
  }

  rule('Cost')
  const costs = ['Cold start', 'Median', 'p95', 'Render', 'Wall', 'Threads']
  say(`  ${'Provider'.padEnd(14)}${costs.map((c) => c.padStart(12)).join('')}`)
  for (const provider of providers) {
    const { summary, cost } = results[provider.id]
    // Median and p95 come from the *same* series — per-page total. Taking one from page
    // totals and the other from render-only time produced a p95 below the median, which is
    // the kind of number that quietly discredits a whole table.
    const pages = [...(summary.allMs ?? [])].sort((a, b) => a - b)
    const renders = [...(cost?.renderMs ?? [])].sort((a, b) => a - b)

    say(`  ${bold(provider.name.padEnd(14))}${[
      cost?.coldStartMs ? `${Math.round(cost.coldStartMs)}ms` : '—',
      `${Math.round(percentile(pages, 0.5))}ms`,
      `${Math.round(percentile(pages, 0.95))}ms`,
      renders.length ? `${Math.round(percentile(renders, 0.5))}ms` : '—',
      `${(cost?.wallMs ?? 0) / 1000 >= 0.05 ? `${((cost?.wallMs ?? 0) / 1000).toFixed(1)}s` : '<0.1s'}`,
      String(cost?.concurrency ?? 1),
    ].map((c) => c.padStart(12)).join('')}`)
  }
  say(dim('  Median and p95 are per page, end to end. Render is the readiness wait alone.'))
  say(dim('  Wall is the whole run, so it reflects the concurrency in the last column.'))

  for (const provider of providers.filter((p) => results[p.id].cost?.escalated)) {
    const { cost } = results[provider.id]
    const rendered = cost.rendered ?? 0
    say('')
    say(`  ${bold(provider.name)} rendered ${rendered} of ${cost.escalated.length} pages.`)
    for (const { slug, attempts } of cost.escalated) {
      const escalated = attempts.find((a) => a.provider === 'playwright')
      if (!escalated) continue
      const why = attempts.find((a) => a.provider === 'builtin')?.reasons?.[0]
      say(dim(`    ${slug.padEnd(22)} ${why ?? 'the cheap read fell short'}`))
    }
  }

  say('')
  say(dim('  Recall    — of everything on the page, how much was found'))
  say(dim('  Precision — of what was produced, how much was real (invention is penalised)'))
  say(dim('  Evidence  — correct values that carry a traceable source'))
  say(dim('  Validity  — evidence that actually contains and licenses the value it backs'))
  say(dim('  Traps     — negative cases survived: a footer mention that must not become a job'))

  /* The gate ---------------------------------------------------------------- */

  rule('Gate')
  say(dim('  Inventing someone\'s experience is worse than missing a field, so these come first.'))
  say(dim(`  precision ≥ ${GATE.precision * 100}%  ·  evidence ≥ ${GATE.evidence * 100}%  ·  validity ≥ ${GATE.validity * 100}%  ·  traps = ${GATE.traps * 100}%`))
  say('')

  for (const provider of providers) {
    const failures = gateFailures(results[provider.id].summary)
    if (!failures.length) {
      ok(`${provider.name} — passes. Recall, cost and latency are now worth comparing.`)
      continue
    }
    warn(`${provider.name} — fails ${failures.length === 1 ? 'a gate' : `${failures.length} gates`}:`)
    for (const { metric, required, actual } of failures) {
      say(`      ${metric.padEnd(10)} ${pct(actual)} ${dim(`needs ${Math.round(required * 100)}%`)}`)
    }
  }

  /* Per case ---------------------------------------------------------------- */

  if (flag('detail') || flag('misses')) {
    for (const provider of providers) {
      rule(provider.name)
      for (const score of results[provider.id].scores) {
        const s = aggregate([score])
        const traits = score.traits.length ? dim(` ${score.traits.join(' · ')}`) : ''
        const line = `  ${score.slug.padEnd(22)}${pct(s.recall).padStart(8)} recall ${pct(s.accuracy).padStart(8)} accurate${traits}`
        say(score.failed ? yellow(`${line}  (no output)`) : line)

        for (const trap of score.traps.filter((t) => t.violated)) {
          say(`      ${yellow('TRAP')}     ${trap.path}  concluded ${brief(trap.value)} from a passing mention`)
        }

        if (flag('misses')) {
          for (const field of score.fields) {
            if (field.status === 'correct' && field.evidenced && !field.supported) {
              say(`      ${yellow('unbacked')} ${field.path.replace(/^(identity|socials)\./, '')}  right value, evidence does not show it`)
            }
          }
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
  if (!url || !/^https?:\/\//i.test(url)) {
    warn('Usage: npm run benchmark -- --snapshot <url> [--as <platform>/<slug>] [--render] [--screenshot]')
    say(dim('  The URL is required and explicit. Nothing here runs during `npm test`, and no'))
    say(dim('  benchmark run reaches the internet on its own.'))
    process.exit(1)
  }

  const target = as ?? `misc/${new URL(url).hostname.replace(/^www\./, '').replace(/[^a-z0-9]+/gi, '-')}`
  const [platform, slug] = target.split('/')
  const render = flag('render')

  heading('Snapshot')
  say(dim(`  ${url}`))
  say(dim(`  ${render ? 'Rendered in Chromium' : 'Static fetch'} — the bytes a ${render ? 'browser' : 'crawler'} would see.`))

  const provider = render
    ? (await import('../src/core/extraction/providers/playwright.js')).playwright
    : (await import('../src/core/extraction/providers/builtin.js')).builtin

  await mkdir(join(FIXTURES, platform), { recursive: true })
  const path = join(FIXTURES, platform, `${slug}.html`)

  let fetched
  try {
    fetched = await provider.fetch(url, {
      ...(render && flag('screenshot') ? { screenshotPath: join(FIXTURES, platform, `${slug}.png`) } : {}),
      ...(value('selector') ? { waitFor: { selector: value('selector') } } : {}),
    })
  } finally {
    if (provider.teardown) await provider.teardown()
  }

  if (fetched.failure) {
    warn(fetched.failure)
    process.exit(1)
  }

  await writeFile(path, fetched.html)

  // Everything the page reported about itself at capture time. Without it a fixture is a
  // wall of markup with no record of where it came from, what it answered, or how long it
  // took — and six months later nobody can tell a stale fixture from a broken extractor.
  const signals = await provider.extract(fetched, { url })
  const meta = {
    capturedFrom: url,
    finalUrl: fetched.url,
    status: fetched.status ?? null,
    rendered: Boolean(fetched.rendered),
    redirects: fetched.redirects ?? 0,
    title: signals.title,
    description: signals.meta?.description ?? signals.meta?.['og:description'] ?? null,
    jsonLdBlocks: signals.jsonLd.length,
    bytes: fetched.html.length,
    timings: fetched.timings ?? {},
  }
  await writeFile(join(FIXTURES, platform, `${slug}.capture.json`), `${JSON.stringify(meta, null, 2)}\n`)

  ok(`Wrote ${path} (${(fetched.html.length / 1024).toFixed(1)} kB, ${meta.jsonLdBlocks} JSON-LD block${meta.jsonLdBlocks === 1 ? '' : 's'})`)
  say('')
  say(`  Now write ${bold(`benchmarks/expected/${slug}.json`)} by reading the page as a person would.`)
  say(dim('  Do not generate it from extractor output — that anchors ground truth to current'))
  say(dim('  behaviour and turns the benchmark into a regression test.'))
  say('')
  say(dim('  Captured pages are not committed automatically. A real person\'s profile becoming a'))
  say(dim('  permanent fixture in a public repository is a decision, not a side effect — check'))
  say(dim('  what is in the file, and that you are content for it to live there, before adding it.'))
  say('')
}

/* -------------------------------------------------------------------------- */

/** @param {number[]} sorted @param {number} p */
function percentile(sorted, p) {
  if (!sorted.length) return 0
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]
}

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
