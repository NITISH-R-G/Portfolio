/**
 * Webhook signatures.
 *
 * A webhook endpoint is a public URL that causes a build, so the only thing standing between
 * it and anyone who finds it is the signature. GitHub signs the raw request body with HMAC-SHA256
 * and the shared secret, and sends `X-Hub-Signature-256: sha256=<hex>`.
 *
 * Three decisions that are easy to get wrong, and are each pinned by a test:
 *
 * - **Verify the raw bytes, not a re-serialised object.** Parsing and re-stringifying changes
 *   whitespace and key order, and the signature is over what was sent.
 * - **Compare in constant time.** `crypto.subtle.verify` does that; comparing hex strings with
 *   `===` leaks how many leading characters matched.
 * - **Fail closed.** No secret configured, no header, a malformed header, the wrong scheme: all
 *   `false`. A deployment that forgot to set the secret must refuse everything, not accept
 *   everything.
 *
 * Web Crypto only, so the same file runs in a Worker and in Node's test runner.
 *
 * @module core/sync/signature
 */

const encoder = new TextEncoder()

/** @param {string} secret */
function importKey(secret, usage) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  )
}

/** @param {string|Uint8Array|ArrayBuffer} body */
function toBytes(body) {
  if (typeof body === 'string') return encoder.encode(body)
  return body instanceof Uint8Array ? body : new Uint8Array(body)
}

/** @param {string} hex @returns {Uint8Array|null} */
function hexToBytes(hex) {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

/**
 * The header value for a body. Used by tests and by anything that needs to call this service
 * the way GitHub does.
 *
 * @param {string} secret
 * @param {string|Uint8Array|ArrayBuffer} body
 * @returns {Promise<string>} `sha256=<hex>`
 */
export async function signSha256(secret, body) {
  const key = await importKey(secret, 'sign')
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, toBytes(body)))
  return `sha256=${[...mac].map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Is this header the signature of this body under this secret?
 *
 * @param {string|undefined} secret
 * @param {string|Uint8Array|ArrayBuffer} body  The raw request body, exactly as received.
 * @param {string|null|undefined} header        The `X-Hub-Signature-256` value.
 * @returns {Promise<boolean>}
 */
export async function verifySha256(secret, body, header) {
  if (!secret || typeof header !== 'string') return false
  const match = /^sha256=([0-9a-f]{64})$/i.exec(header.trim())
  if (!match) return false
  const signature = hexToBytes(match[1])
  if (!signature) return false
  const key = await importKey(secret, 'verify')
  return crypto.subtle.verify('HMAC', key, signature, toBytes(body))
}
