/**
 * YouTube.
 *
 * Two routes, and the connector picks whichever the user has made available:
 *
 * - No key: the public channel feed at `/feeds/videos.xml`, which every channel serves.
 *   Gives the fifteen most recent videos with titles, links, thumbnails and dates.
 * - With a YOUTUBE_API_KEY: the official Data API, adding view counts, the full upload
 *   history and channel-level subscriber and view totals.
 *
 * The feed path is the default because it needs no account, no billing project and no key,
 * which is what "clone and run" requires.
 *
 * @module connectors/youtube
 */

import { handle, stamp, clean, count, isoDay } from '../support.js'
import { parseFeed } from '../feed.js'

const DATA_API = 'https://www.googleapis.com/youtube/v3'

/** @type {import('../types.js').Connector} */
const youtube = {
  id: 'youtube',
  name: 'YouTube',
  category: 'video',
  icon: 'Video',
  availability: 'feed',
  homepage: 'https://www.youtube.com',
  summary: 'Recent videos with titles, thumbnails and dates; view counts when a key is set.',
  limits:
    'Without a key, reads the public channel feed — the fifteen most recent videos, no view ' +
    'counts. Set YOUTUBE_API_KEY in .env to use the official Data API instead, which adds ' +
    'view counts, subscriber totals and the full upload history.',
  supportedData: ['videos', 'stats', 'socials'],
  authEnv: ['YOUTUBE_API_KEY'],
  fields: [
    {
      key: 'channelId',
      label: 'YouTube channel id',
      required: true,
      placeholder: 'UC_x5XG1OV2P6uZZ5FSM9Ttw',
      help: 'Starts with "UC". Find it under Settings → Advanced settings on your channel.',
    },
    { key: 'limit', label: 'Maximum videos', type: 'number', help: 'Default 12.' },
  ],

  identify: (cfg) => handle(cfg, ['channelId', 'channel', 'id'], /youtube\.com\/channel\/([^/?#]+)/i),
  profileUrl: (cfg) => {
    const id = youtube.identify(cfg)
    return id ? `https://www.youtube.com/channel/${id}` : undefined
  },

  async fetch(cfg, ctx) {
    const channelId = /** @type {string} */ (youtube.identify(cfg))
    const key = ctx.env('YOUTUBE_API_KEY')
    const limit = Math.min(Math.max(Number(cfg.limit) || 12, 1), 50)

    if (key) {
      try {
        return await fetchViaApi(ctx, channelId, key, limit)
      } catch (err) {
        // A misconfigured key (quota exhausted, API not enabled on the project) is a very
        // common failure, and falling back to the feed keeps the videos rather than the
        // error — with a warning, so the user knows why the view counts vanished.
        const feed = await fetchFeed(ctx, channelId)
        return { ...feed, warnings: [`The Data API request failed (${/** @type {Error} */ (err).message}); fell back to the public channel feed, so view counts are unavailable.`] }
      }
    }
    return fetchFeed(ctx, channelId)
  },

  normalize(raw, cfg, ctx) {
    const { channelId, videos, channel } = /** @type {any} */ (raw)
    const now = ctx.now
    const url = `https://www.youtube.com/channel/${channelId}`
    const limit = Math.min(Math.max(Number(cfg.limit) || 12, 1), 50)

    const records = (videos ?? []).slice(0, limit).map((video) => clean({
      id: `youtube-${video.id ?? slug(video.title)}`,
      title: video.title,
      url: video.url,
      thumbnail: video.thumbnail,
      date: video.date,
      description: video.description,
      views: count(video.views),
      source: stamp('youtube', video.url ?? url, now),
    }))

    const subscribers = count(channel?.subscriberCount)

    return clean({
      videos: records,
      socials: { youtube: url },
      stats: subscribers
        ? { entries: [{ id: 'subscribers', label: 'Subscribers', value: subscribers, kind: 'fetched', note: 'YouTube', connectors: ['youtube'] }] }
        : undefined,
      meta: { connectors: ['youtube'] },
    })
  },
}

/**
 * The keyless path. Every channel serves this; it is the interface YouTube provides for
 * exactly this purpose.
 */
async function fetchFeed(ctx, channelId) {
  const xml = await ctx.http.text(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`,
    { platform: 'YouTube', headers: { accept: 'application/atom+xml, application/xml, text/xml' } },
  )
  const feed = parseFeed(xml, { limit: 20 })
  return {
    channelId,
    channel: { title: feed.title },
    videos: feed.items.map((item) => clean({
      id: item.url?.split('v=')[1]?.split('&')[0],
      title: item.title,
      url: item.url,
      thumbnail: item.thumbnail,
      date: item.date,
      description: item.excerpt,
      views: item.views,
    })),
  }
}

/**
 * The keyed path. Three requests: channel (for the uploads playlist and totals), the
 * playlist items, then a batched statistics lookup for view counts.
 */
async function fetchViaApi(ctx, channelId, key, limit) {
  const opts = { platform: 'YouTube', retries: 1 }
  const channelRes = /** @type {any} */ (
    await ctx.http.json(
      `${DATA_API}/channels?part=snippet,statistics,contentDetails&id=${encodeURIComponent(channelId)}&key=${encodeURIComponent(key)}`,
      opts,
    )
  )
  const channel = channelRes?.items?.[0]
  if (!channel) throw new Error(`No channel with id ${channelId}.`)

  const uploads = channel.contentDetails?.relatedPlaylists?.uploads
  if (!uploads) throw new Error('The channel has no uploads playlist.')

  const playlist = /** @type {any} */ (
    await ctx.http.json(
      `${DATA_API}/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(uploads)}&maxResults=${limit}&key=${encodeURIComponent(key)}`,
      opts,
    )
  )

  const ids = (playlist?.items ?? [])
    .map((item) => item?.contentDetails?.videoId)
    .filter(Boolean)

  /** @type {Record<string, number>} */
  const views = {}
  if (ids.length) {
    // One batched request for up to fifty videos, rather than one per video.
    const stats = /** @type {any} */ (
      await ctx.http.json(
        `${DATA_API}/videos?part=statistics&id=${ids.join(',')}&key=${encodeURIComponent(key)}`,
        opts,
      )
    )
    for (const item of stats?.items ?? []) {
      const n = count(item?.statistics?.viewCount)
      if (item?.id && n !== undefined) views[item.id] = n
    }
  }

  return {
    channelId,
    channel: {
      title: channel.snippet?.title,
      subscriberCount: channel.statistics?.hiddenSubscriberCount ? undefined : channel.statistics?.subscriberCount,
    },
    videos: (playlist?.items ?? []).map((item) => {
      const id = item?.contentDetails?.videoId
      const snippet = item?.snippet ?? {}
      return clean({
        id,
        title: snippet.title,
        url: id ? `https://www.youtube.com/watch?v=${id}` : undefined,
        thumbnail: snippet.thumbnails?.high?.url ?? snippet.thumbnails?.default?.url,
        date: isoDay(snippet.publishedAt),
        description: typeof snippet.description === 'string'
          ? snippet.description.split('\n')[0].slice(0, 200) || undefined
          : undefined,
        views: id ? views[id] : undefined,
      })
    }),
  }
}

const slug = (title) =>
  String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)

export default youtube
