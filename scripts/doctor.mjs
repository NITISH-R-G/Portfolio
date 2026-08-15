#!/usr/bin/env node
/**
 * `npm run doctor` — diagnose a portfolio before it is deployed.
 *
 * Answers the question a user actually has, which is never "is my config schema-valid" but
 * "why is my portfolio not showing what I expected". So it reports what will render and
 * what will not, and for anything hidden it says *why* and what to do about it.
 *
 * Exits non-zero only on errors, so it is usable as a deployment gate
 * (`npm run deploy:check`). Warnings never fail it — a portfolio with no Kaggle account is
 * not broken.
 *
 * @module scripts/doctor
 */

import { CONNECTORS, resolveDataSources, checkSource } from '../src/connectors/index.js'
import { getSectionDefinition } from '../src/core/generate/sections.js'
import { listPresetIds } from '../src/core/themes/presets.js'
import { loadBuiltPortfolio, loadEnv, readJson, PATHS, relative, fs } from './lib/portfolio.mjs'
import {
  bold, dim, green, yellow, red, say, ok, warn, fail, info, rule,
  stateBadge, wrapText,
} from './lib/ui.mjs'

/** @type {{level: 'error'|'warning', message: string, hint?: string}[]} */
const findings = []

const problem = (message, hint) => findings.push({ level: 'error', message, hint })
const caution = (message, hint) => findings.push({ level: 'warning', message, hint })

async function main() {
  loadEnv()

  say()
  rule('Portfolio doctor')

  const built = await loadBuiltPortfolio({ onError: (message) => problem(message) })
  const { config, profile, sections, validation, configIssues } = built

  checkConfig(config, configIssues)
  checkIdentity(profile)
  checkSources(config, built)
  reportDocuments(built.documents ?? [])
  checkProvenance(built.identityValidation)
  reportConflicts(built.conflicts)
  reportSections(sections, profile)
  checkTheme(config)
  checkDeployment(config)
  checkData(validation)

  /* Verdict ----------------------------------------------------------------- */

  say()
  rule('Verdict')

  const errors = findings.filter((f) => f.level === 'error')
  const warnings = findings.filter((f) => f.level === 'warning')

  for (const finding of errors) {
    fail(finding.message)
    if (finding.hint) say(dim(wrapText(finding.hint, 4)))
  }
  for (const finding of warnings) {
    warn(finding.message)
    if (finding.hint) say(dim(wrapText(finding.hint, 4)))
  }

  say()
  if (errors.length) {
    fail(`${errors.length} problem${errors.length === 1 ? '' : 's'} to fix before deploying.`)
    return 1
  }
  if (warnings.length) {
    ok(`Ready to deploy, with ${warnings.length} thing${warnings.length === 1 ? '' : 's'} worth a look.`)
    return 0
  }
  ok('Everything checks out.')
  return 0
}

/* -------------------------------------------------------------------------- */

function checkConfig(config, issues) {
  say()
  rule('Configuration')

  if (!fs.existsSync(PATHS.config)) {
    caution(
      `No ${relative(PATHS.config)} — the portfolio is running entirely on defaults.`,
      'Run `npm run setup` to create one.',
    )
    warn('No portfolio.config.js found; using defaults.')
  } else {
    ok(`${relative(PATHS.config)} loaded.`)
  }

  for (const issue of issues) {
    const line = `${issue.path ? `${bold(issue.path)}: ` : ''}${issue.message}`
    if (issue.level === 'error') problem(line, issue.hint)
    else caution(line, issue.hint)
  }
  if (!issues.length) ok('No configuration problems.')
}

function checkIdentity(profile) {
  const { identity } = profile
  if (!identity?.name) {
    problem('No name is set, so the portfolio has nobody\'s name on it.', 'Set `identity.name` in portfolio.config.js.')
    return
  }
  ok(`Identity: ${bold(identity.name)}${identity.headline ? dim(` — ${identity.headline}`) : ''}`)

  if (!identity.headline) {
    caution('No headline.', 'A one-line headline is the first thing a reader sees. Set `identity.headline`.')
  }
  if (!identity.summary) {
    caution(
      'No summary, so the About section will not render.',
      'Set `identity.summary`, or connect GitHub — its bio fills this in automatically.',
    )
  }
}

function checkSources(config, built) {
  say()
  rule('Sources')

  const { sources, unknown } = resolveDataSources(config.dataSources ?? {})

  for (const key of unknown) {
    problem(
      `\`dataSources.${key}\` does not match any connector.`,
      `Known ids: ${CONNECTORS.map((c) => c.id).join(', ')}`,
    )
  }

  if (!sources.length) {
    caution(
      'No data sources are configured, so nothing is imported automatically.',
      'Run `npm run setup`, or add e.g. `github: { username: "you" }` under `dataSources`.',
    )
    warn('No sources configured.')
    return
  }

  const statusFile = readJson(PATHS.status)
  const status = statusFile?.connectors ?? {}
  const generatedAt = statusFile?.generatedAt

  for (const { key, connector, config: cfg } of sources) {
    const check = checkSource(connector, cfg)
    const entry = status[key]

    if (!check.ok) {
      say(`  ${bold(connector.name.padEnd(18))} ${stateBadge('skipped')}`)
      caution(`${connector.name}: ${check.reason}`)
      continue
    }

    if (!entry) {
      say(`  ${bold(connector.name.padEnd(18))} ${yellow('never imported')}`)
      if (typeof connector.fetch === 'function') {
        caution(`${connector.name} is configured but has never been imported.`, 'Run `npm run import`.')
      }
      continue
    }

    say(`  ${bold(connector.name.padEnd(18))} ${stateBadge(entry.state).padEnd(22)}${dim(entry.account ?? '')}`)

    if (entry.state === 'error') {
      caution(`${connector.name}: ${entry.message}`)
    } else if (entry.state === 'unavailable') {
      caution(`${connector.name}: ${entry.message}`, missingCredentialHint(connector))
    } else if (entry.state === 'empty') {
      caution(`${connector.name} returned nothing.`, connector.limits)
    }
  }

  if (generatedAt) {
    const days = Math.floor((Date.now() - Date.parse(generatedAt)) / 86_400_000)
    const when = days <= 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`
    say(dim(`\n  Last imported ${when} (${generatedAt.slice(0, 10)}).`))
    if (days > 30) {
      caution(`Imported data is ${days} days old.`, 'Run `npm run import` to refresh it.')
    }
  } else if (built.hasImports) {
    caution('Source files exist but there is no import status.', 'Run `npm run import` to regenerate both.')
  }
}

/** @param {import('../src/connectors/types.js').Connector} connector */
function missingCredentialHint(connector) {
  if (!connector.authEnv?.length) return undefined
  return `Set ${connector.authEnv.join(' and ')} in .env — see .env.example.`
}

/**
 * Documents are sources too, and are listed as such — a résumé that contributed nothing is
 * exactly as worth knowing about as a connector that returned nothing.
 *
 * @param {import('../src/core/documents/types.js').ImportedDocument[]} documents
 */
function reportDocuments(documents) {
  if (!documents.length) return

  say()
  rule('Documents')

  for (const doc of documents) {
    const counts = Object.entries(doc.profile ?? {})
      .filter(([, value]) => Array.isArray(value) && value.length)
      .map(([collection, value]) => `${value.length} ${collection}`)

    say(`  ${bold((doc.meta.filename ?? doc.meta.id).padEnd(24))} ${dim(doc.meta.extraction ?? '')}`)
    say(dim(`    ${doc.meta.id} · imported ${(doc.meta.importedAt ?? '').slice(0, 10)}`))
    say(`    ${counts.join(' · ') || dim('nothing extracted')}`)

    for (const warning of doc.warnings ?? []) say(dim(wrapText(`· ${warning}`, 4)))

    if (!counts.length) {
      caution(`${doc.meta.filename ?? doc.meta.id} contributed nothing.`,
        'Extraction may have failed. Try exporting the document as .docx or .md, which read far more reliably than PDF.')
    }
  }
}

/**
 * Check that the provenance chain holds up.
 *
 * These failures are invisible without a check: a value that lost its source still renders,
 * and a decision pointing at a deleted source still looks decided.
 *
 * @param {{findings: import('../src/core/identity/validate.js').IdentityFinding[]}} [validation]
 */
function checkProvenance(validation) {
  const findings = validation?.findings ?? []
  if (!findings.length) return

  say()
  rule('Provenance')

  // Grouped by code rather than listed one by one: a résumé with fifty unattributed claims
  // is one problem with one fix, and printing it fifty times buries everything else.
  const byCode = new Map()
  for (const finding of findings) {
    const bucket = byCode.get(finding.code)
    if (bucket) bucket.push(finding)
    else byCode.set(finding.code, [finding])
  }

  for (const [code, group] of byCode) {
    const first = group[0]
    const suffix = group.length > 1 ? dim(` (×${group.length})`) : ''
    say(`  ${first.level === 'error' ? red('✗') : yellow('!')} ${first.message}${suffix}`)
    if (group.length > 1) say(dim(`      first: ${first.path}`))

    const message = group.length > 1
      ? `${first.message} (${group.length} occurrences, e.g. ${first.path})`
      : `${first.path ? `${bold(first.path)}: ` : ''}${first.message}`
    if (first.level === 'error') problem(message, first.hint)
    else caution(message, first.hint)
  }
}

/**
 * Show where sources disagree about the same fact.
 *
 * A warning rather than an error: the portfolio already picked a value and renders fine.
 * But an unreviewed conflict means something on the page may not be what the owner would
 * have chosen, and that is worth knowing before publishing it.
 *
 * @param {import('../src/core/identity/types.js').Conflict[]} conflicts
 */
function reportConflicts(conflicts) {
  if (!conflicts?.length) return

  say()
  rule('Conflicts')

  const unresolved = conflicts.filter((c) => !c.resolved)

  for (const conflict of conflicts.slice(0, 10)) {
    const state = conflict.resolved ? green('decided') : yellow('undecided')
    say(`  ${bold(conflict.label)} ${state}`)
    for (const option of conflict.options) {
      const marker = option.source === conflict.chosen ? green('›') : ' '
      const when = option.observedAt ? dim(` · ${option.observedAt.slice(0, 10)}`) : ''
      say(`    ${marker} ${format(option.value)}`)
      say(dim(`        ${option.sourceLabel}${when}`))
    }
  }
  if (conflicts.length > 10) info(`…and ${conflicts.length - 10} more.`)

  if (unresolved.length) {
    caution(
      `${unresolved.length} unreviewed ${unresolved.length === 1 ? 'conflict' : 'conflicts'} between your sources.`,
      'The most recent value is being used. Decide in the builder (/admin.html → Conflicts), ' +
      'or add a `resolutions` entry to src/data/overrides.json. Your decision survives future imports.',
    )
  }
}

/** @param {unknown} value */
function format(value) {
  if (typeof value === 'string') return value.length > 70 ? `${value.slice(0, 67)}…` : value
  if (Array.isArray(value)) return value.slice(0, 5).join(', ')
  return String(value)
}

function reportSections(sections, profile) {
  say()
  rule('Sections')

  const visible = sections.filter((s) => s.visible)
  const hidden = sections.filter((s) => !s.visible && s.reason !== 'forced-off')

  say(`  ${green('Showing')}  ${visible.map((s) => s.id).join(', ') || dim('nothing')}`)
  if (hidden.length) {
    say(`  ${dim('Hidden')}   ${dim(hidden.map((s) => s.id).join(', '))}`)
    say(dim('\n  Hidden because there is not enough data — this is normal, not a fault:'))
    for (const section of hidden) {
      const definition = getSectionDefinition(section.id)
      const threshold = definition?.threshold ?? 1
      say(dim(`    ${section.id.padEnd(16)} ${section.count} of ${threshold} needed`))
    }
  }

  if (!visible.some((s) => !['hero', 'contact'].includes(s.id))) {
    caution(
      'The portfolio has no content sections, only the intro and contact.',
      'Connect a source and run `npm run import`, or add records to src/data/manual.json.',
    )
  }
  if (!profile.projects?.length && !profile.publications?.length && !profile.experience?.length) {
    caution('No projects, publications or experience.', 'These are what a reader came for.')
  }
}

function checkTheme(config) {
  const presets = listPresetIds()
  if (!presets.includes(config.theme.preset)) {
    problem(
      `Theme preset "${config.theme.preset}" does not exist.`,
      `Available: ${presets.join(', ')}`,
    )
  } else {
    ok(`Theme: ${config.theme.preset} (${config.theme.density})`)
  }
}

function checkDeployment(config) {
  say()
  rule('Deployment')

  const { base, url } = config.site

  say(`  ${dim('Base path')}  ${base}`)
  say(`  ${dim('Site URL')}   ${url || dim('not set')}`)
  say(`  ${dim('Target')}     ${config.deployment.target}`)

  // A wrong base path is the single most common deployment failure: every asset 404s and
  // the page renders blank, with nothing in the console that names the cause.
  if (config.deployment.target === 'github-pages' && base === '/') {
    caution(
      'Deploying to GitHub Pages with `site.base` set to "/".',
      'A project site is served from /<repo-name>/. Unless this is a <user>.github.io repository, ' +
      'set `site.base` to "/<repo-name>/" or every asset will 404 and the page will be blank.',
    )
  }
  if (config.deployment.target !== 'github-pages' && base !== '/') {
    caution(
      `\`site.base\` is "${base}" but you are deploying to ${config.deployment.target}.`,
      'Hosts other than GitHub Pages usually serve from the root; set `site.base` to "/".',
    )
  }
  if (!url) {
    caution(
      'No `site.url`, so canonical links, Open Graph tags and the sitemap are omitted.',
      'Set it to the address the site will be served from.',
    )
  }
}

function checkData(validation) {
  say()
  rule('Data')

  const { score, missing } = validation?.completeness ?? { score: 0, missing: [] }
  const bar = '█'.repeat(Math.round(score / 5)).padEnd(20, '·')
  const colour = score >= 70 ? green : score >= 40 ? yellow : dim
  say(`  Completeness ${colour(bar)} ${bold(`${score}%`)}`)
  if (missing.length) say(dim(`  Missing: ${missing.join(', ')}`))

  const findings = validation?.findings ?? []
  const errors = findings.filter((f) => f.level === 'error')
  const warnings = findings.filter((f) => f.level !== 'error')

  // Capped: a hundred identical "no description" lines teaches the user nothing that the
  // first three did not, and buries the findings that matter.
  for (const finding of errors.slice(0, 10)) problem(`${finding.path}: ${finding.message}`, finding.hint)
  for (const finding of warnings.slice(0, 10)) caution(`${finding.path}: ${finding.message}`, finding.hint)

  const shown = Math.min(errors.length, 10) + Math.min(warnings.length, 10)
  if (findings.length > shown) info(`…and ${findings.length - shown} more data findings.`)
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    say()
    fail(`The doctor could not run: ${err.message}`)
    say(dim(err.stack?.split('\n').slice(1, 4).join('\n') ?? ''))
    process.exit(1)
  })

