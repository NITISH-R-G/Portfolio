#!/usr/bin/env node
/**
 * The local admin API, as its own process.
 *
 * ## Why a sidecar rather than a route in the app
 *
 * The portfolio ships as `output: "export"` — a directory of static files on GitHub Pages,
 * with no server anywhere. A write API cannot live inside that build without either forcing a
 * server into the export or standing up a custom Next server, and both would trade away the
 * property the whole project is built on: the deployed site depends on nothing.
 *
 * So the API is a separate process that exists only while you are developing. `next dev`
 * serves the admin; this serves its hands. Nothing about it is reachable from, referenced by,
 * or bundled into the exported site — the admin discovers it through a public env var that is
 * simply absent in production, so the deployed admin degrades to what it always did: compute
 * the change, show it, and let you apply it yourself.
 *
 * This is deliberately not the long-term production answer. Server-side connector runs, OAuth
 * custody, scheduled synchronisation and webhooks all need somewhere durable to live, and that
 * is the Worker's job, not this one's. This restores local development to what it was before
 * the Vite build was retired, and no more.
 *
 * ## Trust model
 *
 * It binds to the loopback interface, so nothing off this machine can open a socket to it at
 * all. Everything beyond that guards against the one attacker who can still reach it: a web
 * page you happen to be visiting, in the browser you also have the admin open in.
 *
 *   - `Host` must name localhost — otherwise a hostname an attacker controls, pointed at
 *     127.0.0.1, would be same-origin with this server (DNS rebinding).
 *   - `Origin` must be exactly the admin's, not merely local. Another dev server on another
 *     port is a different application, and some of them run other people's code.
 *   - A custom header is required, which a cross-site form cannot set — so every mutation is
 *     preceded by a preflight this server answers only for the admin origin.
 *   - Bodies are capped and parsed as JSON only.
 *
 * @module scripts/dev-api
 */

import http from 'node:http'
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import { ADMIN_HEADER, MAX_BODY, ROUTES, checkRequest, handleAdminRequest } from './lib/adminApi.mjs'

/**
 * The path every endpoint hangs off.
 *
 * Unchanged from the Vite middleware deliberately: the admin's route contract is the same
 * `/__portfolio/state`, `/__portfolio/import` and so on, so only the origin moved. Keeping
 * the paths means a future server-side deployment can serve them without the admin needing a
 * second, incompatible API model.
 */
export const PREFIX = '/__portfolio'

/** The port the admin talks to. Kept out of the ephemeral range so it is predictable. */
export const DEFAULT_PORT = 4319

/** The Next dev server's port, which is the only origin allowed to call this. */
const DEFAULT_APP_PORT = 3000

/**
 * The origins permitted to drive this API.
 *
 * Both spellings of loopback, because the browser's origin is whichever one you typed in the
 * address bar and the two are not interchangeable to CORS.
 *
 * @param {number|string} appPort
 * @returns {string[]}
 */
export function allowedOriginsFor(appPort) {
  return [`http://localhost:${appPort}`, `http://127.0.0.1:${appPort}`]
}

/**
 * Build the server. Exported unstarted so a test can bind it to port 0 and drive it over a
 * real socket rather than asserting against a mock of one.
 *
 * @param {{allowedOrigins?: string[]}} [options]
 */
export function createDevApiServer(options = {}) {
  const allowedOrigins = options.allowedOrigins ?? allowedOriginsFor(process.env.PORT ?? DEFAULT_APP_PORT)

  return http.createServer(async (req, res) => {
    const origin = req.headers.origin
    const allowed = typeof origin === 'string' && allowedOrigins.includes(origin)

    // CORS headers go on every response, including refusals: without them the browser
    // reports an opaque network error and the admin cannot show the real reason.
    if (allowed) {
      res.setHeader('access-control-allow-origin', origin)
      res.setHeader('vary', 'origin')
    }

    if (req.method === 'OPTIONS') {
      // The preflight. Answered only for a permitted origin, which is what makes the custom
      // header an actual CSRF barrier rather than a formality.
      if (!allowed) return send(res, 403, { error: 'Cross-origin requests are refused.' })
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
      res.setHeader('access-control-allow-headers', `content-type, ${ADMIN_HEADER}`)
      res.setHeader('access-control-max-age', '600')
      res.statusCode = 204
      return res.end()
    }

    // The Vite middleware was *mounted* at `/__portfolio`, so it received URLs with the
    // prefix already removed. A standalone server is handed the whole path, so it strips the
    // prefix itself — that is the entire difference between the two transports, and getting
    // it wrong makes every endpoint a 404 while the server looks perfectly healthy.
    const pathname = (req.url ?? '/').split('?')[0]
    if (pathname !== PREFIX && !pathname.startsWith(`${PREFIX}/`)) {
      return send(res, 404, { error: `No such endpoint: ${pathname}` })
    }
    const route = pathname.slice(PREFIX.length).replace(/\/+$/, '') || '/'

    const request = {
      method: req.method,
      route,
      origin,
      host: req.headers.host,
      contentType: req.headers['content-type'],
      marked: req.headers[ADMIN_HEADER] !== undefined,
    }

    // Admission is decided before a single byte of body is read. Buffering up to 12 MB from a
    // caller that was never going to be allowed is work an attacker can ask for for free.
    const admitted = checkRequest(request, allowedOrigins)
    if (!admitted.ok) return send(res, admitted.status, { error: admitted.error })

    /** @type {any} */
    let body
    if (req.method === 'POST') {
      try {
        body = await readBody(req)
      } catch (err) {
        // Closed explicitly: the rest of the oversized body is still in flight, and keeping
        // the connection alive would mean reading the thing that was just refused.
        res.setHeader('connection', 'close')
        send(res, 413, { error: /** @type {Error} */ (err).message })
        return req.destroy()
      }
      if (body?.__invalid) return send(res, 400, { error: `Request body was not valid JSON: ${body.__invalid}` })
    }

    const { status, payload } = await handleAdminRequest({ ...request, body }, allowedOrigins)
    send(res, status, payload)
  })
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<unknown>}
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    /** @type {Buffer[]} */
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        // Refused mid-stream rather than after buffering it: the point of a cap is not to
        // hold the thing you are refusing. The socket is *not* destroyed here — doing that
        // closes the connection before the 413 can be written, and the caller sees a network
        // error instead of the reason. Reading simply stops; the transport answers, then ends.
        req.pause()
        reject(new Error(`That request is larger than ${Math.round(MAX_BODY / 1024 / 1024)} MB.`))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!chunks.length) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (err) {
        // Resolved, not rejected: an unparseable body is a 400 from the handler, not a
        // transport failure, and the handler is where that message belongs.
        resolve({ __invalid: /** @type {Error} */ (err).message })
      }
    })
    req.on('error', reject)
  })
}

/** @param {import('node:http').ServerResponse} res */
function send(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  // Nothing here is ever a page, and nothing should guess otherwise.
  res.setHeader('x-content-type-options', 'nosniff')
  res.end(JSON.stringify(payload))
}

/* -------------------------------------------------------------------------- */

const port = Number(process.env.PORTFOLIO_ADMIN_PORT ?? DEFAULT_PORT)
const appPort = process.env.PORTFOLIO_APP_PORT ?? DEFAULT_APP_PORT

// Only when run directly. Importing this module — which the tests do — must not open a socket.
const invokedDirectly = process.argv[1]
  ? pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url
  : false

if (invokedDirectly) {
  const server = createDevApiServer({ allowedOrigins: allowedOriginsFor(appPort) })

  // 127.0.0.1, never 0.0.0.0: the loopback bind is the outermost security boundary, and it
  // is one config mistake away from being the difference between "my machine" and "this
  // café's wifi".
  server.listen(port, '127.0.0.1', () => {
    const grey = (s) => `[2m${s}[0m`
    console.log(grey(`  portfolio: admin API on http://127.0.0.1:${port} (dev only, loopback)`))
    console.log(grey(`  portfolio: accepting ${allowedOriginsFor(appPort).join(' and ')}`))
    console.log(grey(`  portfolio: ${ROUTES.length} endpoints — ${ROUTES.filter((r) => r.mutating).length} mutating`))
  })

  server.on('error', (err) => {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'EADDRINUSE') {
      console.error(`\n  The admin API port ${port} is already in use.`)
      console.error('  Another dev session is probably running. Close it, or set PORTFOLIO_ADMIN_PORT.\n')
      process.exit(1)
    }
    throw err
  })
}
