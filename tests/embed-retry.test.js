import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  retryingFetch, backoffMs, retryAfterMs, installRetryingFetch, RETRYABLE_STATUS,
} from '../scripts/lib/retryFetch.mjs'

/**
 * Retrying the model download.
 *
 * The failure being fixed: `npm run embed` fetches the model from huggingface.co, CI runners
 * share outbound IPs with the rest of GitHub, and HuggingFace rate-limits by IP — so a 429 on
 * the very first file was failing roughly one production deploy in two. Everything downstream
 * behaved correctly (the manifest reported lexical retrieval, the guard refused to ship it);
 * the deploy simply needed a human to press "re-run".
 *
 * Nothing here touches the network or waits. The clock, the sleep, the randomness and the fetch
 * are all injected, so four consecutive 429s and a `Retry-After` header are exercised in under
 * a millisecond — which is the only way a retry policy gets tested at all rather than being
 * assumed to work.
 */

const ROOT = join(import.meta.dirname, '..')

/** A response just real enough for the code under test. */
const reply = (status, headers = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
})

/**
 * A scripted server: each entry is a status, or a function that throws.
 * Returns the wrapped fetch plus a log of what happened.
 */
function scripted(script, options = {}) {
  const calls = []
  const slept = []
  let i = 0

  const inner = async (input, init) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET' })
    const step = script[Math.min(i, script.length - 1)]
    i += 1
    if (typeof step === 'function') return step()
    if (step instanceof Error) throw step
    return typeof step === 'number' ? reply(step) : step
  }

  const fetchImpl = retryingFetch(inner, {
    sleep: async (ms) => { slept.push(ms) },
    random: () => 0.5,          // deterministic jitter
    now: () => 0,               // budget never elapses unless a test says so
    ...options,
  })

  return { fetchImpl, calls, slept }
}

describe('transient failures are retried', () => {
  test('a 429 followed by success returns the success', async () => {
    const { fetchImpl, calls, slept } = scripted([429, 200])
    const response = await fetchImpl('https://huggingface.co/model/config.json')

    assert.equal(response.status, 200)
    assert.equal(calls.length, 2, 'exactly one retry')
    assert.equal(slept.length, 1)
    assert.ok(slept[0] > 0, 'it waited before trying again')
  })

  test('several 429s followed by success still succeeds', async () => {
    const { fetchImpl, calls, slept } = scripted([429, 429, 429, 200])
    assert.equal((await fetchImpl('https://hf/model')).status, 200)
    assert.equal(calls.length, 4)
    assert.deepEqual(slept.map((ms) => ms > 0), [true, true, true])

    // Exponential: each wait is longer than the one before it.
    for (let i = 1; i < slept.length; i += 1) {
      assert.ok(slept[i] > slept[i - 1], `wait ${i} (${slept[i]}) should exceed ${slept[i - 1]}`)
    }
  })

  test('a transient 5xx is retried', async () => {
    for (const status of [500, 502, 503, 504]) {
      const { fetchImpl, calls } = scripted([status, 200])
      assert.equal((await fetchImpl('https://hf/model')).status, 200, String(status))
      assert.equal(calls.length, 2, String(status))
    }
  })

  test('a transient network failure is retried', async () => {
    // What `fetch` throws when a connection is reset mid-handshake — no response at all.
    const { fetchImpl, calls } = scripted([new TypeError('fetch failed'), 200])
    assert.equal((await fetchImpl('https://hf/model')).status, 200)
    assert.equal(calls.length, 2)
  })

  test('408 and 425 are treated as transient too', async () => {
    for (const status of [408, 425]) {
      const { fetchImpl, calls } = scripted([status, 200])
      assert.equal((await fetchImpl('https://hf/model')).status, 200, String(status))
      assert.equal(calls.length, 2, String(status))
    }
  })
})

describe('Retry-After is obeyed when the server sends one', () => {
  test('delta-seconds becomes the wait', async () => {
    const { fetchImpl, slept } = scripted([reply(429, { 'retry-after': '3' }), 200])
    await fetchImpl('https://hf/model')
    assert.deepEqual(slept, [3000], 'the server asked for 3 seconds')
  })

  test('an HTTP-date is honoured', () => {
    const when = new Date(Date.now() + 5000).toUTCString()
    const ms = retryAfterMs(reply(429, { 'retry-after': when }))
    assert.ok(ms > 3000 && ms <= 6000, `expected ~5s, got ${ms}`)
  })

  test('a date in the past means now, never a negative sleep', () => {
    const past = new Date(Date.now() - 60_000).toUTCString()
    assert.equal(retryAfterMs(reply(429, { 'retry-after': past })), 0)
  })

  test('an unusable header falls back to backoff rather than breaking', () => {
    assert.equal(retryAfterMs(reply(429, { 'retry-after': 'soon-ish' })), null)
    assert.equal(retryAfterMs(reply(429, { 'retry-after': '-5' })), null)
    assert.equal(retryAfterMs(reply(429)), null)
  })

  test('the server’s instruction overrides our own backoff', async () => {
    // Attempt 1 backoff would be ~1s; the header says 7.
    const { fetchImpl, slept } = scripted([reply(429, { 'retry-after': '7' }), 200])
    await fetchImpl('https://hf/model')
    assert.equal(slept[0], 7000)
  })
})

describe('the waiting is bounded', () => {
  test('exhausted retries return the failing response rather than looping', async () => {
    const { fetchImpl, calls } = scripted([429], { attempts: 4 })
    const response = await fetchImpl('https://hf/model')

    assert.equal(response.status, 429, 'the real failure is reported, not swallowed')
    assert.equal(calls.length, 4, 'it stopped at the attempt limit')
  })

  test('an exhausted network failure rethrows the original error', async () => {
    const { fetchImpl } = scripted([new TypeError('fetch failed')], { attempts: 3 })
    await assert.rejects(() => fetchImpl('https://hf/model'), TypeError)
  })

  test('it will not sleep past the total budget', async () => {
    // A rate limit asking for five minutes is a request to give up, not to wait.
    let clock = 0
    const { fetchImpl, calls, slept } = scripted(
      [reply(429, { 'retry-after': '300' }), 200],
      { budgetMs: 30_000, now: () => clock },
    )
    const response = await fetchImpl('https://hf/model')

    assert.equal(response.status, 429, 'reported instead of waited on')
    assert.equal(calls.length, 1)
    assert.deepEqual(slept, [], 'it never slept')
  })

  test('the budget accounts for time already spent', async () => {
    let clock = 0
    const { fetchImpl, slept } = scripted([429, 429, 429, 429, 200], {
      budgetMs: 5000,
      now: () => clock,
      sleep: async (ms) => { slept.push(ms); clock += ms },
    })
    await fetchImpl('https://hf/model')
    const total = slept.reduce((sum, ms) => sum + ms, 0)
    assert.ok(total <= 5000, `slept ${total}ms against a 5000ms budget`)
  })

  test('a sleep that overshoots the deadline stops before retrying', async () => {
    // The pre-sleep check is a *prediction* — `now() + delayMs` — and a sleep can overshoot it:
    // a loaded runner schedules late. Here the clock jumps far further than the delay it was
    // handed, which is the same shape as a process suspended mid-sleep.
    let clock = 0
    const calls = []
    const inner = async () => { calls.push(1); return reply(429) }

    const fetchImpl = retryingFetch(inner, {
      attempts: 5,
      budgetMs: 10_000,
      now: () => clock,
      random: () => 0.5,
      // Asked for ~1s, actually consumes the whole budget.
      sleep: async () => { clock += 50_000 },
    })

    const response = await fetchImpl('https://hf/model')
    assert.equal(response.status, 429, 'the transient response is returned, not swallowed')
    assert.equal(calls.length, 1, 'inner must not be invoked again once the budget is spent')
  })

  test('the same holds when the failure was a network error', async () => {
    let clock = 0
    const calls = []
    const boom = new TypeError('fetch failed')
    const inner = async () => { calls.push(1); throw boom }

    const fetchImpl = retryingFetch(inner, {
      attempts: 5,
      budgetMs: 10_000,
      now: () => clock,
      random: () => 0.5,
      sleep: async () => { clock += 50_000 },
    })

    await assert.rejects(() => fetchImpl('https://hf/model'), (error) => error === boom)
    assert.equal(calls.length, 1, 'the original error is rethrown rather than retried')
  })

  test('a sleep that stays within the deadline still retries', async () => {
    // The other half: the post-sleep check must not become a blanket stop.
    let clock = 0
    const calls = []
    const inner = async () => { calls.push(1); return calls.length < 2 ? reply(429) : reply(200) }

    const fetchImpl = retryingFetch(inner, {
      attempts: 5,
      budgetMs: 10_000,
      now: () => clock,
      random: () => 0.5,
      sleep: async (ms) => { clock += ms },
    })

    assert.equal((await fetchImpl('https://hf/model')).status, 200)
    assert.equal(calls.length, 2, 'a retry inside the budget must still happen')
  })

  test('backoff is exponential, jittered, and capped', () => {
    const opts = { baseDelayMs: 1000, maxDelayMs: 8000, random: () => 1 }
    assert.equal(backoffMs(1, opts), 1000)
    assert.equal(backoffMs(2, opts), 2000)
    assert.equal(backoffMs(3, opts), 4000)
    assert.equal(backoffMs(9, opts), 8000, 'capped')

    // Equal jitter: never below half the nominal delay, so a server that asked for room gets it.
    const low = backoffMs(3, { ...opts, random: () => 0 })
    assert.equal(low, 2000)
    assert.ok(low >= 4000 / 2)
  })
})

describe('permanent failures are not retried', () => {
  test('a 4xx that describes a bad request returns immediately', async () => {
    // Asking again more slowly cannot fix a model name that does not exist or a token that is
    // not valid — and a build should report those in seconds, not after a minute of patience.
    for (const status of [400, 401, 403, 404, 410, 422]) {
      const { fetchImpl, calls, slept } = scripted([status, 200])
      const response = await fetchImpl('https://hf/model')

      assert.equal(response.status, status, `${status} must be returned as-is`)
      assert.equal(calls.length, 1, `${status} must not be retried`)
      assert.deepEqual(slept, [], `${status} must not wait`)
    }
  })

  test('the retryable set is exactly the transient ones', () => {
    assert.deepEqual([...RETRYABLE_STATUS].sort((a, b) => a - b), [408, 425, 429, 500, 502, 503, 504])
    for (const permanent of [400, 401, 403, 404, 405, 410, 422, 451]) {
      assert.ok(!RETRYABLE_STATUS.has(permanent), String(permanent))
    }
  })

  test('a success is returned untouched', async () => {
    const { fetchImpl, calls } = scripted([200])
    assert.equal((await fetchImpl('https://hf/model')).status, 200)
    assert.equal(calls.length, 1)
  })

  test('an abort is a decision, not a hiccup', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    const { fetchImpl, calls } = scripted([abort, 200])
    await assert.rejects(() => fetchImpl('https://hf/model'), /aborted/)
    assert.equal(calls.length, 1, 'an aborted request must not be reissued')
  })

  test('a non-idempotent request is passed straight through', async () => {
    const { fetchImpl, calls } = scripted([429, 200])
    const response = await fetchImpl('https://hf/model', { method: 'POST' })
    assert.equal(response.status, 429)
    assert.equal(calls.length, 1, 'a POST must never be replayed')
  })

  test('a POST carried on a Request object, with no init, is not replayed', async () => {
    // The case that reading only `init.method` missed: `fetch(new Request(url, {method:'POST'}))`
    // passes no init at all, so the method lives on the *input*. It defaulted to GET and the
    // POST was sent three times. This wrapper is installed on the global fetch for the duration
    // of the model load, so anything else running in that window would have been replayed too.
    const { fetchImpl, calls } = scripted([429, 200])
    const response = await fetchImpl(new Request('https://hf/model', { method: 'POST' }))
    assert.equal(response.status, 429)
    assert.equal(calls.length, 1, 'a POST on a Request must never be replayed')
  })

  test('HEAD is not replayed either', async () => {
    // Idempotent, so repeating it would be harmless — but the model download never issues one
    // (`transformers.js` probes metadata with a ranged GET), so allowing it would only widen
    // what a global wrapper repeats on someone else's behalf.
    for (const call of [
      () => scripted([429, 200]).fetchImpl('https://hf/model', { method: 'HEAD' }),
      () => scripted([429, 200]).fetchImpl(new Request('https://hf/model', { method: 'HEAD' })),
    ]) {
      assert.equal((await call()).status, 429)
    }

    const { fetchImpl, calls } = scripted([429, 200])
    await fetchImpl(new Request('https://hf/model', { method: 'HEAD' }))
    assert.equal(calls.length, 1)
  })

  test('init.method wins over the Request’s own', async () => {
    const { fetchImpl, calls } = scripted([429, 200])
    // A GET Request explicitly overridden to POST must not be retried…
    await fetchImpl(new Request('https://hf/model'), { method: 'POST' })
    assert.equal(calls.length, 1)
  })

  test('a GET is still retried, however it is expressed', async () => {
    // The behaviour that must not regress: every spelling of a GET keeps its retries.
    for (const [input, init] of [
      ['https://hf/model', undefined],
      ['https://hf/model', { method: 'GET' }],
      ['https://hf/model', { method: 'get' }],
      [new Request('https://hf/model'), undefined],
      [new Request('https://hf/model', { method: 'GET' }), undefined],
    ]) {
      const { fetchImpl, calls } = scripted([429, 200])
      assert.equal((await fetchImpl(input, init)).status, 200)
      assert.equal(calls.length, 2, `${String(input)} ${JSON.stringify(init)}`)
    }
  })
})

describe('installation is scoped and reversible', () => {
  test('it wraps the global fetch and restores it', () => {
    const original = globalThis.fetch
    const restore = installRetryingFetch()
    assert.notEqual(globalThis.fetch, original, 'the wrapper should be installed')
    restore()
    assert.equal(globalThis.fetch, original, 'the original must come back')
  })

  test('it is installed before the model library is imported', () => {
    // `transformers.js` captures `globalThis.fetch.bind(globalThis)` into a module constant
    // when it loads and never re-reads it, so a wrapper installed afterwards would be ignored.
    // `ready()` is where `embedding.js` dynamically imports it, so the install has to come
    // first — this asserts that ordering, which is otherwise invisible and easy to undo.
    const embed = readFileSync(join(ROOT, 'scripts', 'embed.mjs'), 'utf8')
    const install = embed.indexOf('installRetryingFetch(')
    const ready = embed.indexOf('await provider.ready()')
    const restore = embed.indexOf('restoreFetch()')

    assert.ok(install > 0 && ready > 0 && restore > 0, 'all three must be present')
    assert.ok(install < ready, 'the wrapper must be installed before the first ready()')
    assert.ok(restore > ready, 'and removed after')
    assert.match(embed, /finally \{\s*restoreFetch\(\)/, 'restored even when the load fails')
  })
})

describe('a failed embedding build still fails the deploy closed', () => {
  // The property the retry must not erode: retries buy patience, never permission to ship a
  // worse site. If the model is genuinely unreachable the index is absent, the manifest says
  // so, and the workflow refuses to deploy.
  const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'deploy.yml'), 'utf8')

  test('the guard still reads the manifest and rejects a degraded build', () => {
    assert.match(workflow, /capabilities\.search/)
    assert.match(workflow, /!= "hybrid-semantic"/)
    assert.match(workflow, /::error::Built site reports/)
    assert.match(workflow, /exit 1/)
  })

  test('the index is still generated before the build that reads it', () => {
    assert.ok(workflow.indexOf('npm run embed') < workflow.indexOf('run: npm run build'))
  })

  test('embed still skips rather than crashing when the model is unavailable', () => {
    // The retry sits inside this path; the surrounding contract is unchanged.
    const embed = readFileSync(join(ROOT, 'scripts', 'embed.mjs'), 'utf8')
    assert.match(embed, /Skipping embeddings\. Search will use lexical retrieval only\./)
    assert.match(embed, /return 0/)
  })
})
