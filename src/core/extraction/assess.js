/**
 * Was that extraction good enough, or is it worth paying for a browser?
 *
 * The measurement that makes this necessary: rendering buys +13 points of recall and costs
 * roughly 200× the latency. Applied to every URL, that is a bad trade — most professional
 * pages are static, and the built-in provider already reads them completely in about two
 * milliseconds. Applied only where the cheap path visibly came up short, it is an excellent
 * one. Someone connecting thirty sources should wait milliseconds for the twenty-five that
 * are ordinary HTML, not twelve seconds because five of them were single-page apps.
 *
 * So this module answers one question — *did the cheap attempt work?* — and the answer has to
 * be derivable from the extraction alone, without knowing what the right answer was. That
 * rules out anything resembling "did we get enough fields", because a genuinely sparse profile
 * and a failed extraction produce the same count. What separates them is **evidence of a page
 * we could not read**: markup that promises content the text does not contain.
 *
 * Deliberately conservative in one direction. A false "insufficient" costs 400 ms; a false
 * "sufficient" silently publishes a profile missing half a career. The thresholds are set so
 * that ambiguity escalates.
 *
 * @module core/extraction/assess
 */

/**
 * Below this much body text, a page is not a profile — it is a loading screen. Chosen well
 * under any real page: the thinnest genuine fixture in the corpus carries several hundred
 * characters of prose before its markup is counted.
 */
const SHELL_TEXT = 240

/** A page carrying scripts and almost no text is a shell waiting for its application. */
const SHELL_SCRIPTS = 1

/**
 * @typedef {object} Assessment
 * @property {boolean} sufficient   Whether the cheap extraction can be trusted as complete.
 * @property {string[]} reasons     Why not, in words a person could act on. Empty when fine.
 * @property {Record<string, number|boolean>} signals  What the decision was made from.
 */

/**
 * Judge one extraction.
 *
 * @param {import('./normalize.js').Extraction} extraction
 * @param {import('./signals.js').PageSignals} signals
 * @returns {Assessment}
 */
export function assess(extraction, signals) {
  const profile = extraction?.profile ?? {}
  const reasons = []

  const textLength = (signals?.text ?? '').length
  const scripts = countScripts(signals)
  const structured = (signals?.jsonLd?.length ?? 0) + (signals?.microdata?.length ?? 0)
  const records = countRecords(profile)
  const values = countValues(extraction?.evidence)

  /* The page never arrived --------------------------------------------------- */

  // The clearest signal there is, and the one rendering actually fixes: a document that is
  // all markup and no words, with scripts standing by to supply the rest.
  const shell = textLength < SHELL_TEXT && scripts >= SHELL_SCRIPTS
  if (shell) reasons.push('The page carries scripts and almost no text — its content arrives after rendering.')

  /* Nobody is on it ---------------------------------------------------------- */

  // A profile page whose subject cannot be named has not been read. This is the check that
  // catches hydration: the shell has a title and a nav, and no person.
  if (!profile.identity?.name) {
    reasons.push('No name could be read, so nothing here identifies whose profile it is.')
  }

  /* Structure promised, content missing --------------------------------------- */

  // Headings advertise what a page contains. "Experience" with nothing under it means the
  // section exists and its contents did not arrive — which is exactly the partial-hydration
  // case, and is invisible to any check that only counts what was found.
  for (const empty of emptySections(signals, profile)) {
    reasons.push(`The page has a "${empty.heading}" section, but nothing was read from it.`)
  }

  /* Almost nothing came back --------------------------------------------------- */

  // Deliberately last and deliberately weak. A real profile can legitimately be thin, so a
  // low count alone is not evidence of failure — it only counts when the page also showed no
  // structured data to explain the sparseness.
  if (values <= 2 && !structured && !records) {
    reasons.push('Almost nothing was extracted, and the page published no structured data.')
  }

  return {
    sufficient: reasons.length === 0,
    reasons,
    signals: { textLength, scripts, structured, records, values, shell },
  }
}

/**
 * Sections a page announced but did not fill.
 *
 * @param {import('./signals.js').PageSignals} signals
 * @param {Record<string, any>} profile
 */
function emptySections(signals, profile) {
  /** Headings worth checking, and the collection each should have populated. */
  const WATCHED = [
    { match: /^(experience|employment|work history|positions?)/i, collection: 'experience' },
    { match: /^(education|academic)/i, collection: 'education' },
    { match: /^(projects?|selected work)/i, collection: 'projects' },
    { match: /^(publications?|papers?)/i, collection: 'publications' },
  ]

  const out = []
  for (const section of signals?.outline ?? []) {
    const watched = WATCHED.find((w) => w.match.test(section.heading))
    if (!watched) continue
    // An empty heading with nothing beneath it in the markup either is a page that never
    // rendered, or a section the author left blank. Both are worth a second look, and only
    // one of them costs 400ms to rule out.
    if ((profile[watched.collection]?.length ?? 0) === 0) {
      out.push({ heading: section.heading, collection: watched.collection })
    }
  }
  return out
}

/** @param {import('./signals.js').PageSignals} signals */
function countScripts(signals) {
  // Counted from the signals rather than re-parsing: JSON-LD blocks are scripts too, and a
  // page whose only scripts are structured data is not a shell.
  return Math.max(0, (signals?.scriptCount ?? 0) - (signals?.jsonLd?.length ?? 0))
}

/** @param {Record<string, any>} profile */
function countRecords(profile) {
  return Object.entries(profile)
    .filter(([key]) => key !== 'identity' && key !== 'socials' && key !== 'meta' && key !== 'stats')
    .reduce((n, [, value]) => n + (Array.isArray(value) ? value.length : 0), 0)
}

/** @param {Record<string, unknown>|undefined} evidence */
const countValues = (evidence) => Object.keys(evidence ?? {}).length

export { SHELL_TEXT, SHELL_SCRIPTS }
