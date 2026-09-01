import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  PortfolioAgent, manifestToMarkdown, entityToMarkdown, resultsToMarkdown,
  manifestToPrompt, entityToPrompt, resultsToPrompt, dedupe,
} from '../src/index.js'
import { fictional } from './fixtures.js'

const portfolio = () => PortfolioAgent.fromManifest(fictional, { strict: false })

/**
 * Structural validation of generated Markdown.
 *
 * Deliberately not "it contains the word Overview". These check the properties that make
 * Markdown *render correctly*, which is what the copy button promises and what a screenshot of
 * a passing string does not establish.
 *
 * @param {string} markdown
 */
function markdownProblems(markdown) {
  const problems = []
  const lines = markdown.split('\n')

  let previousLevel = 0
  lines.forEach((line, i) => {
    const heading = /^(#{1,6}) (.*)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      // A heading may only go one level deeper than the one before it. Jumping from `###` back
      // up to `##` inside the same entry is what made a profile render as a flat list of
      // top-level sections instead of a nested document.
      if (previousLevel && level > previousLevel + 1) {
        problems.push(`line ${i + 1}: heading jumps ${previousLevel} → ${level}`)
      }
      if (!heading[2].trim()) problems.push(`line ${i + 1}: empty heading`)
      previousLevel = level
    }

    // A link whose text or target is empty renders as literal brackets.
    for (const [, text, url] of line.matchAll(/\[([^\]]*)\]\(([^)]*)\)/g)) {
      if (!text.trim()) problems.push(`line ${i + 1}: link with no text`)
      if (!url.trim()) problems.push(`line ${i + 1}: link with no target`)
    }

    // Unbalanced bold markers swallow the rest of the document in most renderers.
    const bold = (line.match(/\*\*/g) ?? []).length
    if (bold % 2 !== 0) problems.push(`line ${i + 1}: unbalanced ** emphasis`)
  })

  if (/\n{3,}/.test(markdown)) problems.push('three or more consecutive newlines')
  // `[ 	]` not `\s`: `\s` matches the newline before a heading, so every blank line before
  // a heading would read as indentation.
  if (/^[ 	]+#/m.test(markdown)) problems.push('indented heading (renders as code)')
  return problems
}

describe('copy as Markdown produces valid Markdown', () => {
  test('a whole profile', () => {
    assert.deepEqual(markdownProblems(manifestToMarkdown(fictional)), [])
  })

  test('one entity, at any heading depth', () => {
    for (const heading of [1, 2, 3, 4]) {
      const md = entityToMarkdown(fictional.projects[0], { heading })
      assert.deepEqual(markdownProblems(md), [], `heading depth ${heading}`)
      assert.ok(md.startsWith('#'.repeat(heading) + ' '), 'title must sit at the requested depth')
    }
  })

  test('an entity nests its sections below its own heading', () => {
    // The bug: sub-sections were a hard `##` whatever the entity's level, so an entity at
    // `###` emitted `## Overview` underneath it — a child heading above its parent.
    const md = entityToMarkdown(fictional.projects[0], { heading: 3 })
    const levels = [...md.matchAll(/^(#{1,6}) /gm)].map((m) => m[1].length)
    assert.equal(levels[0], 3)
    assert.ok(levels.slice(1).every((l) => l > 3), `sub-headings must be deeper than 3: ${levels}`)
  })

  test('a result set', () => {
    const results = portfolio().search('computer vision', { limit: 5 })
    assert.deepEqual(markdownProblems(resultsToMarkdown(results, { query: 'computer vision' })), [])
  })

  test('technologies are not repeated', () => {
    // `technologies`, `topics` and `tags` overlap heavily on imported records — a GitHub
    // project routinely repeats its whole topic list in its tags — and concatenating them
    // printed the same list twice in a row.
    const record = { name: 'x', technologies: ['React', 'TS'], topics: ['react', 'ts'], tags: ['React'] }
    const md = entityToMarkdown(record)
    const line = md.split('\n').find((l) => l && !l.startsWith('#') && l.includes('React'))
    const items = line.split(',').map((s) => s.trim())
    assert.equal(items.length, new Set(items.map((s) => s.toLowerCase())).size, `duplicates in: ${line}`)
  })

  test('dedupe keeps order and first casing', () => {
    assert.deepEqual(dedupe(['React', 'react', ' TS ', 'ts', '']), ['React', 'TS'])
  })

  test('an empty result set says so rather than emitting an empty document', () => {
    assert.match(resultsToMarkdown([], { query: 'nothing' }), /No matching evidence/)
  })
})

describe('copy as Prompt is a prompt, not Markdown in a wrapper', () => {
  const results = () => portfolio().search('computer vision', { limit: 3 })

  test('it carries the grounding contract', () => {
    const prompt = resultsToPrompt(results(), { query: 'computer vision' })
    assert.match(prompt, /Use only the information/)
    assert.match(prompt, /say so plainly rather than inferring/)
  })

  test('it is structured for a model, not for a reader', () => {
    // The distinction §20 draws: Markdown is documentation, a prompt is an instruction plus
    // labelled evidence plus an ask.
    const prompt = resultsToPrompt(results(), { query: 'computer vision', person: 'Marina Delacroix' })
    assert.match(prompt, /## Person/)
    assert.match(prompt, /## Evidence/)
    assert.match(prompt, /## Question/)
    assert.ok(!prompt.includes('**Question:**'), 'must not embed the Markdown document verbatim')
  })

  test('each entry states how strongly it is supported', () => {
    const prompt = resultsToPrompt(results(), { query: 'computer vision' })
    assert.match(prompt, /Why it is here:/)
  })

  test('a section result is labelled as a listing, not as a match', () => {
    const prompt = resultsToPrompt(portfolio().search('Where did she study?'), { query: 'Where did she study?' })
    assert.match(prompt, /no search term matched its text/)
  })

  test('it warns that a result set is a subset', () => {
    // A model handed three results and asked "what has this person built?" will otherwise
    // answer as though those three were the whole career.
    assert.match(resultsToPrompt(results(), { query: 'x' }), /not the person's complete profile/)
  })

  test('an empty set instructs refusal rather than leaving the model to improvise', () => {
    assert.match(resultsToPrompt([], { query: 'x' }), /Say so rather than answering from general knowledge/)
  })

  test('the whole-profile and single-entity prompts still work', () => {
    assert.match(manifestToPrompt(fictional), /Use only the information/)
    assert.match(entityToPrompt(fictional.projects[0], { type: 'projects' }), /one project/)
  })
})
