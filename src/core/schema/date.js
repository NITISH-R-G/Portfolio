/**
 * Date parsing and formatting for `PortfolioDate`.
 *
 * Portfolio dates are legitimately imprecise: a certification might only be known to the
 * year, a job to the month, a commit to the second. Rather than forcing everything to a
 * `Date` (which invents precision) or keeping free text (which cannot be sorted), we store
 * an ISO string plus the precision that is actually meaningful.
 *
 * @module core/schema/date
 */

/** @typedef {import('./types.js').PortfolioDate} PortfolioDate */
/** @typedef {import('./types.js').DateRange} DateRange */

const MONTHS = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** Words that mean "no end date" in a hand-written range. */
const PRESENT = /^(present|current|now|ongoing|today)$/i

const pad = (n) => String(n).padStart(2, '0')

/**
 * Parse a date of unknown precision into a `PortfolioDate`.
 *
 * Accepts ISO strings, `Date` objects, epoch milliseconds, and the informal forms that
 * appear in hand-written portfolios (`"Mar 2024"`, `"2024"`, `"03/2024"`, `"2024-03"`).
 * Returns `undefined` rather than throwing when the input is unparseable, so a malformed
 * value in one record never aborts an import.
 *
 * @param {unknown} input
 * @returns {PortfolioDate|undefined}
 */
export function parseDate(input) {
  if (input == null || input === '') return undefined

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return undefined
    return { iso: input.toISOString().slice(0, 10), precision: 'day' }
  }

  if (typeof input === 'number') {
    const d = new Date(input)
    if (Number.isNaN(d.getTime())) return undefined
    return { iso: d.toISOString().slice(0, 10), precision: 'day' }
  }

  // Already a PortfolioDate — accept it, but re-validate rather than trusting it.
  if (typeof input === 'object') {
    const obj = /** @type {Record<string, unknown>} */ (input)
    if (typeof obj.iso === 'string') {
      const reparsed = parseDate(obj.iso)
      if (!reparsed) return undefined
      const precision = obj.precision === 'year' || obj.precision === 'month' || obj.precision === 'day'
        ? obj.precision
        : reparsed.precision
      return {
        iso: reparsed.iso,
        precision,
        ...(typeof obj.display === 'string' && obj.display ? { display: obj.display } : {}),
      }
    }
    return undefined
  }

  if (typeof input !== 'string') return undefined
  const raw = input.trim()
  if (!raw || PRESENT.test(raw)) return undefined

  // Full ISO timestamp or ISO date: 2024-03-15, 2024-03-15T10:00:00Z
  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/)
  if (m) {
    const iso = `${m[1]}-${m[2]}-${m[3]}`
    return isRealDate(iso) ? { iso, precision: 'day' } : undefined
  }

  // Year-month: 2024-03
  m = raw.match(/^(\d{4})-(\d{1,2})$/)
  if (m) {
    const month = Number(m[2])
    if (month < 1 || month > 12) return undefined
    return { iso: `${m[1]}-${pad(month)}-01`, precision: 'month' }
  }

  // Bare year
  m = raw.match(/^(\d{4})$/)
  if (m) return { iso: `${m[1]}-01-01`, precision: 'year' }

  // "Mar 2024", "March 2024", "Mar. 2024"
  m = raw.match(/^([A-Za-z]{3,9})\.?\s+(\d{4})$/)
  if (m) {
    const month = MONTHS[m[1].toLowerCase()]
    if (month) return { iso: `${m[2]}-${pad(month)}-01`, precision: 'month' }
  }

  // "2024 Mar"
  m = raw.match(/^(\d{4})\s+([A-Za-z]{3,9})\.?$/)
  if (m) {
    const month = MONTHS[m[2].toLowerCase()]
    if (month) return { iso: `${m[1]}-${pad(month)}-01`, precision: 'month' }
  }

  // "03/2024" and "3/2024"
  m = raw.match(/^(\d{1,2})[/-](\d{4})$/)
  if (m) {
    const month = Number(m[1])
    if (month >= 1 && month <= 12) return { iso: `${m[2]}-${pad(month)}-01`, precision: 'month' }
  }

  // "15 March 2024" / "March 15, 2024"
  m = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})$/)
  if (m) {
    const month = MONTHS[m[2].toLowerCase()]
    if (month) {
      const iso = `${m[3]}-${pad(month)}-${pad(Number(m[1]))}`
      if (isRealDate(iso)) return { iso, precision: 'day' }
    }
  }
  m = raw.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/)
  if (m) {
    const month = MONTHS[m[1].toLowerCase()]
    if (month) {
      const iso = `${m[3]}-${pad(month)}-${pad(Number(m[2]))}`
      if (isRealDate(iso)) return { iso, precision: 'day' }
    }
  }

  return undefined
}

/**
 * Guard against calendar-invalid dates like `2023-02-30`, which `new Date()` silently rolls
 * over into March.
 *
 * @param {string} iso  `YYYY-MM-DD`
 * @returns {boolean}
 */
function isRealDate(iso) {
  const [y, mo, d] = iso.split('-').map(Number)
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
}

/**
 * Parse a free-text range such as `"Nov 2025 – Present"` or `"2019-2023"` into a `DateRange`.
 * Handles hyphen, en dash, em dash, "to", and the "present" family of end markers.
 *
 * @param {unknown} input
 * @returns {DateRange|undefined}
 */
export function parseRange(input) {
  if (input == null || input === '') return undefined

  // Already a DateRange.
  if (typeof input === 'object' && !(input instanceof Date)) {
    const obj = /** @type {Record<string, unknown>} */ (input)
    if ('start' in obj || 'end' in obj || 'current' in obj) {
      const start = parseDate(obj.start)
      const end = parseDate(obj.end)
      const current = obj.current === true || (!end && obj.current !== false && 'current' in obj)
      const out = /** @type {DateRange} */ ({})
      if (start) out.start = start
      if (end) out.end = end
      if (current && !end) out.current = true
      return Object.keys(out).length ? out : undefined
    }
  }

  if (typeof input !== 'string') {
    const single = parseDate(input)
    return single ? { start: single } : undefined
  }

  const raw = input.trim()
  if (!raw) return undefined

  const parts = raw.split(/\s*(?:–|—|-{1,2}|\bto\b)\s*/i).filter(Boolean)

  if (parts.length === 1) {
    const only = parseDate(parts[0])
    if (!only) return PRESENT.test(parts[0]) ? { current: true } : undefined
    return { start: only }
  }

  const start = parseDate(parts[0])
  const endRaw = parts[parts.length - 1]
  const end = parseDate(endRaw)
  const current = !end && PRESENT.test(endRaw.trim())

  const out = /** @type {DateRange} */ ({})
  if (start) out.start = start
  if (end) out.end = end
  if (current) out.current = true
  return Object.keys(out).length ? out : undefined
}

/**
 * Render a `PortfolioDate` at its own precision. A year-precision date renders as `"2024"`,
 * never as `"Jan 2024"` — showing precision we do not have would be a fabrication.
 *
 * @param {PortfolioDate|undefined} date
 * @returns {string}
 */
export function formatDate(date) {
  if (!date || typeof date.iso !== 'string') return ''
  if (date.display) return date.display

  const [y, mo, d] = date.iso.split('-')
  if (date.precision === 'year') return y
  if (date.precision === 'month') return `${MONTH_NAMES[Number(mo) - 1]} ${y}`
  return `${MONTH_NAMES[Number(mo) - 1]} ${Number(d)}, ${y}`
}

/**
 * Render a range for display, e.g. `"Nov 2025 – Present"`.
 *
 * @param {DateRange|undefined} range
 * @param {string} [presentLabel]
 * @returns {string}
 */
export function formatRange(range, presentLabel = 'Present') {
  if (!range) return ''
  const start = formatDate(range.start)
  const end = range.current ? presentLabel : formatDate(range.end)
  if (start && end) return `${start} – ${end}`
  return start || end || ''
}

/**
 * Sort key for a date: milliseconds since epoch, or `-Infinity` when absent so undated
 * records sort last under a descending sort.
 *
 * @param {PortfolioDate|undefined} date
 * @returns {number}
 */
export function dateValue(date) {
  if (!date || typeof date.iso !== 'string') return -Infinity
  const t = Date.parse(`${date.iso}T00:00:00Z`)
  return Number.isNaN(t) ? -Infinity : t
}

/**
 * Sort key for a range: prefers the end (or "now" when current), falling back to the start.
 * This orders a CV the way a reader expects — most recently *held* first.
 *
 * @param {DateRange|undefined} range
 * @param {number} [now]  Injectable for deterministic tests.
 * @returns {number}
 */
export function rangeValue(range, now = Date.now()) {
  if (!range) return -Infinity
  if (range.current) return now
  const end = dateValue(range.end)
  if (end !== -Infinity) return end
  return dateValue(range.start)
}

/**
 * Whole years between a date and now, floored. Used for "N years of X" evidence lines.
 *
 * @param {PortfolioDate|undefined} from
 * @param {number} [now]
 * @returns {number}
 */
export function yearsSince(from, now = Date.now()) {
  const t = dateValue(from)
  if (t === -Infinity) return 0
  return Math.max(0, Math.floor((now - t) / (365.25 * 24 * 60 * 60 * 1000)))
}
