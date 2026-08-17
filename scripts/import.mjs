#!/usr/bin/env node
/**
 * `npm run import` — fetch every configured source and write the results to disk.
 *
 * The output lands in `src/data/generated/`, which is gitignored by default: the data is
 * reproducible from the config, and committing it would mean every refresh produces a
 * large diff. Pass `--commit` to un-ignore it instead — useful when deploying from a CI
 * job that has no network access to the platforms.
 *
 * Nothing here can fail the build. Every source is independent, and the script exits 0
 * unless *every* configured source failed, which is the only case where continuing to
 * `npm run build` would produce a portfolio that is not what the user asked for.
 *
 * Usage:
 *   npm run import
 *   npm run import -- --only github,leetcode
 *   npm run import -- --dry-run
 *
 * @module scripts/import
 */

import { runConnectors } from '../src/connectors/run.js'
import { loadResolvedConfig } from './lib/loadConfig.mjs'
import { PATHS, writeJson, readJson, readSources, loadEnv, relative, fs, path } from './lib/portfolio.mjs'
import {
  bold, dim, red, say, heading, ok, warn, fail, info,
  rule, stateBadge, wrapText,
} from './lib/ui.mjs'

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const value = (name) => {
  const prefixed = args.find((a) => a.startsWith(`--${name}=`))
  if (prefixed) return prefixed.slice(name.length + 3)
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}

const dryRun = flag('dry-run')
const only = (value('only') ?? '').split(',').map((s) => s.trim()).filter(Boolean)

/** States that mean the source contributed something the portfolio will show. */
const PRODUCTIVE = new Set(['imported', 'partial', 'manual', 'link-only'])

async function main() {
  const loadedEnv = loadEnv()
  const { config } = await loadResolvedConfig()
  const dataSources = config.dataSources ?? {}

  heading('Importing your profiles')

  if (!Object.keys(dataSources).length) {
    warn('No data sources are configured.')
    say(wrapText('Add them under `dataSources` in portfolio.config.js, or run `npm run setup` to be walked through it.'))
    return 0
  }

  if (loadedEnv.length) info(`Loaded ${loadedEnv.length} variable${loadedEnv.length === 1 ? '' : 's'} from .env`)
  if (only.length) info(`Restricted to: ${only.join(', ')}`)
  if (dryRun) info('Dry run — nothing will be written.')
  say()

  const started = Date.now()

  // Read before the run so a source that fails today keeps the memory of when it last
  // worked, and so "what changed" can be computed against what is currently on disk.
  const previousFile = readJson(PATHS.status)
  const previous = previousFile?.connectors ?? {}
  const previousProfiles = Object.fromEntries(
    readSources().map((source) => [source.key, source.profile]),
  )

  const { sources, status, unknown } = await runConnectors({
    dataSources,
    only: only.length ? only : undefined,
    previous,
    previousProfiles,
    log: () => {},
    // Report each source the moment it settles, so a slow one does not make the script
    // look hung — the user sees the fast ones land first.
    onStatus: (entry) => {
      const line = `  ${bold(entry.name.padEnd(16))} ${stateBadge(entry.state).padEnd(22)} ${dim(entry.account ?? '')}`
      say(line)
      if (entry.state === 'error' || entry.state === 'unavailable') {
        say(wrapText(entry.message, 4))
      } else if (entry.state !== 'skipped') {
        say(dim(wrapText(entry.message, 4)))
      }
      for (const warning of entry.warnings ?? []) say(dim(wrapText(`· ${warning}`, 4)))
    },
  })

  for (const key of unknown) {
    say(`  ${bold(key.padEnd(16))} ${red('unknown')}`)
    say(wrapText(`No connector is registered for "${key}". Run \`npm run doctor\` to see the available ids.`, 4))
  }

  say()
  rule('Summary')

  const entries = Object.values(status)
  const productive = entries.filter((s) => PRODUCTIVE.has(s.state))
  const failed = entries.filter((s) => s.state === 'error')
  const configured = entries.filter((s) => s.state !== 'skipped')

  const totals = {}
  for (const entry of productive) {
    for (const [collection, n] of Object.entries(entry.counts ?? {})) {
      totals[collection] = (totals[collection] ?? 0) + n
    }
  }

  if (Object.keys(totals).length) {
    ok(
      Object.entries(totals)
        .sort((a, b) => b[1] - a[1])
        .map(([collection, n]) => `${bold(String(n))} ${collection}`)
        .join(dim(' · ')),
    )
  } else {
    warn('Nothing was imported.')
  }

  if (failed.length) {
    warn(`${failed.length} source${failed.length === 1 ? '' : 's'} failed. The rest of your portfolio is unaffected.`)
  }

  if (dryRun) {
    say(dim(`\nDry run complete in ${seconds(started)}s. No files were written.`))
    return 0
  }

  /* Write ------------------------------------------------------------------- */

  writeSources(sources, only)

  writeJson(PATHS.status, {
    generatedAt: new Date().toISOString(),
    // A restricted run reports only what it touched, so the untouched sources keep the
    // status they already had rather than appearing to have never run.
    connectors: only.length ? { ...previous, ...status } : status,
  })

  say()
  ok(`Wrote ${relative(PATHS.sources)}/ and ${relative(PATHS.status)} in ${seconds(started)}s.`)
  say(dim('Run `npm run dev` to see the result, or `npm run build` to produce the site.'))

  // Exit non-zero only when every configured source failed — that is a broken setup, and a
  // CI job should notice. A single failing platform is normal and must not break a deploy.
  if (configured.length > 0 && productive.length === 0 && failed.length > 0) {
    say()
    fail('Every configured source failed. See the messages above.')
    return 1
  }
  return 0
}

/**
 * One file per source, named after its config key so several instances of a generic
 * connector (`custom`, `customBehance`) do not collide.
 *
 * Files for sources that are no longer configured are removed, so a connector the user
 * deleted from their config stops appearing on the site. A `--only` run leaves other
 * sources alone, since it never asked about them.
 *
 * @param {{key: string, connector: string, profile: object}[]} sources
 * @param {string[]} restrictedTo
 */
function writeSources(sources, restrictedTo) {
  fs.mkdirSync(PATHS.sources, { recursive: true })

  const written = new Set()
  for (const source of sources) {
    const file = path.join(PATHS.sources, `${sanitize(source.key)}.json`)
    writeJson(file, source.profile)
    written.add(path.basename(file))
  }

  if (restrictedTo.length) return

  for (const name of fs.readdirSync(PATHS.sources)) {
    if (!name.endsWith('.json') || written.has(name)) continue
    fs.rmSync(path.join(PATHS.sources, name))
    info(`Removed stale ${relative(path.join(PATHS.sources, name))} (its source is no longer configured or produced nothing).`)
  }
}

/** Config keys become filenames, so they must not be able to escape the directory. */
const sanitize = (key) => key.replace(/[^a-zA-Z0-9_-]/g, '-')

const seconds = (from) => ((Date.now() - from) / 1000).toFixed(1)

main()
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    say()
    fail(`The import could not run: ${err.message}`)
    say(dim(err.stack?.split('\n').slice(1, 4).join('\n') ?? ''))
    process.exit(1)
  })
