/**
 * Understanding what a question is asking for.
 *
 * `search.js` is good at "which records contain these words". It is useless at *"Where did he
 * study?"* — a question whose answer is an entire section of the portfolio, and not one of
 * whose words appears in any education record. Before this module, that query returned three
 * unrelated projects, and *"What companies has he worked with?"* returned nothing at all.
 *
 * So this layer sits in front of retrieval and turns a sentence into the structured thing
 * retrieval can act on:
 *
 *     "Where did he study?"  →  { intent: 'find_education',
 *                                 entityTypes: ['education'],
 *                                 terms: [], concepts: … }
 *
 * ## Why the type is a boost and not a filter
 *
 * A hard filter is the obvious implementation and it is wrong. Ask *"which projects show
 * computer vision"* on a portfolio whose strongest evidence is a **skill** carrying "OpenCV —
 * 4 repositories", and a filter throws away the best answer for being the wrong shape. The
 * type is a strong preference, so the right shape wins ties and near-ties, and genuinely
 * better evidence of another shape can still surface. Grouping in the UI does the rest.
 *
 * ## Why intent is read from the raw sentence
 *
 * The retrieval tokenizer strips `work`, `worked`, `built`, `use`, `know` as stop words —
 * correctly, because as *search terms* they match everything and mean nothing. But as *intent
 * signals* they are the whole question: "worked" is what distinguishes "companies he worked
 * with" from "companies". So this module reads the original text before any of that is thrown
 * away.
 *
 * ## What it is not
 *
 * It is not a model and does not infer facts. It decides which part of the portfolio a
 * question is about; it never decides what the answer is. Everything it produces is still
 * scored against real records, and every result still carries its own provenance.
 *
 * @module @portfolio-engine/agent/query
 */

import { tokenize, expandQuery, STOP_WORDS } from './search.js'

/**
 * Words that name a part of a portfolio, mapped to the collection they name.
 *
 * Written as whole words matched against the raw sentence, so "studied" and "study" both
 * land, and "works" does not accidentally match inside "network". Order does not matter — a
 * query mentioning several is allowed to want several.
 *
 * @type {Record<string, string[]>}
 */
const TYPE_WORDS = {
  projects: [
    'project', 'projects', 'built', 'build', 'building', 'made', 'make', 'created', 'created',
    'app', 'apps', 'application', 'applications', 'tool', 'tools', 'software', 'shipped',
    'developed', 'implementation', 'demo', 'demos', 'side project',
  ],
  experience: [
    'experience', 'job', 'jobs', 'work', 'worked', 'working', 'company', 'companies',
    'employer', 'employers', 'employed', 'employment', 'role', 'roles', 'position',
    'positions', 'internship', 'internships', 'intern', 'career', 'professionally', 'client',
    'clients', 'team', 'teams',
  ],
  education: [
    'study', 'studied', 'studies', 'studying', 'education', 'educational', 'degree', 'degrees',
    'university', 'universities', 'college', 'school', 'academic', 'academics', 'graduated',
    'graduate', 'undergraduate', 'major', 'majored', 'coursework', 'gpa', 'alma mater',
  ],
  publications: [
    'publication', 'publications', 'published', 'publish', 'paper', 'papers', 'research',
    'journal', 'journals', 'conference', 'conferences', 'preprint', 'thesis', 'citation',
    'citations', 'author', 'authored', 'doi',
  ],
  skills: [
    'skill', 'skills', 'technology', 'technologies', 'tech', 'stack', 'know', 'knows',
    'knowledge', 'proficient', 'proficiency', 'familiar', 'expertise', 'competent', 'language',
    'languages', 'framework', 'frameworks', 'tooling',
  ],
  certifications: [
    'certification', 'certifications', 'certificate', 'certificates', 'certified',
    'credential', 'credentials', 'licence', 'license', 'accreditation',
  ],
  achievements: [
    'achievement', 'achievements', 'award', 'awards', 'honour', 'honours', 'honor', 'honors',
    'recognition', 'won', 'winner', 'prize', 'prizes', 'accomplishment', 'accomplishments',
  ],
  competitions: [
    'competition', 'competitions', 'competitive', 'contest', 'contests', 'ranking', 'rank',
    'ranked', 'leetcode', 'codeforces', 'codechef', 'hackerrank', 'rating', 'leaderboard',
  ],
  writing: [
    'blog', 'blogs', 'article', 'articles', 'wrote', 'writing', 'written', 'post', 'posts',
    'newsletter', 'essay', 'essays',
  ],
  talks: ['talk', 'talks', 'spoke', 'speaking', 'presentation', 'presentations', 'keynote', 'webinar'],
  packages: ['package', 'packages', 'library', 'libraries', 'npm', 'pypi', 'published package'],
  hackathons: ['hackathon', 'hackathons', 'devpost'],
  languages: ['spoken language', 'speaks', 'fluent', 'bilingual', 'native speaker'],
}

/**
 * Phrases that mean "everything" — a question about the person rather than one section.
 * These deliberately produce no type preference so the whole portfolio competes.
 */
const BROAD = [
  'tell me about', 'who is', 'what can', 'overview', 'summary', 'summarise', 'summarize',
  'background', 'anything', 'everything', 'introduce',
]

/**
 * @typedef {object} ParsedQuery
 * @property {string} text                  The original question, untouched.
 * @property {string} intent                `find_projects`, `find_education`, `find_any`, …
 * @property {string[]} entityTypes         Collections the question is about. May be empty.
 * @property {'explicit'|'none'} typeSignal How the types were arrived at.
 * @property {string[]} terms               Content terms for lexical matching.
 * @property {Map<string, string[]>} concepts  Concept expansions, from `expandQuery`.
 * @property {boolean} broad                Whether the question is about the whole profile.
 */

/**
 * Parse a natural-language question.
 *
 * Total and synchronous: any string produces a `ParsedQuery`, and an empty or unparseable one
 * simply has no types and no terms.
 *
 * @param {string} input
 * @returns {ParsedQuery}
 */
export function parseQuery(input) {
  const text = String(input ?? '')
  const lower = text.toLowerCase()

  const { terms, expansions } = expandQuery(text)

  /* Which parts of the portfolio is this about? ----------------------------- */

  /** @type {Map<string, number>} */
  const hits = new Map()
  /** Words spent on identifying the section, so they are not also spent as search terms. */
  const consumed = new Set()

  for (const [type, words] of Object.entries(TYPE_WORDS)) {
    for (const word of words) {
      if (!containsWord(lower, word)) continue
      // A later mention is no stronger than an earlier one; what matters is how many distinct
      // words for a type appear, so "companies he worked with" outweighs a passing "work".
      hits.set(type, (hits.get(type) ?? 0) + 1)
      for (const token of tokenize(word)) consumed.add(token)
    }
  }

  const broad = BROAD.some((phrase) => lower.includes(phrase))

  // A broad question about the person should not be narrowed by the incidental verb in it —
  // "tell me about his work" is not a question about employment records.
  const entityTypes = broad ? [] : rankTypes(hits)

  // A word already spent naming the section is not also a thing to search for. "Where did he
  // study?" asks about education; matching the literal token "study" against project text
  // found three unrelated projects and buried the answer. Same for "companies", "published",
  // "technologies" — words that describe the shape of the answer, not its content.
  const searchTerms = entityTypes.length ? terms.filter((term) => !consumed.has(term)) : terms

  return {
    text,
    intent: entityTypes.length === 1 ? `find_${entityTypes[0]}` : entityTypes.length ? 'find_mixed' : 'find_any',
    entityTypes,
    typeSignal: entityTypes.length ? 'explicit' : 'none',
    terms: searchTerms,
    concepts: expansions,
    broad,
  }
}

/**
 * Types worth preferring, strongest first.
 *
 * Only types within one mention of the leader are kept. A question mentioning "projects" three
 * times and "work" once is about projects; carrying the weaker signal would dilute the
 * preference into no preference at all.
 *
 * @param {Map<string, number>} hits
 * @returns {string[]}
 */
function rankTypes(hits) {
  if (!hits.size) return []
  const sorted = [...hits.entries()].sort((a, b) => b[1] - a[1])
  const best = sorted[0][1]
  return sorted.filter(([, count]) => count >= best - 1).map(([type]) => type)
}

/**
 * Whole-word (or whole-phrase) containment.
 *
 * Guards against the substring problem that makes naive keyword mapping useless: "work" inside
 * "network", "rank" inside "frankly", "post" inside "postgres".
 *
 * @param {string} haystack  Already lower-cased.
 * @param {string} needle
 */
function containsWord(haystack, needle) {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, 'u').test(haystack)
}

/**
 * A human-readable account of how the question was read.
 *
 * Shown in the UI and returned to agents, because a system that silently reinterprets a
 * question should be able to say what it decided.
 *
 * @param {ParsedQuery} parsed
 * @returns {string|undefined}
 */
export function describeQuery(parsed) {
  if (!parsed?.entityTypes?.length) return undefined
  const names = parsed.entityTypes.map((t) => LABELS[t] ?? t)
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
  return `Looking in ${list}`
}

/** Display names for the standard's collection keys. */
const LABELS = {
  projects: 'projects', experience: 'experience', education: 'education',
  publications: 'publications', skills: 'skills', certifications: 'certifications',
  achievements: 'achievements', competitions: 'competitive programming',
  writing: 'writing', talks: 'talks', packages: 'packages', hackathons: 'hackathons',
  languages: 'languages',
}

export { TYPE_WORDS, BROAD, STOP_WORDS }
