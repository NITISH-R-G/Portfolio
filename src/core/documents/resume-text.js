/**
 * Reading a résumé out of plain text.
 *
 * Shared by every text-bearing format — Markdown, plain text, DOCX and PDF all reduce to
 * lines with optional headings — so extraction quality improves in one place rather than
 * four, and a better extractor later replaces one module.
 *
 * The approach is deliberately conservative. A résumé has no schema, so every rule here is
 * a guess; the module's job is to make *fewer, better-signposted* guesses rather than to
 * squeeze out every possible field. Anything it is unsure of is left out, because a missing
 * entry is a small annoyance and a wrong one is a lie on someone's portfolio.
 *
 * Every value it does produce records where it came from and how confidently it was
 * recognised, so a person can check it and the resolver can weigh it.
 *
 * @module core/documents/resume-text
 */

import { EXTRACTION_CONFIDENCE } from './types.js'

/**
 * Heading synonyms, lower-cased. A résumé written in any of the usual dialects should land
 * in the same buckets.
 */
const SECTIONS = [
  { key: 'summary', match: /^(summary|profile|about|objective|professional summary)\b/ },
  { key: 'experience', match: /^(experience|employment|work(\s+experience|\s+history)?|professional experience|positions?)\b/ },
  { key: 'education', match: /^(education|academic(\s+background)?|qualifications)\b/ },
  { key: 'projects', match: /^(projects?|selected projects?|personal projects?|portfolio)\b/ },
  { key: 'skills', match: /^(skills?|technical skills?|technologies|competenc(y|ies)|tools)\b/ },
  { key: 'achievements', match: /^(achievements?|awards?|honou?rs?|accomplishments?)\b/ },
  { key: 'certifications', match: /^(certifications?|certificates?|licen[cs]es?)\b/ },
  { key: 'publications', match: /^(publications?|papers?|research)\b/ },
  { key: 'languages', match: /^(languages?)\b/ },
  { key: 'talks', match: /^(talks?|speaking|presentations?)\b/ },
  { key: 'contact', match: /^(contact|details|personal details)\b/ },
]

/** Lines that are decoration rather than content. */
const NOISE = /^[\s|_=*~•·—–-]*$/

/**
 * @typedef {object} Line
 * @property {string} text
 * @property {number} index     0-based position in the document.
 * @property {number} [page]    1-indexed, when the format has pages.
 * @property {boolean} heading  Whether the format marked this as a heading.
 * @property {number} [level]   Heading level, when known.
 * @property {boolean} [boundary]
 *   Set only by formats that genuinely know where one entry ends and the next begins — an
 *   HTML page whose author wrote each role as its own `<li>`, for example. PDF and DOCX
 *   extraction cannot know this and never sets it, so they keep relying on the date-line
 *   heuristic below.
 */

/**
 * Parse résumé-shaped text into a profile plus per-value evidence.
 *
 * @param {Line[]} lines
 * @param {{documentId: string, filename?: string}} context
 * @returns {{profile: object, evidence: Record<string, import('./types.js').DocumentSpan>, warnings: string[]}}
 */
export function parseResumeLines(lines, context) {
  /** @type {string[]} */
  const warnings = []
  /** @type {Record<string, import('./types.js').DocumentSpan>} */
  const evidence = {}

  const clean = lines
    .map((line) => ({ ...line, text: line.text.replace(/\s+/g, ' ').trim() }))
    .filter((line) => line.text && !NOISE.test(line.text))

  if (!clean.length) return { profile: {}, evidence, warnings: ['The document contained no readable text.'] }

  /* Sections ---------------------------------------------------------------- */

  /** @type {{key: string, title: string, lines: Line[]}[]} */
  const sections = []
  /** @type {Line[]} */
  const preamble = []

  let current = null
  for (const line of clean) {
    const key = sectionKeyOf(line)
    if (key) {
      current = { key, title: line.text.replace(/^#+\s*/, '').replace(/:$/, ''), lines: [] }
      sections.push(current)
      continue
    }
    // A heading we do not recognise still *ends* the section above it. Letting its contents
    // fall through to the previous section is how a page's "Links" list becomes three
    // universities — a confidently wrong record, which is worse than the omission.
    //
    // Before any section has started, though, an unrecognised heading is the document's own
    // title — `# Ada Lovelace` at the top of a résumé — and that is the name.
    if (line.heading) {
      if (current) current = null
      else preamble.push(line)
      continue
    }
    if (current) current.lines.push(line)
    else preamble.push(line)
  }

  if (!sections.length) {
    warnings.push(
      'No recognisable section headings were found, so only the name and contact details '
      + 'were read. Adding headings such as "Experience" and "Education" would let much more '
      + 'be extracted.',
    )
  }

  /* Identity ---------------------------------------------------------------- */

  const identity = {}
  const head = preamble.slice(0, 6)

  // The name is conventionally the first substantial line, and is the one field a résumé
  // reliably puts in a predictable place.
  const nameLine = head.find((line) => looksLikeName(line.text))
  if (nameLine) {
    identity.name = nameLine.text.replace(/^#+\s*/, '')
    record(evidence, 'identity', 'name', span(nameLine, context, 'strong'))
  }

  const contactText = [...head, ...(sections.find((s) => s.key === 'contact')?.lines ?? [])]
    .map((l) => l.text).join(' ')

  const email = /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(contactText)?.[0]
  if (email) {
    identity.contact = { ...identity.contact, email }
    record(evidence, 'identity', 'contact.email', { ...span(head[0], context, 'strong'), text: email })
  }

  const website = /https?:\/\/[^\s,)]+/.exec(contactText)?.[0]
  if (website && !/linkedin|github|twitter|x\.com/i.test(website)) {
    identity.contact = { ...identity.contact, website }
  }

  // A headline is the line after the name, when it is short and not contact details.
  if (nameLine) {
    const after = head.find((line) => line.index > nameLine.index)
    if (after && after.text.length <= 80 && !/[@]|https?:/.test(after.text)) {
      identity.headline = after.text
      record(evidence, 'identity', 'headline', span(after, context, 'moderate'))
    }
  }

  const socials = {}
  for (const [network, pattern] of Object.entries({
    linkedin: /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+/i,
    github: /(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+/i,
  })) {
    const match = pattern.exec(contactText)
    if (match) socials[network] = match[0].startsWith('http') ? match[0] : `https://${match[0]}`
  }

  /* Summary ----------------------------------------------------------------- */

  const summarySection = sections.find((s) => s.key === 'summary')
  if (summarySection?.lines.length) {
    identity.summary = summarySection.lines.map((l) => l.text).join(' ')
    record(evidence, 'identity', 'summary', span(summarySection.lines[0], context, 'strong', summarySection.title))
  }

  /* Collections ------------------------------------------------------------- */

  const profile = { identity, socials }

  const experience = sections.find((s) => s.key === 'experience')
  if (experience) profile.experience = parseEntries(experience, context, evidence, 'experience')

  const education = sections.find((s) => s.key === 'education')
  if (education) profile.education = parseEntries(education, context, evidence, 'education')

  const projects = sections.find((s) => s.key === 'projects')
  if (projects) profile.projects = parseProjects(projects, context, evidence)

  const skills = sections.find((s) => s.key === 'skills')
  if (skills) profile.skills = parseSkills(skills, context, evidence)

  for (const [key, collection] of [['achievements', 'achievements'], ['certifications', 'certifications'], ['publications', 'publications'], ['talks', 'talks']]) {
    const section = sections.find((s) => s.key === key)
    if (!section) continue
    profile[collection] = parseTitled(section, context, evidence, collection)
  }

  const languages = sections.find((s) => s.key === 'languages')
  if (languages) {
    profile.languages = bulletsOf(languages.lines)
      .map((line) => {
        const [name, label] = line.text.split(/\s*[—–:-]\s*/)
        return name ? { name: name.trim(), ...(label ? { label: label.trim() } : {}) } : null
      })
      .filter(Boolean)
  }

  return { profile, evidence, warnings }
}

/* -------------------------------------------------------------------------- */

/**
 * A dated entry: a role or a degree.
 *
 * The pattern that actually identifies one is a line carrying a date range. Everything
 * else on a résumé is prose, so anchoring on dates finds entry boundaries far more
 * reliably than trying to recognise company names.
 */
function parseEntries(section, context, evidence, collection) {
  const entries = []
  const blocks = splitIntoBlocks(section.lines)

  for (const block of blocks) {
    const dateLine = block.find((line) => DATE_RANGE.test(line.text))
    const titleLine = block[0]
    if (!titleLine) continue

    const dates = dateLine ? parseDateRange(dateLine.text) : undefined
    // Strip the date from the title line so "Engineer, Acme — 2022–2024" does not leave the
    // company as "Acme —". The separator that joined them has to go with it, or it becomes
    // part of the name and follows the record everywhere, including into the slug.
    const titleText = titleLine.text
      .replace(DATE_RANGE, '')
      .replace(/[|·,;:\-—–\s]+$/, '')
      .trim()
    const parts = titleText.split(/\s+(?:at|@|[—–|·])\s+|,\s+/).map((p) => p.trim()).filter(Boolean)
    if (!parts.length) continue

    const bullets = block.slice(1)
      .filter((line) => /^[-*•·]/.test(line.text))
      .map((line) => line.text.replace(/^[-*•·]\s*/, ''))

    const description = block.slice(1)
      .filter((line) => !/^[-*•·]/.test(line.text) && !DATE_RANGE.test(line.text))
      .map((line) => line.text)
      .join(' ') || undefined

    const entry = collection === 'experience'
      ? {
          // "Role at Company" is the dominant convention, but "Company — Role" also occurs.
          // Neither can be told apart reliably, so the commonest reading is taken and the
          // confidence reflects that it is a reading rather than a certainty.
          role: parts[0],
          company: parts[1] ?? parts[0],
          ...(dates ? { dates } : {}),
          ...(description ? { description } : {}),
          ...(bullets.length ? { highlights: bullets } : {}),
        }
      : educationEntry(parts, dates)

    // The id is assigned here rather than derived again later, so the record, its evidence
    // key and the resolver's subject key are guaranteed to agree. Deriving it twice is how
    // evidence silently fails to attach: the two derivations drift, and the span is looked
    // up under a key nothing wrote.
    entry.id = collection === 'experience'
      ? slug(`${entry.company}-${entry.role ?? ''}`)
      : slug(`${entry.institution}-${entry.degree ?? ''}`)

    entries.push(entry)

    const confidence = dateLine ? 'strong' : 'moderate'
    const descriptionLine = block.slice(1).find((line) => !/^[-*•·]/.test(line.text) && !DATE_RANGE.test(line.text))

    for (const attribute of Object.keys(entry)) {
      if (attribute === 'id') continue
      // Each attribute points at the line it actually came from. Stamping the title line on
      // everything makes the evidence for a description quote text that does not contain it
      // — which reads as provenance while providing none, and is worse than admitting there
      // is no span, because it cannot be told apart from evidence that does hold up.
      const from = attribute === 'description' ? descriptionLine ?? titleLine
        : attribute === 'dates' ? dateLine ?? titleLine
        : titleLine
      record(evidence, `${collection}/${entry.id}`, attribute, span(from, context, confidence, section.title))
    }
  }

  return entries
}

function parseProjects(section, context, evidence) {
  const projects = []
  for (const line of bulletsOf(section.lines)) {
    const linked = /\[([^\]]+)\]\(([^)]+)\)\s*[—–:-]?\s*(.*)/.exec(line.text)
    const marked = !linked && line.head && line.rest?.length

    const name = linked
      ? linked[1]
      : (marked ? line.head : line.text.split(/\s+[—–:-]\s+/)[0]).replace(/\*\*/g, '').replace(/^[—–:-]\s*/, '').trim()
    if (!name) continue

    const description = linked
      ? linked[3]
      : (marked ? line.rest.join(' ') : line.text.split(/\s+[—–:-]\s+/).slice(1).join(' — '))
        .replace(/^[—–:-]\s*/, '')
    const project = {
      id: slug(name),
      name,
      ...(description ? { description } : {}),
      ...(linked ? { liveUrl: linked[2] } : {}),
    }
    projects.push(project)

    for (const attribute of Object.keys(project)) {
      if (attribute === 'id') continue
      record(evidence, `projects/${project.id}`, attribute, span(line, context, 'moderate', section.title))
    }
  }
  return projects
}

function parseSkills(section, context, evidence) {
  const skills = []
  for (const line of section.lines) {
    // "Languages: Python, Go" — the label before the colon is a category, which is worth
    // keeping because it groups the skills correctly for free.
    const labelled = /^[-*•·]?\s*\*{0,2}([\w /&+#.-]{2,30})\*{0,2}\s*:\s*(.+)$/.exec(line.text)
    const category = labelled ? labelled[1].trim() : undefined
    const body = labelled ? labelled[2] : line.text.replace(/^[-*•·]\s*/, '')

    for (const raw of body.split(/[,;·|]/)) {
      const name = raw.replace(/\*\*/g, '').trim()
      if (!name || name.length > 40) continue
      skills.push({ name, ...(category ? { category } : {}) })
      // Skills have no `id` in the schema, so the resolver keys them by `slugify(name)`.
      // This must match that, or the evidence lands under a key nothing reads.
      record(evidence, `skills/${slug(name)}`, 'name', span(line, context, 'moderate', section.title))
    }
  }
  return skills
}

function parseTitled(section, context, evidence, collection) {
  const field = collection === 'certifications' ? 'name' : 'title'
  return bulletsOf(section.lines).map((line) => {
    // A marked first line is the title outright. Only when there is none does the title have
    // to be recovered from punctuation — which is what turns a whole citation, authors and
    // journal included, into the "title" of a paper.
    const [title, ...rest] = line.head && line.rest?.length
      ? [line.head.replace(/\*\*/g, ''), ...line.rest]
      : line.text.replace(/\*\*/g, '').split(/\s+[—–]\s+|\s+\|\s+/)
    const entry = { id: slug(title), [field]: title.trim() }

    const remainder = rest.join(' — ')
    if (remainder) {
      const year = /\b(19|20)\d{2}\b/.exec(remainder)?.[0]
      const organization = remainder.replace(/\(?\b(19|20)\d{2}\b\)?/, '').replace(/[(),\s]+$/, '').trim()
      if (organization) entry[collection === 'certifications' ? 'issuer' : 'organization'] = organization
      if (year) entry.date = year
    }

    for (const attribute of Object.keys(entry)) {
      if (attribute === 'id') continue
      record(evidence, `${collection}/${entry.id}`, attribute, span(line, context, 'moderate', section.title))
    }
    return entry
  })
}

/* -------------------------------------------------------------------------- */

const DATE_RANGE = /\b((?:19|20)\d{2}|[A-Z][a-z]{2,8}\.?\s+(?:19|20)\d{2}|\d{1,2}\/(?:19|20)\d{2})\s*(?:[—–\-−]{1,2}|\bto\b)\s*((?:19|20)\d{2}|[A-Z][a-z]{2,8}\.?\s+(?:19|20)\d{2}|\d{1,2}\/(?:19|20)\d{2}|present|current|now)\b/i

/**
 * Qualification names, for telling "PhD Structural Biology, University of Cambridge" from
 * "University of Cambridge, PhD Structural Biology".
 *
 * Both orders are written constantly and neither is more correct, so the only honest way to
 * tell them apart is to recognise one of the two parts. A degree name is the recognisable
 * one — institutions are unbounded, qualifications are not.
 */
const DEGREE = /^(?:b\.?\s?(?:tech|sc|a|s|e|eng|com|ed)|m\.?\s?(?:tech|sc|a|s|eng|ba|phil|ed)|mba|ph\.?\s?d|d\.?\s?phil|doctorate|bachelors?|masters?|diploma|associates?|certificate|postgraduate|foundation)\b/i

/**
 * Build an education entry, putting each part where it belongs rather than where it appeared.
 *
 * @param {string[]} parts
 * @param {import('../schema/types.js').DateRange|undefined} dates
 */
function educationEntry(parts, dates) {
  let [first, second, third] = parts

  // Only when it is unambiguous: if the first part names a qualification and the second does
  // not, the writer used "Degree, Institution". If both or neither match, the conventional
  // reading stands rather than a coin flip.
  if (second && DEGREE.test(first) && !DEGREE.test(second)) {
    [first, second] = [second, first]
  }

  return {
    institution: first,
    ...(second ? { degree: second } : {}),
    ...(third ? { field: third } : {}),
    ...(dates ? { dates } : {}),
  }
}

/** @param {string} text */
function parseDateRange(text) {
  const match = DATE_RANGE.exec(text)
  if (!match) return undefined

  // "Present" has to survive as a *flag*, not as an absent end date. Returning `end:
  // undefined` alone is indistinguishable from a range whose end could not be read, and the
  // two mean opposite things: one is a job someone still has, the other is a job whose end
  // we failed to parse. Collapsing them is how "2022 – Present" ends up rendering as a role
  // that simply stops.
  const current = /present|current|now|ongoing|today/i.test(match[2])
  return { start: match[1], end: current ? undefined : match[2], ...(current ? { current: true } : {}) }
}

/**
 * Group a section's lines into per-entry blocks.
 *
 * A blank line would be the obvious separator, but PDF and DOCX extraction rarely preserves
 * them. A new entry is therefore recognised by a line carrying a date range, which is how a
 * human reads a résumé too.
 */
function splitIntoBlocks(lines) {
  const blocks = []
  let block = []

  for (const line of lines) {
    const startsEntry = line.boundary || DATE_RANGE.test(line.text) || line.heading
    if (startsEntry && block.length) {
      // A date on its own line belongs to the entry above it, not the one below — unless the
      // format told us outright that a new entry starts here, in which case that knowledge
      // beats the heuristic guessing at it.
      const isBareDate = !line.boundary
        && DATE_RANGE.test(line.text)
        && line.text.replace(DATE_RANGE, '').trim().length < 3
      if (isBareDate) { block.push(line); continue }
      blocks.push(block)
      block = []
    }
    block.push(line)
  }
  if (block.length) blocks.push(block)
  return blocks
}

/**
 * Bullet lines, or every line when the section uses none.
 *
 * When the format marked entry boundaries — an HTML page with one `<li>` per project — those
 * win, and each entry's continuation lines are folded back into it. Without this, a project
 * written as `<li><strong>walrus</strong> — a log library</li>` is read as two projects, one
 * of them named "— a log library".
 */
function bulletsOf(lines) {
  if (lines.some((line) => line.boundary)) {
    /** @type {Line[][]} */
    const groups = []
    for (const line of lines) {
      if (line.boundary || !groups.length) groups.push([line])
      else groups[groups.length - 1].push(line)
    }
    return groups.map((group) => {
      const parts = group.map((line) => line.text.replace(/^[-*•·]\s*/, ''))
      return {
        ...group[0],
        text: parts.join(' '),
        // The entry's own first line, kept apart from the rest. Where a format marked the
        // boundary it usually marked the title too — an `<em>` holding a paper's title, a
        // `<strong>` holding a project's name — and a reader that only ever sees the joined
        // string has to find that title again by guessing at punctuation.
        head: parts[0],
        rest: parts.slice(1),
      }
    })
  }

  const bullets = lines.filter((line) => /^[-*•·]/.test(line.text))
  const source = bullets.length ? bullets : lines
  return source.map((line) => ({ ...line, text: line.text.replace(/^[-*•·]\s*/, '') }))
}

/** @param {Line} line */
function sectionKeyOf(line) {
  const text = line.text.replace(/^#+\s*/, '').replace(/[:*_]/g, '').trim().toLowerCase()
  if (!text || text.length > 40) return undefined

  // A heading is a heading if the format said so, or if it is short, unpunctuated and
  // matches a known section name — which is how a plain-text résumé signals one.
  const looksLikeHeading = line.heading || (text.split(/\s+/).length <= 4 && !/[.,;]/.test(text))
  if (!looksLikeHeading) return undefined

  return SECTIONS.find((section) => section.match.test(text))?.key
}

/** @param {string} text */
function looksLikeName(text) {
  const stripped = text.replace(/^#+\s*/, '').trim()
  if (stripped.length < 3 || stripped.length > 60) return false
  if (/[@:|]|https?:/.test(stripped)) return false
  const words = stripped.split(/\s+/)
  if (words.length < 1 || words.length > 5) return false
  // Capitalised words, allowing initials and particles like "van".
  return words.every((word) => /^[A-Z][\w'’.-]*$/.test(word) || /^(van|de|der|den|del|di|da|bin|al)$/i.test(word))
}

/**
 * @param {Line} line
 * @param {{documentId: string, filename?: string}} context
 * @param {keyof typeof EXTRACTION_CONFIDENCE} confidence
 * @param {string} [section]
 */
function span(line, context, confidence, section) {
  return {
    ...(line?.page ? { page: line.page } : {}),
    ...(line ? { line: line.index + 1 } : {}),
    ...(section ? { section } : {}),
    ...(line?.text ? { text: line.text } : {}),
    confidence: EXTRACTION_CONFIDENCE[confidence],
  }
}

/** @param {Record<string, any>} evidence */
function record(evidence, subject, attribute, value) {
  evidence[`${subject}|${attribute}`] = value
}

const slug = (text) =>
  String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item'

export { DATE_RANGE, looksLikeName }
