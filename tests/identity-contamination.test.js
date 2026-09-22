import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The fork must not publish the original author's identity as the owner's.
 *
 * This repository began as a fork of ncdai/chanhdai.com, and that inheritance is a real hazard:
 * the components are reusable, the *person* in them is not. A template that ships someone's
 * biography, testimonials or social handles will publish them the first time a new owner
 * enables the wrong section — and it will look deliberate, because it renders perfectly.
 *
 * So this draws the line the licence and TRADEMARK.md already draw, and asserts it mechanically:
 *
 *   allowed    — upstream licence, attribution, and comments explaining what was replaced
 *   forbidden  — the original author's name, handles, personal URLs, biography, testimonials,
 *                and any referral or tracking identifier tied to his deployment
 *
 * The distinction is by *location and purpose*, not by the word itself. `LICENSE` naming his
 * repository is the licence working correctly; a data file naming his employer is contamination.
 *
 * Deliberately out of scope: `src/registry/**`. Those are his component demos — sample content
 * for a component catalogue, tracked separately and left intact on the owner's instruction. The
 * portfolio's own identity is what this guards.
 */

const ROOT = process.cwd()

/**
 * Identifiers that must never appear as this portfolio's own content.
 *
 * Handles and personal hostnames rather than the word "chanhdai" alone: the repository name is
 * legitimately cited by the licence, so banning the bare word would forbid correct attribution
 * and teach the next person to delete the licence to make a test pass.
 */
const FORBIDDEN = [
  { pattern: /@iamncdai/i, what: 'the original author’s social handle' },
  { pattern: /\bQuaric\b/, what: 'the original author’s company' },
  { pattern: /react-wheel-picker\.chanhdai\.com/i, what: 'a personal product URL' },
  { pattern: /unavatar\.io\/x\//i, what: 'a third party’s avatar, proxied from their X account' },
  { pattern: /\bChánh Đại\b/i, what: 'the original author’s name' },
]

/** Where the portfolio's own identity lives. Registry demos are excluded deliberately. */
const PORTFOLIO_SOURCE = [
  'src/features/portfolio/data',
  'src/features/portfolio/components',
  'src/components/site-footer.tsx',
  'src/config',
  'portfolio.config.js',
]

/** Paths whose whole purpose is to attribute upstream correctly. */
const ATTRIBUTION = ['LICENSE', 'TRADEMARK.md', 'README.md', 'NOTICE']

/* -------------------------------------------------------------------------- */

/** Every file under a path, or the file itself. */
function filesUnder(target) {
  const full = path.join(ROOT, target)
  if (!fs.existsSync(full)) return []
  if (fs.statSync(full).isFile()) return [full]
  return fs.readdirSync(full, { recursive: true })
    .map((name) => path.join(full, String(name)))
    .filter((file) => fs.existsSync(file) && fs.statSync(file).isFile())
    .filter((file) => /\.(ts|tsx|js|jsx|mjs|json)$/.test(file))
}

/**
 * Comment lines are exempt.
 *
 * Several modules explain, in a docblock, that they replaced the upstream author's literal data
 * with an engine-derived export. That sentence is the opposite of contamination — it is the
 * record of the fix — and a guard that failed on it would push the next person to delete the
 * explanation rather than the data.
 */
function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
}

describe('the portfolio does not carry the original author’s identity', () => {
  const files = PORTFOLIO_SOURCE.flatMap(filesUnder)

  test('there is something to check', () => {
    // A guard that silently scans nothing passes forever.
    assert.ok(files.length > 10, `expected the portfolio source, found ${files.length} files`)
  })

  for (const { pattern, what } of FORBIDDEN) {
    test(`no portfolio source contains ${what}`, () => {
      const offenders = files.filter((file) => pattern.test(withoutComments(fs.readFileSync(file, 'utf8'))))
      assert.deepEqual(
        offenders.map((file) => path.relative(ROOT, file)),
        [],
        `${what} appears in the portfolio's own source`,
      )
    })
  }

  test('the timeline is derived, not the original author’s biography', () => {
    // The specific regression: 130 lines of one person's life — birth year, schools, awards,
    // the company he founded — sitting in the portfolio's data directory.
    const timeline = fs.readFileSync(path.join(ROOT, 'src/features/portfolio/data/timeline.ts'), 'utf8')
    assert.match(timeline, /export \{[^}]*TIMELINE_MILESTONES[^}]*\} from '\.\/adapter'/, 'the timeline must come from the engine')
    const body = withoutComments(timeline)
    assert.doesNotMatch(body, /Can Tho|Thuan Hung|Born in/i, 'a hand-written biography is back')
    assert.doesNotMatch(body, /TIMELINE_MILESTONES\s*(:|=)\s*\[/, 'the milestones are hard-coded again')
  })

  test('no testimonial data file has returned', () => {
    // Removed rather than refactored: the engine has no testimonials collection, and the file
    // held real people's names, avatars and quoted words about someone else.
    assert.equal(
      fs.existsSync(path.join(ROOT, 'src/features/portfolio/data/testimonials.tsx')),
      false,
      'the upstream testimonials are back',
    )
  })

  test('identity and social links are engine-derived, not literals', () => {
    for (const name of ['user.ts', 'social-links.ts', 'experiences.tsx', 'projects.tsx']) {
      const source = fs.readFileSync(path.join(ROOT, 'src/features/portfolio/data', name), 'utf8')
      assert.match(source, /from '\.\/adapter'/, `${name} should re-export from the adapter`)
    }
  })
})

describe('upstream attribution is preserved', () => {
  // The other half of the rule, and the one a careless sanitisation breaks. Removing the licence
  // would be a worse outcome than the contamination it was trying to fix.
  test('the licence still names the upstream project', () => {
    const licence = fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8')
    assert.match(licence, /chanhdai|ncdai/i, 'upstream attribution was removed from LICENSE')
  })

  test('TRADEMARK.md is still present', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'TRADEMARK.md')))
  })

  test('the attribution files are exempt from the identity rules', () => {
    // Stated as a test so the exemption is deliberate and visible, rather than an accident of
    // which paths the scanner happened to walk.
    for (const name of ATTRIBUTION) {
      const file = path.join(ROOT, name)
      if (!fs.existsSync(file)) continue
      assert.ok(!PORTFOLIO_SOURCE.some((scanned) => name.startsWith(scanned)), `${name} must not be scanned`)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* The built output                                                           */
/* -------------------------------------------------------------------------- */

describe('the built portfolio pages carry no upstream identity', () => {
  const out = path.join(ROOT, 'out')
  const built = fs.existsSync(out)

  /** The owner's own pages — not the component registry, which is demo content. */
  const PAGES = ['index.html', 'blocks/index.html']

  for (const page of PAGES) {
    test(`${page} is free of the original author’s identity`, (t) => {
      const file = path.join(out, page)
      if (!built || !fs.existsSync(file)) {
        t.skip('no static export present — run `pnpm build` first')
        return
      }
      const html = fs.readFileSync(file, 'utf8')
      for (const { pattern, what } of FORBIDDEN) {
        assert.doesNotMatch(html, pattern, `${page} publishes ${what}`)
      }
      // And the personal deployment itself, which would mean a link pointing at his site.
      assert.doesNotMatch(html, /https?:\/\/(www\.)?chanhdai\.com/i, `${page} links to the original author's site`)
    })
  }

  test('no referral or upstream tracking identifier ships', (t) => {
    const file = path.join(out, 'index.html')
    if (!built || !fs.existsSync(file)) {
      t.skip('no static export present')
      return
    }
    const html = fs.readFileSync(file, 'utf8')
    // `ref=` carrying his domain is the referral case; the analytics ids are his deployment's.
    assert.doesNotMatch(html, /[?&]ref=[^"'&]*chanhdai/i)
    assert.doesNotMatch(html, /GTM-[A-Z0-9]{4,}/, 'a Google Tag Manager container id shipped')
    assert.doesNotMatch(html, /openpanel|clientId["']?\s*:\s*["'][a-f0-9-]{20,}/i, 'an analytics client id shipped')
  })
})
