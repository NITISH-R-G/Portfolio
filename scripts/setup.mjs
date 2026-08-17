#!/usr/bin/env node
/**
 * `npm run setup` — the guided path from a fresh clone to a working portfolio.
 *
 * The six steps of the product: who you are, connect your profiles, import, review, style,
 * deploy. This script covers one through five and hands off to `docs/deployment.md` for
 * six. It writes exactly one file — `portfolio.config.js` — and then offers to run the
 * import for you.
 *
 * The connector list, their fields and their limits all come from the registry, so this
 * script never needs editing when a platform is added.
 *
 * @module scripts/setup
 */

import { connectorGroups, getConnector } from '../src/connectors/index.js'
import { THEME_PRESETS } from '../src/core/themes/presets.js'
import { normalizeBase } from '../src/core/config/resolve.js'
import { PATHS, relative, fs, path } from './lib/portfolio.mjs'
import {
  bold, dim, green, say, heading, ok, warn, info, rule, wrapText,
  ask, confirm, select, multiSelect, closePrompt, interactive,
} from './lib/ui.mjs'

async function main() {
  say()
  rule('Portfolio setup')
  say(wrapText(
    'This writes portfolio.config.js. Every answer is optional and everything can be ' +
    'changed later, either by editing that one file or through the builder at /admin.',
    0,
  ))

  if (!interactive) {
    warn('This terminal is not interactive, so setup cannot ask you anything.')
    say(wrapText('Copy portfolio.config.example.js to portfolio.config.js and edit it instead.'))
    return 1
  }

  if (fs.existsSync(PATHS.config)) {
    warn(`${relative(PATHS.config)} already exists.`)
    if (!await confirm('Overwrite it?', false)) {
      say(dim('Nothing was changed.'))
      return 0
    }
    // The existing config may be the only copy of hand-tuned settings, so it is kept
    // rather than replaced outright.
    const backup = `${PATHS.config}.backup`
    fs.copyFileSync(PATHS.config, backup)
    info(`Saved your current config to ${relative(backup)}.`)
  }

  const identity = await askIdentity()
  const dataSources = await askSources()
  const theme = await askStyle()
  const site = await askDeployment()

  const config = { identity, site, ...theme, dataSources }

  /* Review ------------------------------------------------------------------ */

  say()
  rule('Review')
  say(renderConfig(config))

  if (!await confirm(`\nWrite this to ${relative(PATHS.config)}?`)) {
    say(dim('Nothing was written.'))
    return 0
  }

  fs.writeFileSync(PATHS.config, renderConfigFile(config), 'utf8')
  ok(`Wrote ${relative(PATHS.config)}`)

  await offerEnvFile(dataSources)

  /* Next steps -------------------------------------------------------------- */

  say()
  rule('Next')

  const fetchable = Object.keys(dataSources).filter((key) => {
    const connector = getConnector(key)
    return connector && typeof connector.fetch === 'function'
  })

  if (fetchable.length && await confirm('Import your data now?')) {
    say()
    const { spawnSync } = await import('node:child_process')
    // Spawned rather than imported so the import script owns its own exit code and output
    // formatting, exactly as it would when run directly.
    spawnSync(process.execPath, [path.join(PATHS.root, 'scripts', 'import.mjs')], { stdio: 'inherit' })
  } else if (fetchable.length) {
    say(`  ${green('1.')} ${bold('npm run import')}  ${dim('fetch your profiles')}`)
  }

  say(`  ${green(fetchable.length ? '2.' : '1.')} ${bold('npm run dev')}     ${dim('see it at http://localhost:5173')}`)
  say(`  ${green(fetchable.length ? '3.' : '2.')} ${bold('npm run deploy:check')} ${dim('confirm it is ready to publish')}`)
  say()
  say(dim('Fine-tuning: open http://localhost:5173/admin.html, or read docs/configuration.md.'))
  return 0
}

/* -------------------------------------------------------------------------- */
/* Step 1 — Who are you                                                        */
/* -------------------------------------------------------------------------- */

async function askIdentity() {
  say()
  rule('1. Who are you')

  const name = await ask('Your name', { required: true })
  const headline = await ask('One-line headline', { default: '' })
  const location = await ask('Location', { default: '' })
  const email = await ask('Contact email', {
    default: '',
    validate: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? undefined : 'That does not look like an email address.'),
  })

  const identity = { name }
  if (headline) identity.headline = headline
  if (location) identity.location = location
  if (email) identity.contact = { email }

  say(dim('  Your avatar and summary can come from GitHub — no need to type them.'))
  return identity
}

/* -------------------------------------------------------------------------- */
/* Step 2 — Connect your profiles                                              */
/* -------------------------------------------------------------------------- */

async function askSources() {
  say()
  rule('2. Connect your profiles')
  say(wrapText(
    'Pick the platforms you are on. Sources marked "manual" or "link only" have no public ' +
    'API — this project will not pretend otherwise, so those contribute a verified link and ' +
    'anything you choose to type.',
    0,
  ))

  /** @type {{label: string, value: string, hint: string}[]} */
  const choices = []
  for (const group of connectorGroups()) {
    for (const connector of group.connectors) {
      choices.push({
        label: `${connector.name.padEnd(18)} ${dim(group.label)}`,
        value: connector.id,
        hint: availabilityHint(connector),
      })
    }
  }

  const chosen = await multiSelect('Which platforms are you on?', choices)
  if (!chosen.length) {
    say(dim('  No sources selected. You can add them later under `dataSources`.'))
    return {}
  }

  /** @type {Record<string, Record<string, unknown>>} */
  const dataSources = {}

  for (const id of chosen) {
    const connector = /** @type {import('../src/connectors/types.js').Connector} */ (getConnector(id))
    say()
    say(`${bold(connector.name)} ${dim(availabilityHint(connector))}`)
    if (connector.limits) say(dim(wrapText(connector.limits, 2)))

    /** @type {Record<string, unknown>} */
    const cfg = {}
    // Only required fields are asked for. Everything else has a working default, and a
    // wizard that asks fifteen questions per platform is a wizard nobody finishes.
    for (const field of connector.fields.filter((f) => f.required)) {
      const answer = await ask(`  ${field.label}`, {
        required: true,
        default: '',
        validate: field.type === 'url'
          ? (v) => (/^https?:\/\//i.test(v) || v.includes('.') ? undefined : 'Enter a full URL.')
          : undefined,
      })
      cfg[field.key] = field.type === 'list'
        ? answer.split(',').map((s) => s.trim()).filter(Boolean)
        : field.type === 'number' ? Number(answer) : answer
    }

    if (!connector.fields.some((f) => f.required)) {
      const url = await ask('  Profile URL', { default: '' })
      if (url) cfg.profileUrl = url
    }

    if (connector.identify?.(cfg)) {
      dataSources[id] = cfg
      ok(`  ${connector.name} configured.`)
    } else {
      warn(`  Skipping ${connector.name} — not enough information to identify the account.`)
    }
  }

  return dataSources
}

/** @param {import('../src/connectors/types.js').Connector} connector */
function availabilityHint(connector) {
  switch (connector.availability) {
    case 'api': return 'imports automatically'
    case 'feed': return 'imports from your public feed'
    case 'token': return 'needs your own API credential'
    case 'manual': return 'manual — no public API'
    case 'url-only': return 'link only — no public API'
    default: return ''
  }
}

/* -------------------------------------------------------------------------- */
/* Step 3 — Style                                                              */
/* -------------------------------------------------------------------------- */

async function askStyle() {
  say()
  rule('3. Choose your style')

  const preset = await select(
    'Theme',
    THEME_PRESETS.map((t) => ({ label: t.name ?? t.id, value: t.id, hint: t.description })),
    Math.max(0, THEME_PRESETS.findIndex((t) => t.id === 'minimal-dark')),
  )

  const shell = await select('Layout', [
    { label: 'Sidebar', value: 'sidebar', hint: 'identity rail beside a scrolling column' },
    { label: 'Stacked', value: 'stacked', hint: 'one column, top to bottom' },
  ])

  const density = await select('Density', [
    { label: 'Comfortable', value: 'comfortable' },
    { label: 'Compact', value: 'compact', hint: 'more on screen at once' },
    { label: 'Spacious', value: 'spacious', hint: 'more breathing room' },
  ])

  const intensity = await select('Animation', [
    { label: 'Standard', value: 'standard' },
    { label: 'Subtle', value: 'subtle' },
    { label: 'Expressive', value: 'expressive' },
    { label: 'None', value: 'none', hint: 'no motion at all' },
  ])

  const accent = await ask('Accent colour', { default: '', validate: validateColor })

  return {
    theme: { preset, density, ...(accent ? { accent } : {}) },
    layout: { shell, navigation: shell === 'sidebar' ? 'dock' : 'top' },
    animations: { intensity, smoothScroll: intensity !== 'none' },
  }
}

/** @param {string} value */
function validateColor(value) {
  const v = value.trim()
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) return undefined
  if (/^(rgb|hsl|oklch|lab|color)a?\(/i.test(v)) return undefined
  // Named CSS colours are valid too; only obvious nonsense is rejected.
  if (/^[a-z]+$/i.test(v)) return undefined
  return 'Use a hex colour like #6366f1, a CSS colour function, or a colour name.'
}

/* -------------------------------------------------------------------------- */
/* Step 4 — Deployment                                                         */
/* -------------------------------------------------------------------------- */

async function askDeployment() {
  say()
  rule('4. Where will it live')

  const target = await select('Hosting', [
    { label: 'GitHub Pages', value: 'github-pages', hint: 'free, from this repository' },
    { label: 'Vercel', value: 'vercel' },
    { label: 'Netlify', value: 'netlify' },
    { label: 'Cloudflare Pages', value: 'cloudflare' },
    { label: 'Somewhere else / not sure yet', value: 'static' },
  ])

  const site = { language: 'en' }

  if (target === 'github-pages') {
    say(dim(wrapText(
      'A GitHub Pages project site is served from /<repo-name>/, and getting that path wrong ' +
      'is the single most common cause of a blank deployed page. Setup asks for it so it is ' +
      'right the first time.',
      2,
    )))
    const repo = await ask('  Repository name', { default: path.basename(PATHS.root) })
    const user = await ask('  GitHub username', { default: '' })
    site.base = normalizeBase(repo)
    if (user) site.url = `https://${user.toLowerCase()}.github.io/${repo}`
  } else {
    const url = await ask('Site URL (leave blank to decide later)', { default: '' })
    if (url) site.url = url
    site.base = '/'
  }

  return { site, deployment: { target } }
}

/* -------------------------------------------------------------------------- */
/* .env                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Offer to create `.env` when a chosen connector reads credentials.
 *
 * The file is never populated with a value — this only writes the empty keys and their
 * explanations, so that no secret ever passes through this script's prompts or its
 * scrollback.
 *
 * @param {Record<string, Record<string, unknown>>} dataSources
 */
async function offerEnvFile(dataSources) {
  const needed = new Map()
  for (const key of Object.keys(dataSources)) {
    const connector = getConnector(key)
    for (const name of connector?.authEnv ?? []) {
      needed.set(name, connector)
    }
  }
  if (!needed.size) return

  say()
  rule('Credentials')
  say(wrapText(
    'Some of your sources can use a token. None of them require one to work — a token only ' +
    'raises rate limits or unlocks extras, and the limits are described in docs/connectors.md.',
    0,
  ))
  for (const [name, connector] of needed) {
    say(`  ${bold(name)} ${dim(`— ${connector.name}`)}`)
  }

  if (fs.existsSync(PATHS.env)) {
    info(`${relative(PATHS.env)} already exists; leaving it alone.`)
    return
  }
  if (!await confirm(`Create ${relative(PATHS.env)} with these keys left blank?`)) return

  const lines = [
    '# Secrets for `npm run import`. Never committed — .env is gitignored.',
    '# Every key here is optional; leaving one blank simply means that connector runs',
    '# with its public rate limit. See docs/connectors.md for what each one unlocks.',
    '',
  ]
  for (const [name, connector] of needed) {
    lines.push(`# ${connector.name}: ${connector.limits ?? ''}`.trim())
    lines.push(`${name}=`)
    lines.push('')
  }
  fs.writeFileSync(PATHS.env, `${lines.join('\n').trimEnd()}\n`, 'utf8')
  ok(`Wrote ${relative(PATHS.env)} — fill in whichever you want and re-run \`npm run import\`.`)
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                   */
/* -------------------------------------------------------------------------- */

/** A short human summary for the review step. */
function renderConfig(config) {
  const lines = [
    `  ${dim('Name')}      ${config.identity.name}`,
    config.identity.headline ? `  ${dim('Headline')}  ${config.identity.headline}` : '',
    `  ${dim('Theme')}     ${config.theme.preset}, ${config.theme.density}`,
    `  ${dim('Layout')}    ${config.layout.shell}`,
    `  ${dim('Base path')} ${config.site.base ?? '/'}`,
    config.site.url ? `  ${dim('URL')}       ${config.site.url}` : '',
    `  ${dim('Sources')}   ${Object.keys(config.dataSources).join(', ') || 'none'}`,
  ]
  return lines.filter(Boolean).join('\n')
}

/**
 * Emit the config as readable JavaScript rather than JSON.
 *
 * The file is meant to be edited by hand afterwards, so it gets the same comments and
 * shape as the example config. Generated output that a user cannot comfortably edit
 * defeats the purpose of having one config file.
 */
function renderConfigFile(config) {
  return `// @ts-check
import { defineConfig } from './src/core/config/types.js'

/**
 * Generated by \`npm run setup\`. This is the only file you need to edit.
 *
 * Everything not set here falls back to a working default — see docs/configuration.md for
 * the full reference. Sections you have no data for hide themselves automatically, so
 * there is no list of sections to maintain.
 */
export default defineConfig(${js(config, 0)})
`
}

/**
 * Serialize to JavaScript object literal syntax: unquoted keys where valid, single quotes,
 * trailing commas. Written here rather than using JSON.stringify because the output is
 * source code a person will read and edit.
 *
 * @param {unknown} value
 * @param {number} depth
 * @returns {string}
 */
function js(value, depth) {
  const pad = '  '.repeat(depth + 1)
  const closePad = '  '.repeat(depth)

  if (value === null || value === undefined) return 'undefined'
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    const inline = value.every((v) => typeof v === 'string' || typeof v === 'number')
    if (inline) return `[${value.map((v) => js(v, depth)).join(', ')}]`
    return `[\n${value.map((v) => `${pad}${js(v, depth + 1)},`).join('\n')}\n${closePad}]`
  }

  const entries = Object.entries(/** @type {Record<string, unknown>} */ (value))
    .filter(([, v]) => v !== undefined && v !== '')
  if (!entries.length) return '{}'

  return `{\n${entries
    .map(([key, v]) => `${pad}${/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : `'${key}'`}: ${js(v, depth + 1)},`)
    .join('\n')}\n${closePad}}`
}

main()
  .then((code) => {
    closePrompt()
    process.exit(code ?? 0)
  })
  .catch((err) => {
    closePrompt()
    say()
    say(`Setup could not finish: ${err.message}`)
    process.exit(1)
  })

