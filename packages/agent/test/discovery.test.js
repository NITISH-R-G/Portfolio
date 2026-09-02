import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  discoverManifest, validateManifest, defaultUrlPolicy, isPrivateHost,
  MAX_REDIRECTS, PortfolioError,
} from '../src/index.js'
import { MANIFEST_TYPE } from '../src/manifest.js'

/**
 * Where a manifest fetch is allowed to go.
 *
 * Discovery takes a URL from whoever is calling and then follows pointers chosen by whoever
 * controls the page at the other end — a `Location:` header, a `<link>` tag. That second half
 * is the interesting one. A server-side consumer of this package handed an attacker-supplied
 * portfolio URL is one careless redirect away from being a probe for the internal network it
 * runs in, and `169.254.169.254` is the address that makes that concrete rather than
 * theoretical.
 *
 * The rule these tests pin down: **the caller's own URL is trusted; nothing the network names
 * is.** That keeps `http://localhost:5173` working for someone developing against their own
 * site, which is a real workflow, while refusing the same destination when a remote page picked
 * it.
 */

/** A scripted origin server. Routes are matched by exact URL. */
function server(routes) {
  const requested = []
  const fetchImpl = async (url) => {
    requested.push(String(url))
    const route = routes[String(url)]
    if (!route) return response({ status: 404, body: 'not found' })
    return typeof route === 'function' ? route() : response(route)
  }
  return { fetchImpl, requested }
}

function response({ status = 200, body = '', headers = {}, type } = {}) {
  const map = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  return {
    ok: status >= 200 && status < 300,
    status,
    type,
    headers: { get: (name) => map.get(String(name).toLowerCase()) ?? null },
    text: async () => body,
  }
}

const manifest = (extra = {}) => JSON.stringify({
  schemaVersion: '1.0', person: { name: 'Ada Lovelace' }, ...extra,
})

const json = (body) => ({ body, headers: { 'content-type': 'application/json' } })
const html = (body) => ({ body, headers: { 'content-type': 'text/html' } })
const page = (href) => html(`<html><head><link rel="alternate" type="${MANIFEST_TYPE}" href="${href}"></head></html>`)
const redirect = (to, status = 302) => ({ status, headers: { location: to } })

describe('the address policy itself', () => {
  test('private, loopback and metadata addresses are recognised', () => {
    for (const host of [
      'localhost', 'app.localhost', 'printer.local', 'db.internal', 'x.home.arpa',
      '127.0.0.1', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1',
      '169.254.169.254', '100.64.0.1', '0.0.0.0',
      '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:127.0.0.1',
    ]) {
      assert.equal(isPrivateHost(host), true, host)
    }
  })

  test('public addresses are not', () => {
    for (const host of [
      'example.com', 'ada.github.io', 'localhost.example.com', 'notlocal',
      '8.8.8.8', '172.32.0.1', '172.15.0.1', '192.169.1.1', '100.128.0.1', '2606:4700::1111',
    ]) {
      assert.equal(isPrivateHost(host), false, host)
    }
  })

  test('only http and https are ever allowed, trusted or not', () => {
    for (const url of ['file:///etc/passwd', 'data:text/json,{}', 'gopher://x/', 'ftp://x/']) {
      assert.equal(defaultUrlPolicy(new URL(url), { trusted: true }).allowed, false, url)
    }
  })

  test('a caller-named private address is allowed, a network-named one is not', () => {
    const target = new URL('http://localhost:5173/portfolio.json')
    assert.equal(defaultUrlPolicy(target, { trusted: true }).allowed, true)
    assert.equal(defaultUrlPolicy(target, { trusted: false }).allowed, false)
  })
})

describe('redirects are inspected before they are followed', () => {
  test('an ordinary redirect to an approved destination is followed', async () => {
    const { fetchImpl, requested } = server({
      'https://ada.example/portfolio.json': redirect('https://cdn.example/p.json'),
      'https://cdn.example/p.json': json(manifest()),
    })
    const found = await discoverManifest('https://ada.example/portfolio.json', { fetch: fetchImpl })
    assert.equal(found.manifest.person.name, 'Ada Lovelace')
    assert.deepEqual(requested, ['https://ada.example/portfolio.json', 'https://cdn.example/p.json'])
  })

  test('a relative Location is resolved against the URL that issued it', async () => {
    const { fetchImpl } = server({
      'https://ada.example/portfolio.json': redirect('/v2/portfolio.json'),
      'https://ada.example/v2/portfolio.json': json(manifest()),
    })
    assert.ok((await discoverManifest('https://ada.example/portfolio.json', { fetch: fetchImpl })).manifest)
  })

  for (const [label, target] of [
    ['localhost', 'http://localhost:8080/portfolio.json'],
    ['a private IP', 'http://192.168.1.10/portfolio.json'],
    ['cloud metadata', 'http://169.254.169.254/latest/meta-data/'],
    ['an internal hostname', 'http://vault.internal/portfolio.json'],
    ['a file URL', 'file:///etc/passwd'],
  ]) {
    test(`a redirect to ${label} is refused, and never requested`, async () => {
      const { fetchImpl, requested } = server({
        'https://ada.example/portfolio.json': redirect(target),
      })
      await assert.rejects(
        () => discoverManifest('https://ada.example/portfolio.json', { fetch: fetchImpl }),
        PortfolioError,
      )
      // The point of validating before requesting: even a blind SSRF is a request that reached
      // something it should not have.
      assert.ok(!requested.includes(target), `${target} was fetched`)
    })
  }

  test('the refusal says which address it refused and why', async () => {
    const { fetchImpl } = server({
      'https://ada.example/portfolio.json': redirect('http://169.254.169.254/latest/meta-data/'),
    })
    const error = await discoverManifest('https://ada.example/portfolio.json', { fetch: fetchImpl }).catch((e) => e)
    const refusal = error.issues.find((i) => /Refused to fetch/.test(i.message))
    assert.ok(refusal, JSON.stringify(error.issues))
    assert.match(refusal.message, /169\.254\.169\.254/)
    assert.match(refusal.message, /private or loopback/)
  })

  test('a chain within the limit is followed to the end', async () => {
    const { fetchImpl } = server({
      'https://ada.example/portfolio.json': redirect('https://a.example/1'),
      'https://a.example/1': redirect('https://a.example/2'),
      'https://a.example/2': redirect('https://a.example/3'),
      'https://a.example/3': json(manifest()),
    })
    assert.ok((await discoverManifest('https://ada.example/portfolio.json', { fetch: fetchImpl })).manifest)
  })

  test('a redirect loop terminates instead of recursing', async () => {
    // Two guards overlap here — the hop counter and the visited-URL set — and either alone
    // would stop this. Both are cheap and a loop that hangs a caller is worse than redundancy.
    const { fetchImpl, requested } = server({
      'https://ada.example/portfolio.json': redirect('https://ada.example/loop'),
      'https://ada.example/loop': redirect('https://ada.example/portfolio.json'),
    })
    await assert.rejects(() => discoverManifest('https://ada.example/portfolio.json', { fetch: fetchImpl }), PortfolioError)
    assert.ok(requested.length <= MAX_REDIRECTS + 4, `made ${requested.length} requests`)
  })

  test('a long chain stops at the hop limit', async () => {
    const routes = { 'https://ada.example/portfolio.json': redirect('https://a.example/0') }
    for (let i = 0; i < 20; i += 1) routes[`https://a.example/${i}`] = redirect(`https://a.example/${i + 1}`)
    const { fetchImpl, requested } = server(routes)
    await assert.rejects(() => discoverManifest('https://ada.example/portfolio.json', { fetch: fetchImpl }), PortfolioError)
    assert.ok(requested.length <= MAX_REDIRECTS + 4, `made ${requested.length} requests`)
  })

  test('an opaque redirect is reported rather than silently treated as absent', async () => {
    // What a browser returns for `redirect: 'manual'`: status 0, no readable headers.
    const { fetchImpl } = server({
      'https://ada.example/portfolio.json': () => response({ status: 0, type: 'opaqueredirect' }),
    })
    const error = await discoverManifest('https://ada.example/portfolio.json', { fetch: fetchImpl }).catch((e) => e)
    assert.ok(error.issues.some((i) => /will not disclose/.test(i.message)))
  })
})

describe('a link discovered in a page is not trusted either', () => {
  test('a page pointing at an approved manifest is followed', async () => {
    const { fetchImpl } = server({
      'https://ada.example/': page('/portfolio.json'),
      'https://ada.example/portfolio.json': json(manifest()),
    })
    assert.ok((await discoverManifest('https://ada.example/', { fetch: fetchImpl })).manifest)
  })

  test('a page pointing at an internal address is refused', async () => {
    const { fetchImpl, requested } = server({
      'https://ada.example/': page('http://169.254.169.254/latest/meta-data/'),
    })
    await assert.rejects(() => discoverManifest('https://ada.example/', { fetch: fetchImpl }), PortfolioError)
    assert.ok(!requested.some((u) => u.includes('169.254')))
  })

  test('a page pointing at a file URL is refused', async () => {
    const { fetchImpl, requested } = server({ 'https://ada.example/': page('file:///etc/passwd') })
    await assert.rejects(() => discoverManifest('https://ada.example/', { fetch: fetchImpl }), PortfolioError)
    assert.ok(!requested.some((u) => u.startsWith('file:')))
  })
})

describe('the caller keeps the last word', () => {
  test('a URL the caller passed may be private', async () => {
    // `npm run dev` against your own machine has to keep working.
    const { fetchImpl } = server({ 'http://localhost:5173/portfolio.json': json(manifest()) })
    assert.ok((await discoverManifest('http://localhost:5173/portfolio.json', { fetch: fetchImpl })).manifest)
  })

  test('a custom policy can widen or narrow the default', async () => {
    const { fetchImpl } = server({
      'https://ada.example/portfolio.json': redirect('http://10.0.0.5/p.json'),
      'http://10.0.0.5/p.json': json(manifest()),
    })
    const found = await discoverManifest('https://ada.example/portfolio.json', {
      fetch: fetchImpl,
      allowUrl: () => ({ allowed: true }),
    })
    assert.ok(found.manifest, 'an explicit opt-in must be honoured')

    const { fetchImpl: strict } = server({ 'https://ada.example/portfolio.json': json(manifest()) })
    await assert.rejects(() => discoverManifest('https://ada.example/portfolio.json', {
      fetch: strict,
      allowUrl: (u) => (u.hostname === 'allowed.example' ? { allowed: true } : { allowed: false, reason: 'not on my list' }),
    }), PortfolioError)
  })
})

describe('the deadline covers the body, not just the headers', () => {
  test('a response whose body never finishes times out', async () => {
    // The slow-loris shape: headers arrive instantly, so a timeout wrapped around `fetch`
    // alone would already have resolved and the read would hang for ever.
    const fetchImpl = async (url, init) => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: () => new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      }),
    })

    const started = Date.now()
    await assert.rejects(
      () => discoverManifest('https://ada.example/portfolio.json', { fetch: fetchImpl, timeoutMs: 150 }),
      PortfolioError,
    )
    assert.ok(Date.now() - started < 5000, 'the read should have been abandoned quickly')
  })

  test('the abort signal reaches the fetch, so the socket is torn down', async () => {
    let received
    const fetchImpl = async (url, init) => {
      received = init.signal
      return response(json(manifest()))
    }
    await discoverManifest('https://ada.example/portfolio.json', { fetch: fetchImpl })
    assert.ok(received instanceof AbortSignal, 'no signal was passed to fetch')
  })

  test('redirects are requested manually so each hop can be checked', async () => {
    let mode
    const fetchImpl = async (url, init) => { mode = init.redirect; return response(json(manifest())) }
    await discoverManifest('https://ada.example/portfolio.json', { fetch: fetchImpl })
    assert.equal(mode, 'manual')
  })
})

describe('an unusable manifest is refused, not returned', () => {
  test('a schemaVersion this package cannot read throws', async () => {
    // Returning it would let a caller act on a document whose shape this code has just said it
    // does not understand — and be wrong about a real person as a result.
    const { fetchImpl } = server({
      'https://ada.example/portfolio.json': json(manifest({ schemaVersion: '2.0' })),
    })
    const error = await discoverManifest('https://ada.example/portfolio.json', { fetch: fetchImpl }).catch((e) => e)
    assert.ok(error instanceof PortfolioError)
    assert.equal(error.code, 'invalid')
    assert.match(error.message, /schema version 2\.0/)
  })

  test('the same is true when the page linked to it', async () => {
    const { fetchImpl } = server({
      'https://ada.example/': page('/portfolio.json'),
      'https://ada.example/portfolio.json': json(manifest({ schemaVersion: '2.0' })),
    })
    await assert.rejects(() => discoverManifest('https://ada.example/', { fetch: fetchImpl }), PortfolioError)
  })

  test('a newer minor version still loads, with a note', async () => {
    const { fetchImpl } = server({
      'https://ada.example/portfolio.json': json(manifest({ schemaVersion: '1.4' })),
    })
    const found = await discoverManifest('https://ada.example/portfolio.json', { fetch: fetchImpl })
    assert.equal(found.manifest.person.name, 'Ada Lovelace')
    assert.ok(found.issues.some((i) => /version 1\.4/.test(i.message)))
  })

  test('an array is not a person record', async () => {
    // `typeof [] === 'object'`, so this used to pass the object check and be reported only as
    // "names no person" — a warning, which loads.
    assert.equal(validateManifest({ schemaVersion: '1.0', person: [] }).valid, false)
    assert.equal(validateManifest({ schemaVersion: '1.0', person: { name: 'Ada' } }).valid, true)

    const { fetchImpl } = server({
      'https://ada.example/portfolio.json': json(JSON.stringify({ schemaVersion: '1.0', person: [] })),
    })
    await assert.rejects(() => discoverManifest('https://ada.example/portfolio.json', { fetch: fetchImpl }), PortfolioError)
  })
})
