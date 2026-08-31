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

import { manifestToMarkdown, entityToMarkdown } from './markdown.js'

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
