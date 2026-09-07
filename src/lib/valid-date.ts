/**
 * Whether a date string is one `Date` can actually parse.
 *
 * Added by the fork. Upstream every date in the portfolio data is hand-written and therefore
 * always present and always well-formed, so his components parse them unguarded. Ours are
 * imported from connectors and résumés, where a record can legitimately arrive with no date at
 * all — a certification whose issuer never published one, an award listed by year only in a
 * source that dropped the year.
 *
 * The two call sites use this to omit the date row rather than crash on `Invalid time value`.
 * Supplying a placeholder date instead would be worse than omitting it: it would state, in
 * machine-readable `<time datetime>`, a fact nobody imported.
 */
export function isValidDate(value: string | undefined | null): value is string {
  if (!value) return false
  return !Number.isNaN(new Date(value).getTime())
}
