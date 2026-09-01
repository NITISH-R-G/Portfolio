/**
 * Portfolio entities as an LLM prompt.
 *
 * The use case is specific and worth stating, because it decides every design choice here: a
 * recruiter copies this, pastes it into whatever assistant they already use, and asks
 * questions about a candidate. They will not read the prompt. They will read the *answer*.
 *
 * That makes the grounding instructions the most important part of the output — more
 * important than the profile data itself. A prompt that hands a model a CV and says nothing
 * else produces confident answers to questions the CV does not address, attributed to a real
 * person who has to live with them. So the preamble is explicit about refusing unsupported
 * claims, and the data is labelled with its provenance so the model can cite rather than
 * assert.
 *
 * This is also why the generated prompt never says "you are an expert recruiter" or any of the
 * other role-play framing that makes a model more fluent and less accurate. Fluency is not the
 * problem being solved.
 *
 * @module @portfolio-engine/agent/prompt
 */

import { manifestToMarkdown, entityToMarkdown, dedupe } from './markdown.js'

/**
 * The grounding contract.
 *
 * Every line earns its place:
 *   - "only the information below" bounds the answer to the portfolio.
 *   - the explicit "say so" instruction gives the model a licensed way to decline, which is
 *     what it needs in order not to invent an answer instead.
 *   - the provenance note tells it the evidence lines are citable, which turns "he knows
 *     Python" into "Python, backed by 12 repositories".
 *   - the inference boundary is the one people actually hit: a portfolio listing three React
 *     projects does not state years of experience, and a model asked "how many years of React"
 *     will happily compute one from dates that were never about React.
 */
const PREAMBLE = [
  'You are answering questions about the professional profile below.',
  '',
  'Rules:',
  '- Use only the information in this profile. Do not use outside knowledge about this person.',
  '- If the profile does not support an answer, say so plainly rather than inferring one.',
  '- Where a claim has evidence attached, cite it (for example: "Python — 12 repositories on GitHub").',
  '- Distinguish what is stated from what is implied. Listing a technology on a project is not',
  '  a claim about years of experience, seniority, or proficiency unless the profile says so.',
  '- Do not speculate about anything not covered here: salary, availability, personal details,',
  '  or reasons for leaving a role.',
]

/** Questions the profile is actually shaped to answer. */
const SUGGESTED = [
  'What has this person built?',
  'What technologies have they demonstrated, and what is the evidence?',
  'What experience is relevant to [role or job description]?',
  'Which projects best demonstrate [skill]?',
  'What evidence supports a particular claim?',
]

/**
 * A prompt covering the whole profile.
 *
 * @param {Record<string, any>} manifest
 * @param {{question?: string, sections?: string[], suggestions?: boolean}} [options]
 * @returns {string}
 */
export function manifestToPrompt(manifest, options = {}) {
  const body = manifestToMarkdown(manifest, { sections: options.sections })
  return assemble(body, {
    subject: manifest?.person?.name,
    source: manifest?.url,
    question: options.question,
    suggestions: options.suggestions !== false,
  })
}

/**
 * A prompt covering one entity.
 *
 * @param {Record<string, any>} record
 * @param {{type?: string, person?: string, source?: string, question?: string}} [options]
 * @returns {string}
 */
export function entityToPrompt(record, options = {}) {
  const body = entityToMarkdown(record, { heading: 2 })
  const kind = options.type ? singular(options.type) : 'item'

  return assemble(body, {
    subject: options.person,
    source: options.source,
    question: options.question,
    suggestions: false,
    // Without this, a model handed one project and asked "what has this person built?" will
    // answer as though that project were the whole career.
    scope: `This is one ${kind} from a larger portfolio, not the person's complete profile.`,
  })
}

/**
 * A prompt built from a set of search results.
 *
 * The case this exists for: a recruiter searches "accessibility work", gets three results, and
 * wants to ask an assistant which is most relevant to a role they are hiring for. That only
 * works if the prompt carries the evidence — descriptions, technologies, what matched, where
 * it came from — rather than a list of titles and a link.
 *
 * The scope line is doing real work. A model handed a filtered subset and asked "what has this
 * person built?" will answer as though the subset were the whole career, which is a false
 * impression built entirely out of true statements.
 *
 * @param {import('./search.js').SearchResult[]} results
 * @param {{query?: string, person?: string, source?: string, question?: string, limit?: number}} [options]
 * @returns {string}
 */
export function resultsToPrompt(results, options = {}) {
  const list = (Array.isArray(results) ? results : []).slice(0, options.limit ?? 20)
  const asked = String(options.query ?? '').trim()
  const who = String(options.person ?? '').trim()

  const lines = [...PREAMBLE]
  lines.push(`- ${asked
    ? `The evidence below is what matched the search "${asked}" — not the person's complete `
      + 'profile. Do not treat this subset as everything they have done.'
    : 'The evidence below is a subset of the portfolio, not the complete profile.'}`)

  /* Who -------------------------------------------------------------------- */

  lines.push('', '## Person', '')
  lines.push(who ? `Name: ${who}` : 'Name: not stated in the supplied evidence.')
  if (options.source) lines.push(`Published at: ${options.source}`)

  /* What was found ---------------------------------------------------------- */

  lines.push('', '## Evidence', '')

  if (!list.length) {
    lines.push('No matching evidence was found in this portfolio. Say so rather than answering from general knowledge.')
  }

  for (const result of list) {
    const record = result.record ?? {}
    lines.push(`### ${str(record.name ?? record.title ?? record.company ?? record.institution ?? result.title)}`)

    const context = [str(record.role ?? record.degree ?? record.issuer ?? record.venue), str(record.location)]
      .filter(Boolean).join(' · ')
    if (context) lines.push(`Context: ${context}`)
    lines.push(`Section: ${result.type}`)

    const overview = str(record.description ?? record.summary ?? record.abstract ?? record.excerpt)
    if (overview) lines.push(`Description: ${overview}`)

    const tech = dedupe([...arr(record.technologies), ...arr(record.topics), ...arr(record.tags)])
    if (tech.length) lines.push(`Technologies: ${tech.join(', ')}`)

    // How this entry came to be here, stated so the model can weigh it. A section listing is
    // not the same kind of support as a term appearing in a description, and a model that
    // cannot tell them apart will cite the weaker one with equal confidence.
    lines.push(`Why it is here: ${whyPresent(result)}`)

    const evidence = arr(result.provenance?.evidence).map((e) => str(e?.label)).filter(Boolean)
    if (evidence.length) lines.push(`Evidence: ${evidence.join('; ')}`)
    if (str(result.provenance?.source)) lines.push(`Reported by: ${str(result.provenance.source)}`)
    if (str(result.url)) lines.push(`Link: ${str(result.url)}`)
    lines.push('')
  }

  /* The ask ----------------------------------------------------------------- */

  lines.push('## Question', '')
  lines.push(options.question
    ? String(options.question)
    : `Answer the question that follows${who ? ` about ${who}` : ''}, using only the evidence above.`)
  lines.push('')

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/**
 * Why a result is in the set, in the model's terms.
 *
 * The distinction the grounding rules depend on: "the word appears in the description" and
 * "this entry is filed under Education" are different kinds of support, and a model told only
 * "relevant" will cite both as though they were the same.
 *
 * @param {import('./search.js').SearchResult} result
 */
function whyPresent(result) {
  if (result.reason === 'section') return `listed under ${result.type}; no search term matched its text`
  const direct = arr(result.matched).filter((m) => m.direct).map((m) => m.term)
  const related = arr(result.matched).filter((m) => !m.direct).map((m) => m.term)
  const parts = []
  if (direct.length) parts.push(`contains ${direct.join(', ')}`)
  if (related.length) parts.push(`related to ${related.join(', ')} (concept match, not a literal term)`)
  return parts.join('; ') || 'ranked relevant to the query'
}

/** @param {unknown} v */
const arr = (v) => (Array.isArray(v) ? v : [])
/** @param {unknown} v */
const str = (v) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')

/**
 * @param {string} body
 * @param {{subject?: string, source?: string, question?: string, suggestions?: boolean, scope?: string}} context
 */
function assemble(body, context) {
  const lines = [...PREAMBLE]

  if (context.scope) lines.push(`- ${context.scope}`)

  lines.push('', '---', '')
  lines.push(body.trim(), '')
  lines.push('---', '')

  if (context.source) {
    lines.push(`This profile was published at ${context.source} and is machine-readable at that address.`, '')
  }

  if (context.suggestions) {
    lines.push('Questions this profile can support:', '')
    lines.push(...SUGGESTED.map((q) => `- ${q}`), '')
  }

  if (context.question) {
    lines.push(`Question: ${context.question}`, '')
  } else {
    const who = context.subject ? ` about ${context.subject}` : ''
    lines.push(`Answer the question that follows${who}, using only the profile above.`, '')
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/** @param {string} type */
const singular = (type) => ({
  projects: 'project', experience: 'role', education: 'qualification',
  publications: 'publication', achievements: 'achievement', skills: 'skill',
  certifications: 'certification', writing: 'article', packages: 'package',
  talks: 'talk', hackathons: 'hackathon', videos: 'video', models: 'model',
  competitions: 'competitive-programming profile', languages: 'language',
}[type] ?? type.replace(/s$/, ''))

export { PREAMBLE, SUGGESTED }
