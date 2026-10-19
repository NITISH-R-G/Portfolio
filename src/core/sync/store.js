/**
 * The only persistence the sync service assumes.
 *
 * Three methods over JSON values, with an optional time-to-live. That is deliberately the
 * lowest common denominator: Cloudflare KV implements it, so does Redis, so does a Map. The
 * ledger is written against this interface and never against a vendor, which is what keeps the
 * service provider-neutral at the storage layer as well as the event layer.
 *
 * ## What this does *not* provide
 *
 * Atomic read-modify-write. KV is eventually consistent, so two deliveries arriving in the same
 * moment can both read the same state. The ledger is designed so that is harmless — the worst
 * outcome is one redundant publish, which `deploy.yml`'s concurrency group already coalesces —
 * and a deployment that needs strict single-flight can back this interface with a Durable
 * Object instead without touching the ledger.
 *
 * @module core/sync/store
 */

/**
 * @typedef {object} SyncStore
 * @property {(key: string) => Promise<any|undefined>} get
 * @property {(key: string, value: unknown, options?: {ttlSeconds?: number}) => Promise<void>} put
 * @property {(key: string) => Promise<void>} delete
 */

/**
 * An in-memory store with working expiry. Used by every test, and fine for a single-process
 * deployment that does not need to survive a restart.
 *
 * Values are stored as JSON text, as KV does, so a test cannot accidentally depend on object
 * identity surviving a round trip.
 *
 * @param {{now?: () => number}} [options]
 * @returns {SyncStore & {size: () => number}}
 */
export function createMemoryStore({ now = Date.now } = {}) {
  /** @type {Map<string, {text: string, expiresAt?: number}>} */
  const entries = new Map()

  return {
    async get(key) {
      const entry = entries.get(key)
      if (!entry) return undefined
      if (entry.expiresAt !== undefined && entry.expiresAt <= now()) {
        entries.delete(key)
        return undefined
      }
      return JSON.parse(entry.text)
    },
    async put(key, value, { ttlSeconds } = {}) {
      entries.set(key, {
        text: JSON.stringify(value),
        expiresAt: ttlSeconds ? now() + ttlSeconds * 1000 : undefined,
      })
    },
    async delete(key) {
      entries.delete(key)
    },
    size: () => entries.size,
  }
}

/**
 * Adapt a Cloudflare KV namespace to `SyncStore`.
 *
 * KV rejects a time-to-live under 60 seconds, so shorter requests are rounded up. Nothing in
 * the ledger asks for less than a minute, but an adapter that threw on it would turn a
 * configuration choice into an outage.
 *
 * @param {{get: (key: string, type: 'json') => Promise<any>, put: (key: string, value: string, options?: object) => Promise<void>, delete: (key: string) => Promise<void>}} kv
 * @returns {SyncStore}
 */
export function createKvStore(kv) {
  return {
    async get(key) {
      const value = await kv.get(key, 'json')
      return value === null ? undefined : value
    },
    async put(key, value, { ttlSeconds } = {}) {
      await kv.put(
        key,
        JSON.stringify(value),
        ttlSeconds ? { expirationTtl: Math.max(60, Math.ceil(ttlSeconds)) } : undefined,
      )
    },
    async delete(key) {
      await kv.delete(key)
    },
  }
}
