// Next's own server bootstrap, first: it installs `globalThis.AsyncLocalStorage`, which
// `unstable_cache` requires and captures when its module loads — so it must precede the getters.
import "next/dist/server/node-environment-baseline.js"

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { getCachedContributions as fromSource } from "@/registry/components/github-contributions/lib/get-cached-contributions"
import { getCachedContributions as fromTransformed } from "@/registry/transformed/components/github-contributions/lib/get-cached-contributions"

/**
 * The contributions getter must never abort the static build.
 *
 * The home page and four registry previews prerender through this getter, and each one fetches a
 * third-party API at build time. It already degraded an HTTP error to an empty graph, but a
 * *thrown* fetch — a timeout, a refused connection, a DNS failure — escaped, and Next aborted the
 * whole export. GitHub's runners could not reach the API at all (`ETIMEDOUT`, twice, eight minutes
 * apart, while it answered normally elsewhere), so no deploy could complete.
 *
 * Both copies are tested: `components/` is the source and `transformed/` is its committed,
 * generated twin. They must behave identically, and a test that covered only one would let the
 * other drift.
 *
 * Only `fetch` is stubbed. The getter is wrapped in Next's real `unstable_cache`, which needs what
 * a Next server provides: `AsyncLocalStorage`, installed by Next's own bootstrap imported above, and
 * an incremental cache, provided on the `globalThis` slot Next reads. That cache never hits, so every
 * call executes the getter and no test can see another's cached result.
 */

const API = "https://contributions.example/v4"

const alwaysMiss = {
  isOnDemandRevalidate: false,
  generateSimpleCacheKey: async (key: string) => key,
  get: async () => null,
  set: async () => undefined,
}

type Global = typeof globalThis & { __incrementalCache?: unknown }

beforeAll(() => {
  ;(globalThis as Global).__incrementalCache = alwaysMiss
})

afterAll(() => {
  delete (globalThis as Global).__incrementalCache
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

/** The error Node's fetch threw on the GitHub runner: a TypeError wrapping connect timeouts. */
function timeoutError() {
  const connect = Object.assign(new Error("connect ETIMEDOUT"), {
    code: "ETIMEDOUT",
  })
  return new TypeError("fetch failed", {
    cause: Object.assign(new AggregateError([connect, connect]), {
      code: "ETIMEDOUT",
    }),
  })
}

let calls = 0
/** A distinct username per call, so the cache key never repeats even across both copies. */
const user = () => `user-${++calls}`

describe.each([
  ["components (source)", fromSource],
  ["transformed (generated)", fromTransformed],
])("getCachedContributions — %s", (_label, getCachedContributions) => {
  /** The call signature only — `typeof fetch` also carries `preconnect`, which a stub need not. */
  const withFetch = (
    impl: (...args: Parameters<typeof fetch>) => Promise<Response>
  ) => {
    vi.stubEnv("NEXT_PUBLIC_GITHUB_CONTRIBUTIONS_API_URL", API)
    const spy = vi.fn(impl)
    vi.stubGlobal("fetch", spy)
    return spy
  }

  it("returns the API's contributions on success, from the documented URL", async () => {
    const contributions = [
      { date: "2026-09-01", count: 4, level: 2 },
      { date: "2026-09-02", count: 0, level: 0 },
    ]
    const spy = withFetch(async () =>
      Response.json({ contributions }, { status: 200 })
    )
    const name = user()

    await expect(getCachedContributions(name)).resolves.toEqual(contributions)
    expect(spy).toHaveBeenCalledWith(`${API}/${name}?y=last`)
  })

  it("keeps the existing HTTP-error fallback: an error status is an empty graph", async () => {
    withFetch(async () => new Response("unavailable", { status: 503 }))
    await expect(getCachedContributions(user())).resolves.toEqual([])
  })

  it("returns an empty graph when fetch rejects", async () => {
    withFetch(async () => {
      throw new TypeError("fetch failed")
    })
    await expect(getCachedContributions(user())).resolves.toEqual([])
  })

  it("returns an empty graph on the timeout the GitHub runner hit", async () => {
    withFetch(async () => {
      throw timeoutError()
    })
    await expect(getCachedContributions(user())).resolves.toEqual([])
  })

  it("returns an empty graph when fetch throws something unexpected", async () => {
    // Synchronously, and not even an Error: the caller must still get a value, not a rejection.
    withFetch(() => {
      throw "socket hang up"
    })
    await expect(getCachedContributions(user())).resolves.toEqual([])
  })

  it("still fails loudly when the API URL is not configured", async () => {
    // Deliberately unchanged. A missing URL is a configuration mistake, not an outage, and the
    // build should say so rather than quietly shipping an empty graph.
    vi.stubEnv("NEXT_PUBLIC_GITHUB_CONTRIBUTIONS_API_URL", "")
    vi.stubGlobal("fetch", vi.fn())
    await expect(getCachedContributions(user())).rejects.toThrow("is not set")
  })
})
