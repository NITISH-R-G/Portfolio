#!/usr/bin/env node
/**
 * What the last refresh actually did.
 *
 * An unattended import writes its results and says nothing anyone will read. When a source
 * quietly starts failing every Monday at six, the only evidence is buried in a workflow log
 * nobody opens — so the portfolio goes stale while every run reports success, because the run
 * *did* succeed: one source failing is not a failed build, by design.
 *
 * This turns the run into something a person sees. In CI it writes a table to the job summary,
 * which GitHub shows on the run page without anyone expanding a log.
 *
 * It computes nothing. Every value comes from `status.json` and `deriveHealth`, so the report
 * and the admin cannot disagree about the same run — and it reads only what the import already
 * wrote, so it can be run at any time to ask "where do things stand?".
 *
 * Usage:
 *   node scripts/refresh-report.mjs            human-readable, to stdout
 *   node scripts/refresh-report.mjs --json     machine-readable
 *   node scripts/refresh-report.mjs --summary  Markdown, appended to $GITHUB_STEP_SUMMARY
 *
 * @module scripts/refresh-report
 */

import { loadResolvedConfig } from './lib/loadConfig.mjs'
import { PATHS, readJson, fs } from './lib/portfolio.mjs'
import { getConnector } from '../src/connectors/index.js'
import { deriveHealth, summarize, describeAge } from '../src/core/sources/health.js'
import { refreshPolicyFor, summarizeRefresh, SCHEDULE } from '../src/core/sources/refresh.js'

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const asSummary = args.includes('--summary')

/** How each health state reads in a one-glance list. */
const MARK = {
  connected: '✓',
  partial: '✓',
  empty: '•',
  manual: '•',
  'link-only': '•',
  stale: '△',
  'rate-limited': '⚠',
  'authentication-required': '⚠',
  unsupported: '•',
  error: '✗',
  skipped: '•',
  'never-run': '△',
}

async function main() {
  const { config } = await loadResolvedConfig()
  const status = readJson(PATHS.status)
  const statuses = status?.connectors ?? {}
  const configured = Object.entries(config.dataSources ?? {})

  const rows = configured.map(([key, cfg]) => {
    const connector = getConnector(key)
    const health = deriveHealth({ key, connector, status: statuses[key], config: cfg })
    const policy = refreshPolicyFor(connector, (name) => process.env[name])
    return { health, policy }
  })

  const health = summarize(rows.map((row) => row.health))
  const refresh = summarizeRefresh(rows.map((row) => row.policy))

  const report = {
    generatedAt: status?.generatedAt ?? null,
    schedule: SCHEDULE,
    health,
    refresh,
    sources: rows.map(({ health: h, policy }) => ({
      key: h.key,
      name: h.name,
      state: h.state,
      // Deliberately not the account handle in the machine-readable form either — it is not a
      // secret, but a report is not the place to widen what gets copied around.
      records: h.recordsImported ?? 0,
      changed: h.recordsChanged ?? null,
      lastSuccessfulAt: h.lastSuccessfulAt ?? null,
      lastAttemptedAt: h.lastAttemptedAt ?? null,
      nextRetryAt: h.nextRetryAt ?? null,
      stale: h.stale,
      actionable: h.actionable,
      refresh: policy.mode,
      message: h.message,
    })),
  }

  if (asJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    return 0
  }

  const lines = []
  lines.push('Portfolio refresh')
  lines.push(`${rows.length} source${rows.length === 1 ? '' : 's'} configured · ${SCHEDULE.description}`)
  lines.push('')

  for (const { health: h, policy } of rows) {
    const mark = MARK[h.state] ?? '•'
    const detail = []
    if (h.recordsImported) detail.push(`${h.recordsImported} records`)
    if (h.recordsChanged) {
      const { added, updated, removed } = h.recordsChanged
      const delta = [added ? `+${added}` : '', updated ? `~${updated}` : '', removed ? `−${removed}` : '']
        .filter(Boolean).join(' ')
      detail.push(delta || 'no changes')
    }
    if (h.state === 'stale') detail.push(`last success ${describeAge(h.ageDays)}`)
    if (h.nextRetryAt) detail.push(`retry after ${h.nextRetryAt.slice(11, 16)} UTC`)
    if (policy.mode === 'manual' || policy.mode === 'unsupported') detail.push(policy.mode)

    lines.push(`${mark} ${h.name}: ${detail.join(', ') || h.message}`)
  }

  lines.push('')
  lines.push(
    `${health.connected} healthy · ${health.attention} needing attention · ` +
    `${refresh.automatic} refresh automatically · ${refresh.manual + refresh.unsupported} never will`,
  )

  const text = lines.join('\n')
  process.stdout.write(`${text}\n`)

  // GitHub renders this on the run page itself, so a failing source is visible without
  // opening a log. Absent locally, where the plain text above is the whole point.
  if (asSummary && process.env.GITHUB_STEP_SUMMARY) {
    const md = [
      '## Portfolio refresh',
      '',
      `${rows.length} sources · ${SCHEDULE.description} · also on every push to main`,
      '',
      '| | Source | State | Records | Changed | Refresh |',
      '| --- | --- | --- | --- | --- | --- |',
      ...rows.map(({ health: h, policy }) => {
        const c = h.recordsChanged
        const delta = c
          ? [c.added ? `+${c.added}` : '', c.updated ? `~${c.updated}` : '', c.removed ? `−${c.removed}` : '']
              .filter(Boolean).join(' ') || 'none'
          : '—'
        return `| ${MARK[h.state] ?? '•'} | ${h.name} | ${h.state} | ${h.recordsImported ?? 0} | ${delta} | ${policy.mode} |`
      }),
      '',
      `**${health.connected} healthy**, ${health.attention} needing attention.`,
    ].join('\n')
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`)
  }

  // Never non-zero. One failing source is normal and must not fail a deploy — that rule is the
  // whole reason this report exists, since a green run is not evidence that nothing is wrong.
  return 0
}

main().then(
  (code) => process.exit(code ?? 0),
  (err) => {
    // A report that cannot be produced must not break the run it is reporting on.
    console.error(`Could not produce the refresh report: ${err.message}`)
    process.exit(0)
  },
)
