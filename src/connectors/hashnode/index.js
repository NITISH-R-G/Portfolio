/**
 * Hashnode.
 *
 * Official public GraphQL API (gql.hashnode.com), no key required for public content, and
 * unlike a feed it carries reaction and response counts — real engagement numbers rather
 * than just a list of titles.
 *
 * @module connectors/hashnode
 */

import { handle, stamp, clean, count, some } from '../support.js'

const ENDPOINT = 'https://gql.hashnode.com/'

const QUERY = `query userPosts($username: String!, $pageSize: Int!) {
  user(username: $username) {
    username
    name
    profilePicture
    posts(pageSize: $pageSize, page: 1) {
      nodes {
        id
        title
        brief
        url
        publishedAt
        reactionCount
        responseCount
        tags { name }
      }
    }
  }
}`

/** @type {import('../types.js').Connector} */
const hashnode = {
  id: 'hashnode',
  name: 'Hashnode',
  category: 'writing',
  icon: 'Newspaper',
  availability: 'api',
  homepage: 'https://hashnode.com',
  summary: 'Your posts with tags, reaction counts and comment counts.',
  limits: 'Official public GraphQL API, no key required for public posts.',
  supportedData: ['posts', 'identity', 'socials'],
  fields: [
    { key: 'username', label: 'Hashnode username', required: true },
    { key: 'limit', label: 'Maximum posts', type: 'number', help: 'Default 20.' },
  ],

  identify: (cfg) => handle(cfg, ['username', 'user'], /hashnode\.com\/@?([^/?#]+)/i),
  profileUrl: (cfg) => {
    const user = hashnode.identify(cfg)
    return user ? `https://hashnode.com/@${user}` : undefined
  },

  async fetch(cfg, ctx) {
    const username = /** @type {string} */ (hashnode.identify(cfg))
    const pageSize = Math.min(Math.max(Number(cfg.limit) || 20, 1), 50)

    const body = /** @type {any} */ (
      await ctx.http.json(ENDPOINT, {
        method: 'POST',
        body: { query: QUERY, variables: { username, pageSize } },
        platform: 'Hashnode',
      })
    )
    // GraphQL answers 200 with an `errors` array, so a bad username is not an HTTP failure.
    if (!body?.data?.user) {
      throw new Error(body?.errors?.[0]?.message ?? `Hashnode has no user "${username}".`)
    }
    return { username, user: body.data.user }
  },

  normalize(raw, _cfg, ctx) {
    const { username, user } = /** @type {any} */ (raw)
    const now = ctx.now
    const profile = `https://hashnode.com/@${username}`

    const posts = (user?.posts?.nodes ?? [])
      .filter((post) => typeof post?.title === 'string' && post.title.trim())
      .map((post) => clean({
        id: `hashnode-${post.id ?? slug(post.title)}`,
        title: post.title.trim(),
        url: post.url,
        date: post.publishedAt ? String(post.publishedAt).slice(0, 10) : undefined,
        excerpt: post.brief,
        tags: some((post.tags ?? []).map((t) => t?.name).filter(Boolean)),
        reactions: count(post.reactionCount),
        comments: count(post.responseCount),
        source: stamp('hashnode', post.url ?? profile, now),
      }))

    return clean({
      posts,
      identity: user?.profilePicture ? { avatar: user.profilePicture } : undefined,
      socials: { hashnode: profile },
      meta: { connectors: ['hashnode'] },
    })
  },
}

const slug = (title) =>
  String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)

export default hashnode
