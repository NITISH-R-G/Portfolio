/**
 * The user's own summary, verbatim. This is deliberately the one section that carries no
 * derived or imported content — a portfolio needs one place that is unambiguously the
 * subject speaking in their own words.
 *
 * @param {{summary: string}} props
 */
export default function AboutSection({ summary }) {
  if (!summary) return null
  return <p className="about-text">{summary}</p>
}
