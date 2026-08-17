/**
 * Kaggle.
 *
 * Kaggle has an official API, but every endpoint requires the user's own API token, so
 * this connector is `token` rather than `api`: it works, and it only works once the user
 * has downloaded kaggle.json and put the two values in `.env`.
 *
 * What the API covers: datasets and notebooks you have published. What it does not cover:
 * competition medals, tier and global ranking — those exist only on the profile page,
 * which is not part of the API. Those fields are therefore accepted as stated figures and
 * labelled as such, never presented as fetched.
 *
 * @module connectors/kaggle
 */

import { handle, stamp, clean, count, some, isoDay } from '../support.js'

const API = 'https://www.kaggle.com/api/v1'

/** @type {import('../types.js').Connector} */
const kaggle = {
  id: 'kaggle',
  name: 'Kaggle',
  category: 'ml',
  icon: 'Boxes',
  availability: 'token',
  homepage: 'https://www.kaggle.com',
  summary: 'Published datasets and notebooks, via the official API.',
  limits:
    'Every Kaggle API endpoint requires your own credentials: download kaggle.json from ' +
    'Account → API and set KAGGLE_USERNAME and KAGGLE_KEY in .env. Competition medals, tier ' +
    'and ranking are not exposed by the API — enter those here and they are labelled ' +
    'self-reported rather than shown as fetched.',
  supportedData: ['models', 'achievements', 'stats', 'socials'],
  authEnv: ['KAGGLE_USERNAME', 'KAGGLE_KEY'],
  rateLimit: 'Per-account, set by Kaggle.',
  fields: [
    { key: 'username', label: 'Kaggle username', required: true },
    { key: 'tier', label: 'Kaggle tier', help: 'e.g. Expert, Master, Grandmaster. Not available from the API.' },
    { key: 'competitionMedals', label: 'Competition medals', help: 'e.g. "2 gold, 3 silver". Not available from the API.' },
    { key: 'globalRank', label: 'Global rank', type: 'number', help: 'Not available from the API.' },
  ],

  identify: (cfg) => handle(cfg, ['username', 'user'], /kaggle\.com\/([^/?#]+)/i),
  profileUrl: (cfg) => {
    const user = kaggle.identify(cfg)
    return user ? `https://www.kaggle.com/${user}` : undefined
  },

  async fetch(cfg, ctx) {
    const username = /** @type {string} */ (kaggle.identify(cfg))
    const apiUser = ctx.env('KAGGLE_USERNAME')
    const apiKey = ctx.env('KAGGLE_KEY')

    if (!apiUser || !apiKey) {
      // A dedicated marker rather than a generic throw: the runner turns this into the
      // `unavailable` state, which reads as "not set up" rather than "broken".
      const error = /** @type {any} */ (new Error(
        'Kaggle requires credentials. Download kaggle.json from your Kaggle account and set ' +
        'KAGGLE_USERNAME and KAGGLE_KEY in .env.',
      ))
      error.unavailable = true
      throw error
    }

    const opts = {
      platform: 'Kaggle',
      headers: { authorization: `Basic ${base64(`${apiUser}:${apiKey}`)}` },
      retries: 1,
    }

    /** @type {string[]} */
    const warnings = []
    let datasets = []
    let kernels = []

    try {
      const res = await ctx.http.json(`${API}/datasets/list?user=${encodeURIComponent(username)}`, opts)
      if (Array.isArray(res)) datasets = res
    } catch (err) {
      warnings.push(`Datasets: ${/** @type {Error} */ (err).message}`)
    }

    try {
      const res = await ctx.http.json(`${API}/kernels/list?user=${encodeURIComponent(username)}&pageSize=50`, opts)
      if (Array.isArray(res)) kernels = res
    } catch (err) {
      warnings.push(`Notebooks: ${/** @type {Error} */ (err).message}`)
    }

    return { username, datasets, kernels, warnings }
  },

  normalize(raw, cfg, ctx) {
    const { username, datasets, kernels } = /** @type {any} */ (raw ?? {})
    const now = ctx.now
    const user = username ?? kaggle.identify(cfg)
    const profile = `https://www.kaggle.com/${user}`

    const models = [
      ...(Array.isArray(datasets) ? datasets : []).map((dataset) => {
        const ref = dataset?.ref ?? `${user}/${dataset?.title ?? ''}`
        const url = `https://www.kaggle.com/datasets/${ref}`
        return clean({
          id: `kaggle-dataset-${slug(ref)}`,
          name: dataset?.title ?? ref,
          kind: 'dataset',
          url,
          description: dataset?.subtitle || undefined,
          downloads: count(dataset?.downloadCount),
          likes: count(dataset?.voteCount),
          tags: some((dataset?.tags ?? []).map((t) => t?.name ?? t).filter((t) => typeof t === 'string')),
          updatedAt: isoDay(dataset?.lastUpdated),
          source: stamp('kaggle', url, now),
        })
      }),
      ...(Array.isArray(kernels) ? kernels : []).map((kernel) => {
        const ref = kernel?.ref ?? `${user}/${kernel?.title ?? ''}`
        const url = `https://www.kaggle.com/code/${ref}`
        return clean({
          id: `kaggle-notebook-${slug(ref)}`,
          name: kernel?.title ?? ref,
          // Notebooks are closer to a Space than a dataset: a runnable artefact.
          kind: 'space',
          url,
          likes: count(kernel?.totalVotes),
          updatedAt: isoDay(kernel?.lastRunTime),
          source: stamp('kaggle', url, now),
        })
      }),
    ]

    // The profile-page figures the API does not serve. Marked `stated` so the UI shows
    // "self-reported" rather than implying Kaggle confirmed them.
    const source = { connector: 'kaggle', url: profile }
    const achievements = some([
      typeof cfg.tier === 'string' && cfg.tier.trim() && {
        id: 'kaggle-tier',
        title: `Kaggle ${cfg.tier.trim()}`,
        organization: 'Kaggle',
        url: profile,
        source,
      },
      typeof cfg.competitionMedals === 'string' && cfg.competitionMedals.trim() && {
        id: 'kaggle-medals',
        title: `${cfg.competitionMedals.trim()} in Kaggle competitions`,
        organization: 'Kaggle',
        url: profile,
        source,
      },
    ]) ?? []

    const globalRank = count(cfg.globalRank)

    return clean({
      models,
      achievements,
      socials: { kaggle: profile },
      stats: globalRank
        ? { entries: [{ id: 'kaggle-rank', label: 'Kaggle global rank', value: globalRank, kind: 'stated', note: 'Kaggle', connectors: ['kaggle'] }] }
        : undefined,
      meta: { connectors: ['kaggle'] },
    })
  },
}

/** @param {string} value */
function base64(value) {
  if (typeof btoa === 'function') return btoa(value)
  // Node before the global btoa, and any environment where it is absent.
  return Buffer.from(value, 'utf8').toString('base64')
}

const slug = (value) =>
  String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)

export default kaggle
