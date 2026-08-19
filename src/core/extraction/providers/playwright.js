/**
 * Chromium as a renderer — nothing more.
 *
 * This provider exists to answer one question: **how much does running a page's JavaScript
 * improve the extractor we already have?** So it does not extract anything itself. It
 * navigates, waits for the page to settle, hands the resulting HTML to exactly the same
 * `readSignals` the built-in provider uses, and gets out of the way. If the rendered DOM is
 * better, the score moves; if it is not, the score does not, and either answer is worth the
 * measurement.
 *
 * Two things it deliberately is not:
 *
 * **Not a second extraction engine.** A provider that rendered *and* parsed differently would
 * make the comparison meaningless — a score difference could come from either half, and no
 * amount of staring at the numbers would separate them.
 *
 * **Not a scraper.** No proxies, no stealth patches, no bot-detection evasion, no credential
 * automation. It fetches public pages the way a browser does, honours the site's own timeouts,
 * and gives up when a page does not want to be read. A tool built to get past those defences
 * is a different tool with a different ethics, and this project has no use for it.
 *
 * @module core/extraction/providers/playwright
 */

import { parseHtml } from '../html.js'
import { readSignals } from '../signals.js'

/**
 * Defaults chosen to fail fast and visibly.
 *
 * Every one of these exists because the alternative is a benchmark that hangs. A single page
 * that never fires `load`, or streams an unbounded response, would otherwise take the whole
 * run with it — and the failure would look like a stuck terminal rather than a result.
 */
const DEFAULTS = {
  /** Per-navigation ceiling. */
  navigationTimeoutMs: 15_000,
  /** Whole-page ceiling, including waits and content capture. */
  totalTimeoutMs: 25_000,
  /** Beyond this, the page is refused rather than parsed. */
  maxBytes: 8 * 1024 * 1024,
  maxRedirects: 10,
  /**
   * `load` rather than `networkidle`.
   *
   * Network idle is the intuitive choice and the wrong default: analytics beacons, open
   * WebSockets, polling and long-lived event streams all keep a page permanently "busy", and
   * plenty of applications hold a connection open on purpose. Waiting for idle on those means
   * waiting for the timeout on every single one. `load` plus an optional selector says what is
   * actually being waited *for*, which is both faster and more honest.
   */
  waitUntil: 'load',
  /**
   * A short settle window after load, for frameworks that hydrate in a microtask or a frame.
   * Small and fixed rather than a heuristic: this is the one place where "wait a moment" is
   * genuinely what is meant.
   */
  settleMs: 250,
}

/** @type {import('../types.js').ExtractionProvider & {session: any}} */
export const playwright = {
  id: 'playwright',
  name: 'Playwright',
  summary: 'Renders the page in Chromium, then reads it with the built-in extractor.',

  capabilities: {
    javascript: true,
    javascriptRendering: true,
    dynamicContent: true,
    screenshots: true,
    structuredExtraction: false,
    offline: false,
    authentication: 'none',
    authEnv: [],
    cost: 'free',
    limits: 'Local Chromium. Bounded by CPU and memory rather than by a quota.',
  },

  /** Shared browser. One process for the whole run — see `setup`. */
  session: null,

  /**
   * Start one browser for the whole run.
   *
   * One browser, many contexts. Launching Chromium per page costs roughly a second each and
   * tens of megabytes, which would swamp the very latency measurement this milestone exists
   * to take — the cost of *rendering* would be buried under the cost of *starting*. A context
   * per page still gives each one its own cookie jar, cache and storage, so pages cannot
   * contaminate each other.
   *
   * @param {{headless?: boolean}} [options]
   */
  async setup(options = {}) {
    if (playwright.session) return playwright.session

    const started = performance.now()
    const { chromium } = await import('playwright')

    const launch = {
      headless: options.headless ?? true,
      // No sandbox concessions, no automation-hiding flags. This is a renderer for public
      // pages, and a flag list that grows in that direction is the beginning of a scraper.
      args: ['--disable-dev-shm-usage'],
    }

    // `npx playwright install chromium` fetches two binaries: the full browser, and a lighter
    // `chrome-headless-shell` that the default headless launch prefers. Take the shell when
    // it is there — it starts faster and carries less — and fall back to the full browser's
    // own headless mode when only that was installed. Neither path is a behaviour change for
    // extraction: the same engine renders the page either way.
    const browser = await chromium.launch(launch)
      .catch(() => chromium.launch({ ...launch, channel: 'chromium' }))

    playwright.session = { browser, coldStartMs: performance.now() - started, pages: 0 }
    return playwright.session
  },

  async teardown() {
    const session = playwright.session
    playwright.session = null
    // Never let a teardown failure mask the result of the run that just finished.
    if (session?.browser) await session.browser.close().catch(() => {})
    return session
  },

  /**
   * Render one page.
   *
   * @param {string} url
   * @param {import('../types.js').FetchContext & {waitFor?: WaitFor, screenshotPath?: string}} [ctx]
   * @returns {Promise<import('../types.js').FetchResult>}
   */
  async fetch(url, ctx = {}) {
    const session = await playwright.setup()
    const options = { ...DEFAULTS, ...(ctx.waitFor ?? {}) }
    const started = performance.now()

    let context
    let page
    let redirects = 0

    try {
      context = await session.browser.newContext({
        // A truthful identity. Claiming to be something else is the first step of the
        // scraper this milestone is not building.
        userAgent: undefined,
        viewport: { width: 1280, height: 900 },
        javaScriptEnabled: true,
      })
      page = await context.newPage()
      page.setDefaultNavigationTimeout(options.navigationTimeoutMs ?? DEFAULTS.navigationTimeoutMs)

      /* Navigate ------------------------------------------------------------ */

      const navigationStarted = performance.now()
      const response = await withDeadline(
        page.goto(url, { waitUntil: options.waitUntil ?? DEFAULTS.waitUntil }),
        options.totalTimeoutMs ?? DEFAULTS.totalTimeoutMs,
        'navigation',
      )
      const navigationMs = performance.now() - navigationStarted

      // Redirect chains are counted rather than capped by Chromium, which follows up to 20
      // silently. A profile URL that bounces ten times is usually a login wall or a
      // consent-gate loop, and it is worth reporting as such rather than following.
      for (let hop = response?.request(); hop; hop = hop.redirectedFrom()) redirects += 1
      redirects = Math.max(0, redirects - 1)
      if (redirects > (options.maxRedirects ?? DEFAULTS.maxRedirects)) {
        return failure(url, `The page redirected ${redirects} times, which usually means a login or consent wall.`, { navigationMs })
      }

      /* Wait for readiness -------------------------------------------------- */

      const renderStarted = performance.now()

      if (options.selector) {
        // An explicit selector is the only readiness signal that says what is actually being
        // waited for. Failing to find it is a *result* — the page rendered something other
        // than what was expected — so it is reported rather than thrown.
        const found = await page.waitForSelector(options.selector, {
          timeout: options.timeoutMs ?? DEFAULTS.navigationTimeoutMs,
          state: 'attached',
        }).then(() => true).catch(() => false)

        if (!found) {
          return failure(url, `Rendered, but "${options.selector}" never appeared.`, { navigationMs, renderMs: performance.now() - renderStarted })
        }
      } else if (options.waitUntil === 'networkidle') {
        // Only when asked for by name, and never fatal: a page that holds a socket open is
        // behaving normally, and giving up on idle should cost the wait, not the page.
        await page.waitForLoadState('networkidle', { timeout: options.timeoutMs ?? 5_000 }).catch(() => {})
      }

      await page.waitForTimeout(options.settleMs ?? DEFAULTS.settleMs)
      const renderMs = performance.now() - renderStarted

      /* Capture ------------------------------------------------------------- */

      const captureStarted = performance.now()
      const html = await withDeadline(page.content(), 10_000, 'capture')

      const maxBytes = options.maxBytes ?? DEFAULTS.maxBytes
      if (html.length > maxBytes) {
        return failure(url, `The rendered page is ${(html.length / 1024 / 1024).toFixed(1)} MB, over the ${(maxBytes / 1024 / 1024).toFixed(0)} MB limit.`, { navigationMs, renderMs })
      }

      if (ctx.screenshotPath) {
        await page.screenshot({ path: ctx.screenshotPath, fullPage: true }).catch(() => {})
      }

      session.pages += 1

      return {
        html,
        url: page.url(),
        status: response?.status(),
        rendered: true,
        redirects,
        timings: {
          navigationMs,
          renderMs,
          captureMs: performance.now() - captureStarted,
          pageMs: performance.now() - started,
        },
      }
    } catch (err) {
      return failure(url, err?.message ?? 'The page could not be rendered.', { pageMs: performance.now() - started })
    } finally {
      // Both, in this order, and neither allowed to throw. A leaked context holds a renderer
      // process alive, and forty of them is a machine that has stopped responding.
      await page?.close().catch(() => {})
      await context?.close().catch(() => {})
    }
  },

  /**
   * The same reader the built-in provider uses. Deliberately identical: if this parsed the
   * DOM differently, a score difference could come from the renderer or the parser, and the
   * experiment would answer neither question.
   */
  async extract(fetched) {
    return readSignals(parseHtml(fetched.html ?? ''))
  },

  async health() {
    try {
      const { existsSync } = await import('node:fs')
      const { chromium } = await import('playwright')
      // `executablePath()` returns a path unconditionally — it computes where the binary
      // *would* live, and does not check whether it is actually there. Treating that string
      // as truthy is exactly the bug that let this provider report itself healthy on a CI
      // runner that had never downloaded a browser: `setup()` then called `chromium.launch()`
      // and threw, and nothing had skipped to protect the run. The existence check is the
      // whole point of asking.
      const path = chromium.executablePath()
      return path && existsSync(path)
        ? { state: 'ok', detail: 'Chromium is installed.' }
        : { state: 'unavailable', detail: 'Run `npx playwright install chromium`.' }
    } catch {
      return { state: 'unavailable', detail: 'Playwright is not installed. Run `npm install --save-dev playwright`.' }
    }
  },
}

/**
 * @typedef {object} WaitFor
 * @property {string} [selector]      What to wait for, when the page can say.
 * @property {number} [timeoutMs]
 * @property {'domcontentloaded'|'load'|'networkidle'|'commit'} [waitUntil]
 * @property {number} [settleMs]
 * @property {number} [navigationTimeoutMs]
 * @property {number} [totalTimeoutMs]
 * @property {number} [maxBytes]
 * @property {number} [maxRedirects]
 */

/** @param {string} url @param {string} reason @param {Record<string, number>} [timings] */
function failure(url, reason, timings = {}) {
  return { html: '', url, failure: reason, rendered: true, timings }
}

/**
 * A hard ceiling on an operation that has its own, softer one.
 *
 * Playwright's timeouts cover the action; this covers the wall clock, including the cases
 * where the action itself hangs before its timer starts. Belt and braces, because the whole
 * point of a benchmark is that it finishes.
 *
 * @template T
 * @param {Promise<T>} promise @param {number} ms @param {string} what
 * @returns {Promise<T>}
 */
function withDeadline(promise, ms, what) {
  let timer
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} exceeded ${Math.round(ms / 1000)}s.`)), ms)
    }),
  ])
}

export { DEFAULTS }
export default playwright
