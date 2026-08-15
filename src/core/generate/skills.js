/**
 * Evidence-backed skills.
 *
 * The point of this module is the difference between
 *
 *     "Expert in Python"
 *
 * and
 *
 *     Python — 24 public repositories · 5 featured projects · 2 published packages
 *
 * The second is checkable. This module derives the second from records that were actually
 * imported, and attaches the count and the source to every claim.
 *
 * It never invents a proficiency level. Activity shows *usage*, not *mastery*, and inferring
 * one from the other would be exactly the kind of unearned claim the project exists to avoid.
 * `proficiency` stays whatever the user set, or stays absent.
 *
 * @module core/generate/skills
 */

/** @typedef {import('../schema/types.js').Profile} Profile */
/** @typedef {import('../schema/types.js').SkillItem} SkillItem */
/** @typedef {import('../schema/types.js').SkillEvidence} SkillEvidence */

/**
 * Canonical display names for technologies that appear under several spellings across
 * platforms. Without this, "javascript", "JavaScript" and "JS" become three skills.
 *
 * Keys are lowercase; values are the preferred rendering.
 */
const CANONICAL = {
  'js': 'JavaScript',
  'javascript': 'JavaScript',
  'ts': 'TypeScript',
  'typescript': 'TypeScript',
  'py': 'Python',
  'python': 'Python',
  'python3': 'Python',
  'c++': 'C++',
  'cpp': 'C++',
  'c#': 'C#',
  'csharp': 'C#',
  'golang': 'Go',
  'go': 'Go',
  'rs': 'Rust',
  'rust': 'Rust',
  'jupyter notebook': 'Jupyter',
  'jupyter': 'Jupyter',
  'html': 'HTML',
  'css': 'CSS',
  'scss': 'Sass',
  'sass': 'Sass',
  'shell': 'Shell',
  'bash': 'Shell',
  'sh': 'Shell',
  'powershell': 'PowerShell',
  'objective-c': 'Objective-C',
  'reactjs': 'React',
  'react': 'React',
  'react-native': 'React Native',
  'nodejs': 'Node.js',
  'node': 'Node.js',
  'node-js': 'Node.js',
  'vuejs': 'Vue',
  'vue': 'Vue',
  'nextjs': 'Next.js',
  'next': 'Next.js',
  'tensorflow': 'TensorFlow',
  'pytorch': 'PyTorch',
  'scikit-learn': 'scikit-learn',
  'sklearn': 'scikit-learn',
  'postgres': 'PostgreSQL',
  'postgresql': 'PostgreSQL',
  'mysql': 'MySQL',
  'mongodb': 'MongoDB',
  'k8s': 'Kubernetes',
  'kubernetes': 'Kubernetes',
  'docker': 'Docker',
  'aws': 'AWS',
  'gcp': 'Google Cloud',
  'sql': 'SQL',
  'nlp': 'NLP',
  'llm': 'LLMs',
  'llms': 'LLMs',
  'ml': 'Machine Learning',
  'machine-learning': 'Machine Learning',
  'machine learning': 'Machine Learning',
  'deep-learning': 'Deep Learning',
  'ai': 'AI',
  'api': 'APIs',
  'rest-api': 'REST APIs',
  'graphql': 'GraphQL',
}

/**
 * Topic strings that describe a repository's *purpose* rather than a skill. Including these
 * would fill the skills list with noise like "hacktoberfest" and "awesome-list".
 */
const TOPIC_STOPWORDS = new Set([
  'hacktoberfest', 'awesome', 'awesome-list', 'portfolio', 'demo', 'example', 'examples',
  'tutorial', 'boilerplate', 'template', 'starter', 'playground', 'learning', 'practice',
  'project', 'projects', 'test', 'testing', 'todo', 'sample', 'course', 'assignment',
  'university', 'college', 'student', 'beginner', 'open-source', 'opensource', 'github',
  'personal', 'wip', 'archive', 'archived', 'config', 'dotfiles',
])

/**
 * Broad grouping so the UI can render skills in sensible clusters without the user
 * categorising anything by hand. Unmatched skills fall into "Other".
 */
const CATEGORY_RULES = [
  { category: 'Languages', match: new Set(['javascript', 'typescript', 'python', 'java', 'c', 'c++', 'c#', 'go', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'dart', 'scala', 'r', 'julia', 'perl', 'lua', 'haskell', 'elixir', 'objective-c', 'sql', 'shell', 'powershell', 'html', 'css', 'matlab', 'assembly']) },
  { category: 'AI & ML', match: new Set(['tensorflow', 'pytorch', 'keras', 'scikit-learn', 'machine learning', 'deep learning', 'nlp', 'llms', 'ai', 'computer-vision', 'computer vision', 'transformers', 'langchain', 'huggingface', 'rag', 'pandas', 'numpy', 'opencv', 'jupyter', 'data-science', 'data science', 'reinforcement-learning']) },
  { category: 'Frontend', match: new Set(['react', 'vue', 'angular', 'svelte', 'next.js', 'nuxt', 'sass', 'tailwind', 'tailwindcss', 'vite', 'webpack', 'redux', 'react native', 'flutter', 'astro', 'remix']) },
  { category: 'Backend', match: new Set(['node.js', 'express', 'django', 'flask', 'fastapi', 'spring', 'rails', 'laravel', 'graphql', 'rest apis', 'apis', 'grpc', '.net', 'nestjs']) },
  { category: 'Data', match: new Set(['postgresql', 'mysql', 'mongodb', 'redis', 'sqlite', 'elasticsearch', 'kafka', 'spark', 'airflow', 'dbt', 'snowflake', 'clickhouse', 'duckdb']) },
  { category: 'Infrastructure', match: new Set(['docker', 'kubernetes', 'aws', 'google cloud', 'azure', 'terraform', 'ansible', 'ci-cd', 'github-actions', 'nginx', 'linux', 'serverless', 'cloudflare']) },
]

/**
 * Normalize a raw technology string to its canonical display form.
 *
 * @param {string} raw
 * @returns {string}
 */
export function canonicalizeSkill(raw) {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return ''
  const key = trimmed.toLowerCase()
  if (CANONICAL[key]) return CANONICAL[key]
  // Hyphenated topics read better as words: "graph-algorithms" → "Graph Algorithms".
  if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(key)) {
    const spaced = key.replace(/-/g, ' ')
    if (CANONICAL[spaced]) return CANONICAL[spaced]
    return spaced.split(' ').map(titleCaseWord).join(' ')
  }
  return trimmed
}

/**
 * Initialisms that a topic tag lower-cases and naive title-casing then mangles: GitHub
 * topics are always lower-case, so "ai-agents" would otherwise render as "Ai Agents" —
 * a visible tell that the label was machine-generated rather than written.
 */
const INITIALISMS = new Set([
  'ai', 'ml', 'nlp', 'llm', 'llms', 'cv', 'api', 'apis', 'cli', 'gui', 'ui', 'ux',
  'sql', 'nosql', 'css', 'html', 'json', 'xml', 'yaml', 'http', 'https', 'rest',
  'grpc', 'graphql', 'sdk', 'orm', 'crud', 'jwt', 'oauth', 'ci', 'cd', 'aws', 'gcp',
  'ios', 'os', 'db', 'etl', 'gpu', 'cpu', 'iot', 'ar', 'vr', 'xr', 'ocr', 'tts',
  'stt', 'rag', 'cnn', 'rnn', 'gan', 'lstm', 'bert', 'gpt', 'mcp', 'p2p', 'ssr',
  'spa', 'pwa', 'seo', 'dns', 'tcp', 'udp', 'ssh', 'tls', 'ssl', 'vpn', '3d', '2d',
])

/** @param {string} word */
function titleCaseWord(word) {
  if (INITIALISMS.has(word)) return word.toUpperCase()
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/**
 * Assign a category from the canonical name.
 *
 * @param {string} name
 * @returns {string}
 */
export function categorizeSkill(name) {
  const key = String(name ?? '').toLowerCase()
  for (const rule of CATEGORY_RULES) {
    if (rule.match.has(key)) return rule.category
  }
  return 'Other'
}

/**
 * An accumulator for one skill while evidence is being gathered.
 * @typedef {object} SkillAccumulator
 * @property {string} name
 * @property {Map<string, {count: number, connector?: string}>} signals
 */

/**
 * Derive evidence-backed skills from a profile.
 *
 * Existing `profile.skills` entries are preserved — a user's hand-written skill list is
 * never discarded — and gain evidence when the imported data supports them.
 *
 * @param {Profile} profile
 * @param {{minEvidence?: number, maxSkills?: number}} [options]
 * @returns {SkillItem[]}
 */
export function deriveSkills(profile, options = {}) {
  const minEvidence = options.minEvidence ?? 1
  const maxSkills = options.maxSkills ?? 60

  /** @type {Map<string, {name: string, signals: Map<string, {count: number, connector?: string}>}>} */
  const acc = new Map()

  const bump = (/** @type {string} */ rawName, /** @type {string} */ signal, /** @type {string} */ connector) => {
    const name = canonicalizeSkill(rawName)
    if (!name || name.length > 40) return
    const key = name.toLowerCase()
    if (TOPIC_STOPWORDS.has(key)) return
    if (!acc.has(key)) acc.set(key, { name, signals: new Map() })
    const entry = /** @type {{name: string, signals: Map<string, {count: number, connector?: string}>}} */ (acc.get(key))
    const existing = entry.signals.get(signal)
    if (existing) existing.count += 1
    else entry.signals.set(signal, { count: 1, connector })
  }

  /* Projects — the richest source. ------------------------------------------ */

  for (const project of profile.projects ?? []) {
    const connector = project.source?.connector
    if (project.primaryLanguage) bump(project.primaryLanguage, 'repositories', connector)
    for (const tech of project.technologies ?? []) bump(tech, 'projects', connector)
    for (const topic of project.topics ?? []) bump(topic, 'topics', connector)
    if (project.featured) {
      for (const tech of [project.primaryLanguage, ...(project.technologies ?? [])]) {
        if (tech) bump(tech, 'featured projects', connector)
      }
    }
  }

  /* Experience — professional usage carries weight. -------------------------- */

  for (const role of profile.experience ?? []) {
    for (const tech of role.technologies ?? []) bump(tech, 'roles', role.source?.connector)
  }

  /* Published packages and models — the strongest single signal. -------------- */

  for (const pkg of profile.packages ?? []) {
    for (const keyword of pkg.keywords ?? []) bump(keyword, 'published packages', pkg.source?.connector)
  }
  for (const model of profile.models ?? []) {
    for (const tag of model.tags ?? []) bump(tag, 'published models', model.source?.connector)
  }

  /* Hackathons and posts. ---------------------------------------------------- */

  for (const hack of profile.hackathons ?? []) {
    for (const tech of hack.technologies ?? []) bump(tech, 'hackathon projects', hack.source?.connector)
  }
  for (const post of profile.posts ?? []) {
    for (const tag of post.tags ?? []) bump(tag, 'articles', post.source?.connector)
  }

  /* Merge with user-declared skills. ----------------------------------------- */

  /** @type {Map<string, SkillItem>} */
  const declared = new Map()
  for (const skill of profile.skills ?? []) {
    const name = canonicalizeSkill(skill.name)
    if (!name) continue
    declared.set(name.toLowerCase(), { ...skill, name })
  }

  /** @type {SkillItem[]} */
  const out = []

  for (const [key, entry] of acc) {
    /** @type {SkillEvidence[]} */
    const evidence = []
    let total = 0
    for (const [signal, { count, connector }] of entry.signals) {
      total += count
      evidence.push({
        label: `${count} ${count === 1 ? singular(signal) : signal}`,
        count,
        ...(connector ? { connector } : {}),
      })
    }
    // Strongest evidence first so the UI can truncate without losing the best line.
    evidence.sort((a, b) => (b.count ?? 0) - (a.count ?? 0))

    if (total < minEvidence && !declared.has(key)) continue

    const existing = declared.get(key)
    declared.delete(key)

    // A skill that a résumé *lists* and that GitHub repositories *demonstrate* is backed by
    // two independent sources, which is a far stronger claim than either alone. Without
    // this the declaring source is silently dropped at the moment the two agree — exactly
    // the case worth showing.
    if (existing?.source?.connector && !evidence.some((e) => e.connector === existing.source.connector)) {
      evidence.push({
        label: existing.source.document ? 'listed in your résumé' : 'listed by you',
        connector: existing.source.connector,
      })
    }
    for (const entry_ of existing?.evidence ?? []) {
      if (!evidence.some((e) => e.connector === entry_.connector && e.label === entry_.label)) {
        evidence.push(entry_)
      }
    }

    out.push({
      name: entry.name,
      category: existing?.category ?? categorizeSkill(entry.name),
      ...(existing?.proficiency !== undefined ? { proficiency: existing.proficiency } : {}),
      ...(existing?.source ? { source: existing.source } : {}),
      evidence,
      weight: total,
      // Remembered so the cap below can protect it. A skill the owner declared *and* has
      // evidence for is the strongest kind there is; it must not be cut because a topic
      // tag on three repositories happened to outweigh it.
      declared: Boolean(existing),
    })
  }

  // Declared skills with no imported evidence still belong in the portfolio — the user
  // asserted them, and the absence of evidence is shown by the absence of evidence lines.
  /** @type {SkillItem[]} */
  const unevidenced = []
  for (const skill of declared.values()) {
    unevidenced.push({
      ...skill,
      category: skill.category ?? categorizeSkill(skill.name),
      weight: 0,
    })
  }

  const byWeight = (/** @type {SkillItem} */ a, /** @type {SkillItem} */ b) =>
    (b.weight ?? 0) - (a.weight ?? 0) || a.name.localeCompare(b.name)

  out.sort(byWeight)
  unevidenced.sort((a, b) => a.name.localeCompare(b.name))

  // A skill the owner typed out by hand is never dropped to make room for one inferred
  // from a repository topic. Ranking everything together by weight would do exactly that —
  // a declared skill with no evidence weighs zero, and one with weak evidence weighs less
  // than any popular tag — so the cap is applied to *derived* skills only. It exists to
  // stop machine-inferred noise growing without bound, which is not a reason to discard
  // something a person deliberately claimed about themselves.
  const declaredSkills = [
    ...out.filter((skill) => skill.declared),
    ...unevidenced,
  ].map(({ declared: _declared, ...skill }) => skill)

  const derived = out
    .filter((skill) => !skill.declared)
    .map(({ declared: _declared, ...skill }) => skill)

  const derivedBudget = Math.max(0, maxSkills - declaredSkills.length)
  return [...derived.slice(0, derivedBudget), ...declaredSkills]
}

/**
 * Turn a plural signal label into its singular form for counts of one.
 * @param {string} label
 * @returns {string}
 */
function singular(label) {
  if (label.endsWith('ies')) return `${label.slice(0, -3)}y`
  if (label.endsWith('s')) return label.slice(0, -1)
  return label
}

/**
 * Group skills by category for rendering, dropping empty groups.
 *
 * @param {SkillItem[]} skills
 * @returns {{category: string, items: SkillItem[]}[]}
 */
export function groupSkills(skills) {
  /** @type {Map<string, SkillItem[]>} */
  const groups = new Map()
  for (const skill of skills ?? []) {
    const category = skill.category || 'Other'
    if (!groups.has(category)) groups.set(category, [])
    const bucket = /** @type {SkillItem[]} */ (groups.get(category))
    bucket.push(skill)
  }

  // Present known categories in a deliberate order; anything user-defined follows.
  const preferred = ['Languages', 'AI & ML', 'Frontend', 'Backend', 'Data', 'Infrastructure']
  const ordered = [
    ...preferred.filter((c) => groups.has(c)),
    ...[...groups.keys()].filter((c) => !preferred.includes(c) && c !== 'Other').sort(),
    ...(groups.has('Other') ? ['Other'] : []),
  ]

  return ordered.map((category) => ({
    category,
    items: /** @type {SkillItem[]} */ (groups.get(category)),
  }))
}
