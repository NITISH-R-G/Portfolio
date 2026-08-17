/**
 * Deterministic colour generation for records that have no image and no user-assigned
 * colour — most imported projects.
 *
 * The original implementation hardcoded a hex colour per project id, which only worked for
 * the six projects that existed when it was written (see docs/architecture.md, finding F6).
 * This derives a stable colour from the record's own name, so a freshly imported project
 * with no manual styling still gets a distinct, consistent tile colour on every render and
 * every rebuild — no per-project configuration required.
 *
 * @module lib/deterministicColor
 */

/**
 * A small, deliberately curated hue set rather than the full 360° wheel, so generated
 * colours stay legible against dark and light themes alike and never collide with semantic
 * colours (red for danger, green for success).
 */
const HUES = [262, 199, 174, 291, 24, 142, 322, 43, 210, 356]

/**
 * FNV-1a string hash. Fast, dependency-free, and stable across platforms — the same input
 * always produces the same output, which is the entire point.
 *
 * @param {string} input
 * @returns {number}
 */
export function hashString(input) {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * Pick a stable accent colour for a piece of content, e.g. a project name.
 *
 * @param {string} seed
 * @returns {string}  An `hsl()` colour string.
 */
export function deterministicColor(seed) {
  const hash = hashString(String(seed || 'portfolio'))
  const hue = HUES[hash % HUES.length]
  return `hsl(${hue}, 62%, 58%)`
}

/**
 * A two-stop gradient built from the same seed, for card backgrounds that need more depth
 * than a flat fill.
 *
 * @param {string} seed
 * @returns {string} A `linear-gradient()` CSS value.
 */
export function deterministicGradient(seed) {
  const hash = hashString(String(seed || 'portfolio'))
  const hue = HUES[hash % HUES.length]
  const hue2 = HUES[(hash >> 8) % HUES.length]
  return `linear-gradient(135deg, hsl(${hue}, 60%, 50%) 0%, hsl(${hue2}, 55%, 38%) 100%)`
}
