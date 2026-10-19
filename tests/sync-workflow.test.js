import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, test } from 'node:test'

import { EVENT_TYPE } from '../src/core/sync/publish.js'

/**
 * The deploy workflow's side of the sync contract.
 *
 * The service and the workflow are two halves of one mechanism joined by a string — the
 * `repository_dispatch` event type — and a handful of properties that only hold because of how
 * the workflow is written: a burst of dispatches coalesces *because* of its concurrency group; a
 * dispatch payload is safe *because* it never reaches a shell. None of these can be exercised
 * without running Actions, so they are pinned structurally here. A future edit that breaks one
 * would otherwise be a silent regression found in production.
 *
 * There is no YAML parser in this project's dependencies and adding one for this would be out of
 * proportion, so the checks read the file as text. That makes them strict about shape (two-space
 * indentation, the layout the file already has) — a reformat that trips them should update them.
 */

const FILE = path.join(process.cwd(), '.github', 'workflows', 'deploy.yml')
const text = fs.readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n')
const lines = text.split('\n')

/** The `- name:` of each step, in order, with the text of its block. */
function steps() {
  const out = []
  let current = null
  for (const line of lines) {
    const start = /^ {6}- name: (.+)$/.exec(line)
    if (start) {
      current = { name: start[1].trim(), body: [] }
      out.push(current)
    } else if (current && (line.startsWith('        ') || line.trim() === '' || line.startsWith('      #'))) {
      current.body.push(line)
    } else if (current && /^ {2}\S|^\S/.test(line)) {
      current = null
    }
  }
  return out.map((s) => ({ name: s.name, body: s.body.join('\n') }))
}

/** Every `run:` script body in the file. */
function runBlocks() {
  const blocks = []
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^(\s*)run:\s*(\|?)\s*(.*)$/.exec(lines[i])
    if (!match) continue
    if (match[2] !== '|') {
      blocks.push(match[3])
      continue
    }
    const indent = match[1].length
    const body = []
    for (let j = i + 1; j < lines.length; j += 1) {
      if (lines[j].trim() !== '' && lines[j].search(/\S/) <= indent) break
      body.push(lines[j])
    }
    blocks.push(body.join('\n'))
  }
  return blocks
}

describe('the deploy workflow, as the sync service depends on it', () => {
  test('listens for exactly the event type the service sends', () => {
    assert.match(text, /\n {2}repository_dispatch:\n {4}types: \[([^\]]+)\]/)
    const types = /repository_dispatch:\n {4}types: \[([^\]]+)\]/.exec(text)[1].split(',').map((t) => t.trim())
    assert.deepEqual(types, [EVENT_TYPE], 'the service and the workflow disagree about the event name')
  })

  test('still runs on push to main, on the weekly schedule, and by hand', () => {
    assert.match(text, /\n {2}push:\n {4}branches: \["main"\]/)
    assert.match(text, /\n {2}workflow_dispatch:/)
    assert.match(text, /\n {2}schedule:\n {4}- cron: "0 6 \* \* 1"/)
  })

  test('keeps the concurrency group that makes a burst of dispatches coalesce', () => {
    // At most one run in progress and one pending; a newer pending run replaces an older one.
    // The ledger's cooldown reduces how often this is exercised, but this is what makes it safe
    // when two dispatches do land close together.
    assert.match(text, /concurrency:\n {2}group: "pages"\n {2}cancel-in-progress: false/)
  })

  test('grants no new permissions — triggering a build must not widen what a run can do', () => {
    const top = /\npermissions:\n((?: {2}\S.*\n)+)/.exec(text)[1]
    assert.deepEqual(
      top.trim().split('\n').map((l) => l.trim()).sort(),
      ['contents: read', 'id-token: write', 'pages: write'],
    )
    assert.ok(!/\bactions:\s*write\b/.test(text))
  })

  test('no script ever interpolates a dispatch payload or other event text', () => {
    // `${{ … }}` inside a `run:` is substituted *before* the shell parses it, so an attacker
    // controlled string becomes code. The payload is passed through `env:` instead, where the
    // shell sees it as data.
    for (const block of runBlocks()) {
      assert.ok(
        !/\$\{\{[^}]*(client_payload|head_commit|pull_request|issue|comment|head_ref)[^}]*\}\}/.test(block),
        `a run script interpolates event text:\n${block}`,
      )
    }
  })

  test('the payload reaches its step through the environment', () => {
    const note = steps().find((s) => s.name === 'Note what started this run')
    assert.ok(note, 'the step that records why a run started is missing')
    assert.match(note.body, /env:\n\s+EVENT: \$\{\{ github\.event_name \}\}\n\s+PAYLOAD: \$\{\{ toJSON\(github\.event\.client_payload\) \}\}/)
    // And it cannot close the code fence it is printed in.
    assert.match(note.body, /\$\{PAYLOAD\/\/\\~\/\}/)
  })
})

describe('the sync-state cache', () => {
  const order = () => steps().map((s) => s.name)
  const cache = () => steps().find((s) => s.name === 'Restore sync state')

  test('exists, and uses the official cache action', () => {
    assert.ok(cache(), 'last-known-good and meaningful change summaries both depend on this step')
    assert.match(cache().body, /uses: actions\/cache@v4/)
  })

  test('runs after the tests and before the import', () => {
    // After the tests so they see the tree they always did; before the import so it has history.
    const names = order()
    assert.ok(names.indexOf('Run tests') < names.indexOf('Restore sync state'))
    assert.ok(names.indexOf('Restore sync state') < names.indexOf('Import profile data'))
  })

  test('caches exactly the state worth keeping, and nothing that is recomputed', () => {
    const body = cache().body
    for (const kept of ['src/data/generated/sources', 'src/data/generated/status.json', 'src/data/generated/http-cache.json']) {
      assert.ok(body.includes(kept), `${kept} is not cached`)
    }
    // Serving any of these stale would publish old data under a fresh timestamp.
    for (const recomputed of ['embeddings.json', 'portfolio.json', 'embeddable.json', 'inputs.json']) {
      assert.ok(!body.includes(recomputed), `${recomputed} must be recomputed every run, not restored`)
    }
  })

  test('saves a fresh entry every run and restores the most recent', () => {
    const body = cache().body
    assert.match(body, /key: sync-state-\$\{\{ github\.run_id \}\}/)
    assert.match(body, /restore-keys: \|\n\s+sync-state-/)
  })

  test('the import still tolerates failure, which last-known-good depends on', () => {
    const imp = steps().find((s) => s.name === 'Import profile data')
    assert.match(imp.body, /continue-on-error: true/)
  })
})
