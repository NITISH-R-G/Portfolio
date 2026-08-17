/**
 * A local server for the frozen corpus.
 *
 * A renderer needs a URL, and the corpus is a directory of files. The obvious shortcut —
 * `page.setContent(html)` — quietly changes what is being measured: no real navigation, no
 * status code, no document URL, and relative paths resolving against `about:blank`. Since
 * half the point of rendering is to observe what a browser genuinely does with a page, the
 * fixtures get served over HTTP instead.
 *
 * Bound to `127.0.0.1` on an ephemeral port, serving one directory, with no route out of it.
 * The benchmark stays entirely offline: nothing here reaches the internet, and `npm test`
 * needs no network.
 *
 * @module benchmarks/serve
 */

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, normalize, sep } from 'node:path'
import { FIXTURES } from './corpus.js'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
}

/**
 * Serve the fixtures directory.
 *
 * @param {string} [root]
 * @returns {Promise<{origin: string, close: () => Promise<void>, requests: () => number}>}
 */
export async function serveFixtures(root = FIXTURES) {
  let requests = 0

  const server = createServer(async (req, res) => {
    requests += 1

    try {
      const path = decodeURIComponent((req.url ?? '/').split('?')[0])

      // Path traversal is not a hypothetical even here: a fixture is allowed to contain
      // hostile markup, and one linking to `../../../.env` should get a 403 rather than a
      // copy of the file. Resolve first, then check containment.
      const resolved = normalize(join(root, path))
      if (!resolved.startsWith(root + sep) && resolved !== root) {
        res.writeHead(403).end('Forbidden')
        return
      }

      const body = await readFile(resolved)
      const extension = resolved.slice(resolved.lastIndexOf('.'))
      res.writeHead(200, {
        'content-type': TYPES[extension] ?? 'application/octet-stream',
        // Every page must render from the bytes on disk, every run. A cached response would
        // make an edited fixture silently score as its old self.
        'cache-control': 'no-store',
      }).end(body)
    } catch {
      res.writeHead(404).end('Not found')
    }
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address())

  return {
    origin: `http://127.0.0.1:${port}`,
    requests: () => requests,
    close: () => new Promise((resolve) => server.close(() => resolve(undefined))),
  }
}
