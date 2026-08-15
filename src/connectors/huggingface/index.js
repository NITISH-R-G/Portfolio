/**
 * Hugging Face.
 *
 * Official public API (https://huggingface.co/docs/hub/api), no key required for public
 * models, datasets and Spaces. `full=true` returns the like and download counts that make
 * the difference between "published a model" and "published a model people use".
 *
 * @module connectors/huggingface
 */

import { handle, stamp, clean, count, some, isoDay, skillWithEvidence } from '../support.js'

const API = 'https://huggingface.co/api'

/** The three artefact kinds, and how each maps into the schema. */
const KINDS = [
  { path: 'models', kind: 'model', label: 'Models' },
  { path: 'datasets', kind: 'dataset', label: 'Datasets' },
  { path: 'spaces', kind: 'space', label: 'Spaces' },
]

/** @type {import('../types.js').Connector} */
const huggingface = {
  id: 'huggingface',
  name: 'Hugging Face',
  category: 'ml',
  icon: 'Boxes',
  availability: 'api',
  homepage: 'https://huggingface.co',
  summary: 'Published models, datasets and Spaces with their likes and download counts.',
  limits: 'Public API, no token needed. Private repositories are never read.',
  supportedData: ['models', 'skills', 'stats', 'socials'],
  authEnv: ['HUGGINGFACE_TOKEN'],
  fields: [
    { key: 'username', label: 'Hugging Face username or organization', required: true },
    { key: 'limit', label: 'Maximum items per kind', type: 'number', help: 'Default 50.' },
  ],

  identify: (cfg) => handle(cfg, ['username', 'user', 'author'], /huggingface\.co\/([^/?#]+)/i),
  profileUrl: (cfg) => {
    const user = huggingface.identify(cfg)
    return user ? `https://huggingface.co/${user}` : undefined
  },

  async fetch(cfg, ctx) {
    const author = /** @type {string} */ (huggingface.identify(cfg))
    const token = ctx.env('HUGGINGFACE_TOKEN')
    const limit = Math.min(Math.max(Number(cfg.limit) || 50, 1), 100)
    const opts = {
      platform: 'Hugging Face',
      headers: clean({ authorization: token ? `Bearer ${token}` : undefined }),
    }

    /** @type {Record<string, unknown[]>} */
    const results = {}
    /** @type {string[]} */
    const warnings = []

    for (const { path } of KINDS) {
      try {
        const items = await ctx.http.json(
          `${API}/${path}?author=${encodeURIComponent(author)}&limit=${limit}&full=true&sort=likes&direction=-1`,
          { ...opts, retries: 1 },
        )
        results[path] = Array.isArray(items) ? items : []
      } catch (err) {
        // Each kind is independent — no models does not mean no datasets.
        results[path] = []
        warnings.push(`${path}: ${/** @type {Error} */ (err).message}`)
      }
    }

    return { author, ...results, warnings }
  },

  normalize(raw, _cfg, ctx) {
    const { author } = /** @type {any} */ (raw)
    const now = ctx.now
    const profile = `https://huggingface.co/${author}`

    const models = []
    for (const { path, kind } of KINDS) {
      for (const item of /** @type {any} */ (raw)[path] ?? []) {
        const id = item?.id ?? item?.modelId
        if (typeof id !== 'string') continue
        // Spaces live under /spaces/<id>, datasets under /datasets/<id>, models at the root.
        const url = kind === 'model' ? `https://huggingface.co/${id}` : `https://huggingface.co/${kind}s/${id}`
        models.push(clean({
          id: `hf-${kind}-${id.replace(/\//g, '-').toLowerCase()}`,
          name: id.includes('/') ? id.split('/').slice(1).join('/') : id,
          kind,
          url,
          description: item?.cardData?.summary ?? item?.description ?? item?.pipeline_tag ?? undefined,
          likes: count(item?.likes),
          downloads: count(item?.downloads),
          tags: tagsOf(item),
          updatedAt: isoDay(item?.lastModified),
          source: stamp('huggingface', url, now),
        }))
      }
    }

    // A pipeline tag ("text-classification", "image-segmentation") is the author's own
    // description of what the model does, which makes it usable evidence for a domain
    // skill in a way a free-text README is not.
    /** @type {Map<string, number>} */
    const pipelines = new Map()
    for (const { path } of KINDS) {
      for (const item of /** @type {any} */ (raw)[path] ?? []) {
        const tag = item?.pipeline_tag
        if (typeof tag === 'string' && tag) pipelines.set(tag, (pipelines.get(tag) ?? 0) + 1)
      }
    }

    const skills = [...pipelines.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag, n]) => skillWithEvidence(humanizeTag(tag), {
        category: 'AI & ML',
        weight: n,
        label: `${n} published ${n === 1 ? 'model' : 'models'}`,
        evidenceCount: n,
        connector: 'huggingface',
        url: profile,
        now,
      }))

    const totalDownloads = models.reduce((sum, m) => sum + (m.downloads ?? 0), 0)

    return clean({
      models,
      skills: some(skills),
      socials: { huggingface: profile },
      stats: totalDownloads > 0
        ? { entries: [{ id: 'model-downloads', label: 'Model downloads', value: totalDownloads, kind: 'fetched', note: 'in the last month', connectors: ['huggingface'] }] }
        : undefined,
      meta: { connectors: ['huggingface'] },
    })
  },
}

/** @param {any} item */
function tagsOf(item) {
  const tags = Array.isArray(item?.tags) ? item.tags : []
  return some(
    tags
      .filter((t) => typeof t === 'string')
      // The tag list is mostly machine bookkeeping — licences, regions, arxiv ids, base
      // model pointers. Only the human-meaningful ones belong on a portfolio card.
      .filter((t) => !/^(license:|region:|arxiv:|base_model|dataset:|doi:)/i.test(t))
      .slice(0, 8),
  )
}

/** `text-classification` → `Text Classification`. */
function humanizeTag(tag) {
  return tag.replace(/[-_]+/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

export default huggingface
