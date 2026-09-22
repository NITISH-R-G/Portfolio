#!/usr/bin/env node
/**
 * `pnpm dev` — the app and its local write API, together.
 *
 * Two processes rather than one because they answer different questions. `next dev` serves
 * the site and the admin; `dev-api.mjs` is the only thing that can write to the checkout, and
 * it deliberately does not live inside a build whose output is a directory of static files.
 * Starting them separately would work and would be worse: the admin's connect, import and
 * disconnect controls are dead without the API, and an editor whose save button depends on
 * remembering a second terminal is an editor that appears broken.
 *
 * No process manager is used. A dependency for `A & B` on two long-running children is a
 * dependency to audit, update and explain, and the whole of it is below.
 *
 * The API is not load-bearing for the site: if its port is taken, it exits, `next dev` carries
 * on, and the admin degrades to showing you changes to apply by hand — which is exactly what
 * the deployed admin does. So this never treats an API failure as fatal.
 *
 * @module scripts/dev
 */

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('node:child_process').ChildProcess[]} */
const children = []

/**
 * @param {string} label
 * @param {string} command
 * @param {string[]} args
 * @param {{shell?: boolean}} [options]
 */
function start(label, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: path.join(here, '..'),
    // Inherited rather than piped: `next dev` draws its own progress output, and buffering it
    // through this process would strip the formatting and delay every line.
    stdio: 'inherit',
    // Only where it is actually needed. A shell is required on Windows to resolve `next`,
    // which is a `.cmd` shim rather than an executable — but running *this* interpreter
    // through one breaks on the first space in its path: the Windows interpreter lives under
    // Program Files, and a shell splits that into the command `C:\Program` plus arguments.
    // That is exactly how the sidecar failed to start on the first run.
    shell: options.shell === true && process.platform === 'win32',
  })

  child.on('error', (err) => {
    console.error(`  ${label} could not start: ${err.message}`)
  })

  child.on('exit', (code, signal) => {
    // The app exiting ends the session; the API exiting is survivable and already explained
    // itself on the way out.
    if (label === 'next' && !shuttingDown) shutdown(code ?? 0, signal)
  })

  children.push(child)
  return child
}

let shuttingDown = false

/**
 * @param {number} code
 * @param {NodeJS.Signals|null} [signal]
 */
function shutdown(code, signal) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (!child.killed) child.kill(signal ?? 'SIGTERM')
  }
  process.exit(code)
}

for (const signal of /** @type {NodeJS.Signals[]} */ (['SIGINT', 'SIGTERM'])) {
  process.on(signal, () => shutdown(0, signal))
}

start('api', process.execPath, [path.join(here, 'dev-api.mjs')])
start('next', 'next', ['dev', ...process.argv.slice(2)], { shell: true })
