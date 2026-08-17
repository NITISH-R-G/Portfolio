/**
 * Terminal output and prompting.
 *
 * Kept dependency-free on purpose. A portfolio generator that pulls in a prompt library, a
 * colour library and a spinner library for six scripts is a portfolio generator with a
 * hundred-package install, and the point of this project is that `npm install` is quick and
 * the dependency tree is something a user could actually read.
 *
 * @module scripts/lib/ui
 */

import readline from 'node:readline'

/**
 * Colour is opt-out via NO_COLOR (the widely-honoured convention) and is skipped entirely
 * when output is piped, so a redirected log file does not fill with escape codes.
 */
const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR

/**
 * Written as an escape sequence rather than a literal ESC byte, so the source stays
 * copy-pasteable and a stray invisible character cannot go unnoticed in review.
 * @param {number} code
 */
const wrap = (code) => (text) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : String(text))

export const bold = wrap(1)
export const dim = wrap(2)
export const red = wrap(31)
export const green = wrap(32)
export const yellow = wrap(33)
export const blue = wrap(36)
export const magenta = wrap(35)

/** @param {string} [message] */
export const say = (message = '') => console.log(message)

/** @param {string} message */
export const heading = (message) => console.log(`\n${bold(message)}`)

/** @param {string} message */
export const ok = (message) => console.log(`${green('✓')} ${message}`)

/** @param {string} message */
export const warn = (message) => console.log(`${yellow('!')} ${message}`)

/** @param {string} message */
export const fail = (message) => console.log(`${red('✗')} ${message}`)

/** @param {string} message */
export const info = (message) => console.log(`${blue('·')} ${message}`)

/**
 * A single-line rule with an optional label, used to separate the phases of a long script.
 * @param {string} [label]
 */
export function rule(label = '') {
  const width = Math.min(process.stdout.columns || 80, 80)
  if (!label) return say(dim('─'.repeat(width)))
  const text = ` ${label} `
  say(dim(`─${text}${'─'.repeat(Math.max(0, width - text.length - 1))}`))
}

/**
 * The status symbol for a connector outcome. The same vocabulary appears in `npm run
 * import`, `npm run doctor` and the admin, so a user only learns it once.
 *
 * @param {string} state
 * @returns {string}
 */
export function stateBadge(state) {
  switch (state) {
    case 'imported': return green('imported')
    case 'partial': return yellow('partial')
    case 'manual': return blue('manual')
    case 'link-only': return blue('link only')
    case 'empty': return dim('empty')
    case 'unavailable': return yellow('unavailable')
    case 'skipped': return dim('skipped')
    case 'error': return red('error')
    default: return state
  }
}

/**
 * Wrap text to the terminal width with a hanging indent, so a long explanation stays
 * readable instead of becoming one unbroken line.
 *
 * @param {string} text
 * @param {number} indent
 * @returns {string}
 */
export function wrapText(text, indent = 4) {
  const width = Math.min(process.stdout.columns || 80, 90) - indent
  const pad = ' '.repeat(indent)
  const words = String(text).split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const word of words) {
    if (line && line.length + word.length + 1 > width) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  return lines.map((l) => pad + l).join('\n')
}

/* -------------------------------------------------------------------------- */
/* Prompting                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * One readline interface for the whole script. Creating one per question makes Ctrl-C stop
 * working reliably on Windows terminals.
 * @type {readline.Interface|null}
 */
let rl = null

function reader() {
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    // Without this, Ctrl-C during a question leaves the terminal without an echo.
    rl.on('SIGINT', () => {
      say('\nCancelled. Nothing was written.')
      process.exit(130)
    })
  }
  return rl
}

export function closePrompt() {
  rl?.close()
  rl = null
}

/**
 * Whether prompting is possible at all. A non-interactive shell (CI, a piped script) must
 * fall back to defaults rather than hanging forever on a question nobody can answer.
 */
export const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)

/**
 * @param {string} question
 * @param {{default?: string, required?: boolean, validate?: (value: string) => string|undefined}} [options]
 * @returns {Promise<string>}
 */
export async function ask(question, options = {}) {
  if (!interactive) return options.default ?? ''

  const suffix = options.default ? dim(` (${options.default})`) : ''
  for (;;) {
    const answer = (await new Promise((resolve) => {
      reader().question(`${question}${suffix}${dim(' › ')}`, resolve)
    })).trim()

    const value = answer || options.default || ''
    if (!value && options.required) {
      fail('This one is required.')
      continue
    }
    const problem = value ? options.validate?.(value) : undefined
    if (problem) {
      fail(problem)
      continue
    }
    return value
  }
}

/**
 * @param {string} question
 * @param {boolean} [fallback]
 * @returns {Promise<boolean>}
 */
export async function confirm(question, fallback = true) {
  if (!interactive) return fallback
  const hint = fallback ? 'Y/n' : 'y/N'
  const answer = (await ask(`${question} ${dim(`[${hint}]`)}`)).toLowerCase()
  if (!answer) return fallback
  return answer.startsWith('y')
}

/**
 * A numbered single-choice list. Numbered rather than arrow-key driven because raw-mode
 * key handling behaves differently across Windows terminals, and a wrong choice here costs
 * the user a config edit.
 *
 * @template T
 * @param {string} question
 * @param {{label: string, value: T, hint?: string}[]} choices
 * @param {number} [defaultIndex]
 * @returns {Promise<T>}
 */
export async function select(question, choices, defaultIndex = 0) {
  if (!interactive) return choices[defaultIndex].value

  say(`\n${bold(question)}`)
  choices.forEach((choice, i) => {
    const marker = i === defaultIndex ? green('›') : ' '
    say(`  ${marker} ${dim(String(i + 1).padStart(2))}. ${choice.label}${choice.hint ? dim(` — ${choice.hint}`) : ''}`)
  })

  for (;;) {
    const answer = await ask('Number', { default: String(defaultIndex + 1) })
    const index = Number(answer) - 1
    if (Number.isInteger(index) && index >= 0 && index < choices.length) return choices[index].value
    fail(`Enter a number between 1 and ${choices.length}.`)
  }
}

/**
 * A numbered multi-choice list. Accepts "1 3 5", "1,3,5", "all" or an empty line for none.
 *
 * @template T
 * @param {string} question
 * @param {{label: string, value: T, hint?: string}[]} choices
 * @returns {Promise<T[]>}
 */
export async function multiSelect(question, choices) {
  if (!interactive) return []

  say(`\n${bold(question)}`)
  choices.forEach((choice, i) => {
    say(`  ${dim(String(i + 1).padStart(3))}. ${choice.label}${choice.hint ? dim(` — ${choice.hint}`) : ''}`)
  })
  say(dim('  Enter numbers separated by spaces, "all", or leave blank for none.'))

  for (;;) {
    const answer = (await ask('Choices')).trim().toLowerCase()
    if (!answer) return []
    if (answer === 'all') return choices.map((c) => c.value)

    const parts = answer.split(/[\s,]+/).filter(Boolean)
    const indices = parts.map((p) => Number(p) - 1)
    if (indices.every((i) => Number.isInteger(i) && i >= 0 && i < choices.length)) {
      return [...new Set(indices)].map((i) => choices[i].value)
    }
    fail(`Use numbers between 1 and ${choices.length}.`)
  }
}
