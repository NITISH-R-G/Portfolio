#!/usr/bin/env node
/**
 * `npm run example -- <persona>` — try the engine on a sample profile.
 *
 * The fastest possible evaluation path: no account, no API key, no waiting for an import.
 * It writes a persona's config and data into place (backing up whatever was there) so the
 * next `npm run dev` shows a complete, realistic portfolio of that shape.
 *
 * `npm run example -- restore` puts your own files back.
 *
 * @module scripts/example
 */

import { PERSONAS, getPersona } from '../examples/personas.js'
import { buildPortfolio } from '../src/core/generate/build.js'
import { PATHS, writeJson, relative, fs, path } from './lib/portfolio.mjs'
import { bold, dim, green, say, ok, warn, fail, info, rule, wrapText } from './lib/ui.mjs'

/** Suffix used for the copies of the user's own files. */
const BACKUP = '.mine'

const CONFIG_BACKUP = `${PATHS.config}${BACKUP}`
const MANUAL_BACKUP = `${PATHS.manual}${BACKUP}`

function main() {
  const arg = process.argv.slice(2).find((a) => !a.startsWith('-'))

  if (!arg || arg === 'list') return list()
  if (arg === 'restore') return restore()

  const persona = getPersona(arg)
  if (!persona) {
    fail(`No sample profile called "${arg}".`)
    list()
    return 1
  }

  return apply(persona)
}

function list() {
  say()
  rule('Sample profiles')
  say(wrapText(
    'Each one populates a different part of the schema, so the sections that appear differ '
    + 'between them — which is the auto-detection working, not a coincidence.',
    0,
  ))
  say()

  for (const persona of PERSONAS) {
    // Running the real pipeline here means the listed section names are what would actually
    // render, not a hand-maintained description that could drift.
    const built = buildPortfolio({ config: persona.config, manual: persona.profile })
    const sections = built.sections.filter((s) => s.visible).map((s) => s.id)

    say(`  ${green(persona.id.padEnd(24))} ${persona.name}`)
    say(dim(wrapText(persona.description, 4)))
    say(dim(`    sections: ${sections.join(', ')}`))
    say()
  }

  say(`Try one:  ${bold('npm run example -- researcher')}`)
  say(`Undo:     ${bold('npm run example -- restore')}`)
  return 0
}

/** @param {import('../examples/personas.js').Persona} persona */
function apply(persona) {
  say()
  rule(`Applying "${persona.name}"`)

  // Back up once and never overwrite the backup: applying two personas in a row must not
  // lose the user's original files behind the first persona's.
  backup(PATHS.config, CONFIG_BACKUP)
  backup(PATHS.manual, MANUAL_BACKUP)

  fs.writeFileSync(PATHS.config, renderConfig(persona), 'utf8')
  writeJson(PATHS.manual, persona.profile)

  // A persona is self-contained sample data; leaving real imported sources in place would
  // blend two people's portfolios into one and make the preview meaningless.
  if (fs.existsSync(PATHS.sources)) {
    const stash = `${PATHS.sources}${BACKUP}`
    if (!fs.existsSync(stash)) {
      fs.renameSync(PATHS.sources, stash)
      info(`Moved your imported sources aside to ${relative(stash)}.`)
    } else {
      fs.rmSync(PATHS.sources, { recursive: true, force: true })
    }
  }

  const built = buildPortfolio({ config: persona.config, manual: persona.profile })
  const sections = built.sections.filter((s) => s.visible)

  ok(`${relative(PATHS.config)} and ${relative(PATHS.manual)} now hold the sample profile.`)
  say()
  say(`  ${dim('Name')}      ${built.profile.identity.name}`)
  say(`  ${dim('Theme')}     ${built.config.theme.preset}`)
  say(`  ${dim('Sections')}  ${sections.map((s) => s.id).join(', ')}`)
  say()
  say(`Run ${bold('npm run dev')} to see it.`)
  say(dim(`Your own files are safe — ${bold('npm run example -- restore')} puts them back.`))
  return 0
}

function restore() {
  say()
  rule('Restoring your files')

  let restored = 0
  restored += unbackup(CONFIG_BACKUP, PATHS.config)
  restored += unbackup(MANUAL_BACKUP, PATHS.manual)

  const stash = `${PATHS.sources}${BACKUP}`
  if (fs.existsSync(stash)) {
    fs.rmSync(PATHS.sources, { recursive: true, force: true })
    fs.renameSync(stash, PATHS.sources)
    ok(`Restored ${relative(PATHS.sources)}`)
    restored += 1
  }

  if (!restored) {
    warn('Nothing to restore — no sample profile is currently applied.')
    return 0
  }
  say()
  say(dim('Run `npm run dev` to see your own portfolio again.'))
  return 0
}

/** @param {string} file @param {string} target */
function backup(file, target) {
  if (!fs.existsSync(file) || fs.existsSync(target)) return
  fs.copyFileSync(file, target)
  info(`Saved your ${relative(file)} to ${relative(target)}.`)
}

/** @param {string} source @param {string} target @returns {number} */
function unbackup(source, target) {
  if (!fs.existsSync(source)) return 0
  fs.copyFileSync(source, target)
  fs.rmSync(source)
  ok(`Restored ${relative(target)}`)
  return 1
}

/** @param {import('../examples/personas.js').Persona} persona */
function renderConfig(persona) {
  return `// @ts-check
import { defineConfig } from './src/core/config/types.js'

/**
 * Sample profile: ${persona.name}.
 *
 * ${persona.description}
 *
 * This was written by \`npm run example -- ${persona.id}\`. Your own config was saved to
 * portfolio.config.js${BACKUP} — run \`npm run example -- restore\` to put it back.
 */
export default defineConfig(${js(persona.config, 0)})
`
}

/**
 * Object-literal syntax rather than JSON, so the generated file matches the style of the
 * one it replaced and stays comfortable to edit by hand.
 *
 * @param {unknown} value
 * @param {number} depth
 * @returns {string}
 */
function js(value, depth) {
  const pad = '  '.repeat(depth + 1)
  const closePad = '  '.repeat(depth)

  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return String(value)

  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    if (value.every((v) => typeof v === 'string')) {
      const inline = `[${value.map((v) => js(v, depth)).join(', ')}]`
      if (inline.length <= 72) return inline
    }
    return `[\n${value.map((v) => `${pad}${js(v, depth + 1)},`).join('\n')}\n${closePad}]`
  }

  const entries = Object.entries(value).filter(([, v]) => v !== undefined)
  if (!entries.length) return '{}'
  return `{\n${entries
    .map(([key, v]) => `${pad}${/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : `'${key}'`}: ${js(v, depth + 1)},`)
    .join('\n')}\n${closePad}}`
}

try {
  process.exit(main() ?? 0)
} catch (err) {
  say()
  fail(`Could not apply the sample: ${err.message}`)
  process.exit(1)
}
