/**
 * Cross-platform statistics.
 *
 * Every entry here is computed from records that were actually imported. Nothing is typed
 * in, estimated, or rounded up. Each stat carries a `kind`:
 *
 *   - `fetched` — a number a platform reported about the user directly (followers, rating)
 *   - `derived` — a number this project computed by counting records (total stars)
 *
 * The distinction is surfaced in the UI, because "Codeforces says my rating is 1620" and
 * "we counted 24 repositories" are different kinds of claim and should not look identical.
 *
 * @module core/generate/stats
 */

/** @typedef {import('../schema/types.js').Profile} Profile */
/** @typedef {import('../schema/types.js').StatEntry} StatEntry */

/**
 * Format a count for display. Large numbers get a compact suffix; everything under 10,000
 * is shown exactly, because "1,250 problems solved" is more credible than "1.3k".
 *
 * @param {number} value
 * @returns {string}
 */
export function formatCount(value) {
  if (!Number.isFinite(value)) return '0'
  const abs = Math.abs(value)
  // Billions are reachable for real: a widely-depended-on npm package passes a billion
  // monthly downloads, and "6943.7M" is a number nobody can read at a glance.
  if (abs >= 1_000_000_000) return `${trim(value / 1_000_000_000)}B`
  if (abs >= 1_000_000) return `${trim(value / 1_000_000)}M`
  if (abs >= 10_000) return `${trim(value / 1_000)}k`
  return value.toLocaleString('en-US')
}

/** @param {number} n */
function trim(n) {
  const rounded = Math.round(n * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/**
 * Compute the stat entries for a profile.
 *
 * Only stats with a non-zero value are returned — a portfolio should not advertise
 * "0 publications".
 *
 * @param {Profile} profile
 * @returns {StatEntry[]}
 */
export function deriveStats(profile) {
  /** @type {StatEntry[]} */
  const entries = []

  const add = (/** @type {Omit<StatEntry, 'display'> & {display?: string}} */ entry) => {
    if (!Number.isFinite(entry.value) || entry.value <= 0) return
    entries.push({ ...entry, display: entry.display ?? formatCount(entry.value) })
  }

  // A handful of figures cannot be recomputed from the records on the page — GitHub
  // followers, a year's contribution count, Stack Overflow reputation. The connector that
  // fetched them is the only authority, so those entries survive derivation. Anything a
  // connector marked `derived` is dropped and recomputed here, so hiding a record always
  // updates the totals.
  const reported = (profile.stats?.entries ?? [])
    .filter((e) => e.kind === 'fetched' || e.kind === 'stated')

  const projects = profile.projects ?? []
  const connectorsOf = (/** @type {{source?: {connector?: string}}[]} */ records) => {
    const set = new Set()
    for (const r of records) if (r.source?.connector) set.add(r.source.connector)
    return set.size ? [...set] : undefined
  }

  /**
   * Whether a figure taken verbatim from records was genuinely fetched, or typed by the
   * portfolio's owner.
   *
   * Only a connector that really called an API stamps `fetchedAt`, so its presence is the
   * signal. Getting this wrong would print "reported" beside a number no platform ever
   * confirmed — the precise fabrication this project refuses to commit.
   *
   * @param {{source?: {fetchedAt?: string}}[]} records
   * @returns {'fetched'|'stated'}
   */
  const reportedKind = (records) =>
    records.some((r) => r.source?.fetchedAt) ? 'fetched' : 'stated'

  /* Code ------------------------------------------------------------------- */

  const imported = projects.filter((p) => p.source)
  if (imported.length) {
    add({
      id: 'repositories',
      label: 'Public repositories',
      value: imported.length,
      kind: 'derived',
      connectors: connectorsOf(imported),
    })
  }

  const totalStars = sum(projects.map((p) => p.stars ?? 0))
  add({
    id: 'stars',
    label: 'Stars earned',
    value: totalStars,
    kind: 'derived',
    note: 'across all public repositories',
    connectors: connectorsOf(projects),
  })

  const totalForks = sum(projects.map((p) => p.forks ?? 0))
  add({ id: 'forks', label: 'Forks', value: totalForks, kind: 'derived', connectors: connectorsOf(projects) })

  const languages = new Set(
    projects.map((p) => p.primaryLanguage).filter(Boolean),
  )
  add({ id: 'languages-used', label: 'Languages used', value: languages.size, kind: 'derived' })

  /* Packages --------------------------------------------------------------- */

  const packages = profile.packages ?? []
  add({ id: 'packages', label: 'Published packages', value: packages.length, kind: 'derived', connectors: connectorsOf(packages) })

  const downloads = sum(packages.map((p) => p.downloads ?? 0))
  if (downloads > 0) {
    const withDownloads = packages.filter((p) => p.downloads)
    const periods = new Set(withDownloads.map((p) => p.downloadsPeriod ?? 'recent'))
    add({
      id: 'downloads',
      label: 'Package downloads',
      value: downloads,
      // A registry reported these, unless the user typed them — see `reportedKind`.
      kind: reportedKind(withDownloads),
      note: periods.size === 1 ? readablePeriod([...periods][0]) : undefined,
      connectors: connectorsOf(packages),
    })
  }

  /* Competitive programming ------------------------------------------------- */

  const competitive = profile.competitive ?? []
  const problemsSolved = sum(competitive.map((c) => c.problemsSolved ?? 0))
  if (problemsSolved > 0) {
    add({
      id: 'problems-solved',
      label: 'Problems solved',
      value: problemsSolved,
      kind: 'derived',
      note: `across ${competitive.filter((c) => c.problemsSolved).length} platform${competitive.filter((c) => c.problemsSolved).length === 1 ? '' : 's'}`,
      connectors: competitive.map((c) => c.connector).filter(Boolean),
    })
  }

  // A peak rating is one platform's number, not a cross-platform aggregate, so it names its
  // source. Whether it counts as `fetched` or `stated` depends on how it got here: a
  // connector that actually called an API stamps `fetchedAt`, and one that only accepted a
  // typed figure does not. Reading that back is what stops a self-entered rating from being
  // presented as though the platform had confirmed it.
  const best = competitive
    .filter((c) => Number.isFinite(c.maxRating ?? c.rating))
    .sort((a, b) => (b.maxRating ?? b.rating ?? 0) - (a.maxRating ?? a.rating ?? 0))[0]
  if (best) {
    add({
      id: 'peak-rating',
      label: 'Peak rating',
      value: best.maxRating ?? best.rating ?? 0,
      kind: reportedKind([best]),
      note: best.platform,
      connectors: best.connector ? [best.connector] : undefined,
    })
  }

  const contests = sum(competitive.map((c) => c.contests ?? 0))
  add({ id: 'contests', label: 'Contests entered', value: contests, kind: 'derived' })

  /* Research ---------------------------------------------------------------- */

  const publications = profile.publications ?? []
  add({ id: 'publications', label: 'Publications', value: publications.length, kind: 'derived', connectors: connectorsOf(publications) })

  const citations = sum(publications.map((p) => p.citations ?? 0))
  add({ id: 'citations', label: 'Citations', value: citations, kind: 'derived', connectors: connectorsOf(publications) })

  const hIndex = computeHIndex(publications.map((p) => p.citations ?? 0))
  add({ id: 'h-index', label: 'h-index', value: hIndex, kind: 'derived', note: 'from imported publications' })

  /* Writing and media -------------------------------------------------------- */

  const posts = profile.posts ?? []
  add({ id: 'posts', label: 'Articles published', value: posts.length, kind: 'derived', connectors: connectorsOf(posts) })

  const videos = profile.videos ?? []
  add({ id: 'videos', label: 'Videos published', value: videos.length, kind: 'derived', connectors: connectorsOf(videos) })

  const models = profile.models ?? []
  add({ id: 'models', label: 'Models & datasets', value: models.length, kind: 'derived', connectors: connectorsOf(models) })

  /* Career ------------------------------------------------------------------ */

  add({ id: 'certifications', label: 'Certifications', value: (profile.certifications ?? []).length, kind: 'derived' })
  add({ id: 'hackathons', label: 'Hackathons', value: (profile.hackathons ?? []).length, kind: 'derived' })
  add({ id: 'talks', label: 'Talks given', value: (profile.talks ?? []).length, kind: 'derived' })

  /* Connector-reported figures ----------------------------------------------- */

  const derivedIds = new Set(entries.map((e) => e.id))
  for (const entry of reported) {
    if (!entry?.id || derivedIds.has(entry.id)) continue
    derivedIds.add(entry.id)
    add(entry)
  }

  return entries
}

/**
 * The h-index: the largest N such that N publications each have at least N citations.
 *
 * Computed here rather than taken from a platform so it stays consistent with the
 * publications actually shown — a number the reader can verify by counting.
 *
 * @param {number[]} citations
 * @returns {number}
 */
export function computeHIndex(citations) {
  const sorted = citations.filter((c) => Number.isFinite(c) && c > 0).sort((a, b) => b - a)
  let h = 0
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i] >= i + 1) h = i + 1
    else break
  }
  return h
}

/** @param {number[]} values */
function sum(values) {
  return values.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0)
}

/** @param {string} period */
function readablePeriod(period) {
  const map = {
    'last-month': 'in the last month',
    'last-week': 'in the last week',
    'last-day': 'in the last day',
    'total': 'all time',
  }
  return map[/** @type {keyof typeof map} */ (period)] ?? undefined
}

/**
 * Pick the stats worth showing in a headline row.
 *
 * Ordered by how much a reader of a technical portfolio cares, then truncated. Showing
 * fifteen numbers communicates less than showing four.
 *
 * @param {StatEntry[]} entries
 * @param {number} [limit]
 * @returns {StatEntry[]}
 */
export function headlineStats(entries, limit = 4) {
  const priority = [
    'stars', 'problems-solved', 'citations', 'contributions', 'downloads', 'repositories',
    'publications', 'peak-rating', 'reputation', 'packages', 'followers', 'posts', 'models',
    'contests', 'h-index', 'videos', 'forks', 'hackathons', 'certifications',
    'languages-used', 'talks',
  ]
  const rank = new Map(priority.map((id, i) => [id, i]))
  return [...(entries ?? [])]
    .sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999))
    .slice(0, limit)
}
