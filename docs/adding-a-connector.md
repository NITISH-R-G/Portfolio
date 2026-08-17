# Adding a connector

A connector is the only code that knows how one platform stores its data. Adding one means
adding one directory — no UI, no config schema, no CLI, and no section component needs to
change.

That boundary is the point. Nothing downstream ever learns which platform a record came
from, except through `record.source`.

---

## Before you write anything

Answer this honestly, because it determines what you build:

**Does the platform have a usable public interface?**

| Answer | `availability` | What you write |
| --- | --- | --- |
| An official or stable public API | `api` | `fetch` + `normalize` |
| A public RSS/Atom/JSON feed | `feed` | `fetch` using `parseFeed` |
| An official API needing the user's key | `token` | `fetch` reading `ctx.env(...)` |
| No public interface | `manual` | `defineManualConnector` |
| No public interface and nothing to type | `url-only` | `defineManualConnector` |

**Never** build against an undocumented endpoint that requires defeating bot protection, or
one whose terms prohibit automated access. A connector that breaks silently, or gets a user
banned, is worse than an honest `manual` one. This is not a stylistic preference — it is
the rule the project is built on, and a pull request that violates it will not be merged.

If the platform is borderline — a public but undocumented endpoint, like LeetCode's
GraphQL — build it, and say so plainly in `limits`.

---

## A fetching connector

`src/connectors/example/index.js`:

```js
/**
 * Example.
 *
 * One paragraph: what this imports, and anything a reader would be surprised by.
 *
 * @module connectors/example
 */

import { handle, stamp, clean, count, some, isoDay } from '../support.js'

const API = 'https://api.example.com'

/** @type {import('../types.js').Connector} */
const example = {
  id: 'example',                 // the key under `dataSources`
  name: 'Example',
  category: 'code',              // groups it in the wizard and the builder
  icon: 'Code',                  // resolved by components/Icon
  availability: 'api',
  homepage: 'https://example.com',
  summary: 'Projects and stars.',
  limits: 'Public API, no key required. Rate limited to 100 requests/hour.',
  supportedData: ['projects', 'skills', 'socials'],
  authEnv: ['EXAMPLE_TOKEN'],    // optional; name every variable you read

  fields: [
    { key: 'username', label: 'Example username', required: true, placeholder: 'ada' },
    { key: 'limit', label: 'Maximum projects', type: 'number', help: 'Default 50.' },
  ],

  // The account this config points at, or undefined when not configured.
  // Accept a pasted profile URL — it is the most common thing a user types.
  identify: (cfg) => handle(cfg, ['username', 'user'], /example\.com\/([^/?#]+)/i),

  profileUrl: (cfg) => {
    const user = example.identify(cfg)
    return user ? `https://example.com/${user}` : undefined
  },

  async fetch(cfg, ctx) {
    const username = example.identify(cfg)
    const token = ctx.env('EXAMPLE_TOKEN')

    const user = await ctx.http.json(`${API}/users/${encodeURIComponent(username)}`, {
      platform: 'Example',
      headers: clean({ authorization: token ? `Bearer ${token}` : undefined }),
    })

    // Anything pushed onto `warnings` turns the result into `partial` and is shown to the
    // user — the right way to report "it worked, but not completely".
    const warnings = []
    if (!token) warnings.push('No EXAMPLE_TOKEN set, so private counts were skipped.')

    return { username, user, warnings }
  },

  normalize(raw, cfg, ctx) {
    const { username, user } = raw
    const url = `https://example.com/${username}`

    return clean({
      projects: (user.repos ?? []).map((repo) => clean({
        id: `example-${String(repo.name).toLowerCase()}`,
        name: repo.name,
        description: repo.description,
        repository: repo.url,
        stars: count(repo.stars),
        updatedAt: isoDay(repo.updated_at),
        source: stamp('example', repo.url, ctx.now),
      })),
      socials: { example: url },
      meta: { connectors: ['example'] },
    })
  },
}

export default example
```

Register it in `src/connectors/index.js`:

```js
import example from './example/index.js'

export const CONNECTORS = [
  github, gitlab, /* … */, example,
]
```

That is the whole integration. The setup wizard now offers it, the builder lists it with
its limits, `npm run import` runs it, and `npm run doctor` reports on it.

---

## A manual connector

For a platform with no usable public interface:

```js
import { defineManualConnector } from '../manual.js'

export default defineManualConnector({
  id: 'example',
  name: 'Example',
  category: 'competitive',
  icon: 'Trophy',
  homepage: 'https://example.com',
  summary: 'Rating and contests, entered by you and linked to your profile.',
  limits:
    'No automatic import. Example publishes no public profile API. Enter your figures ' +
    'here — they are shown alongside a link to your profile so a reader can check them.',
  supportedData: ['competitive', 'socials'],
  competitive: true,                    // accept rating/problemsSolved/contests/rank
  urlFor: (username) => `https://example.com/u/${username}`,
  urlPattern: /example\.com\/u\/([^/?#]+)/i,
})
```

Users then get a `data` field accepting anything in the schema, plus whatever shorthand
fields you declare. Add an `extra` hook to expand shorthand into records:

```js
  fields: [{ key: 'badges', label: 'Badges', type: 'list' }],
  extra: (cfg, source) => ({
    achievements: list(cfg.badges).map((badge) => ({
      title: badge, organization: 'Example', url: source.url,
    })),
  }),
```

Nothing a manual connector produces carries a `fetchedAt`, so every figure derived from it
is automatically labelled **self-reported** rather than **reported**. That happens for
free — do not fake a timestamp to get a nicer label.

---

## Rules

**Never throw from `normalize`.** It runs over data you do not control. Drop malformed
records; return what you can. The runner catches throws and degrades the source to an
error, but a shape change upstream should cost one record, not the whole import.

**All network access goes through `ctx.http`.** That gives you timeouts, retries,
rate-limit handling and user-facing error messages for free — and makes the connector
testable with a stub `fetch` instead of a live account.

**Stamp everything with `stamp(id, url, ctx.now)`.** Provenance is what makes a figure
traceable, and its presence is the signal that distinguishes fetched data from typed data.

**Check the body, not just the status.** Several APIs answer `200` with
`{"status": "FAILED"}` — Codeforces does — so trusting HTTP alone would import an empty
profile and report success.

**Evidence must match what renders.** If you derive a skill saying "24 repositories",
count only repositories that actually become projects. A number a reader cannot verify by
counting is the failure this project exists to avoid.

**Never fetch private data by default.** Public profiles only, unless the user explicitly
opts in.

**Fail small.** Wrap each optional sub-request; push a warning rather than throwing. A
missing avatar should not cost the user their projects.

---

## Schema targets

Return a plain object in `Profile` shape. Populate only what you have:

`identity` · `education` · `experience` · `projects` · `skills` · `achievements` ·
`certifications` · `publications` · `posts` · `packages` · `videos` · `models` ·
`hackathons` · `talks` · `competitive` · `languages` · `socials` · `stats`

Field reference: **[data-schema.md](data-schema.md)**.

Everything is coerced by `normalizeProfile` afterwards, so loose values are fine — strings
become dates, `"1,250"` becomes `1250`, and a `javascript:` URL is rejected before it can
reach an `href`. You do not need to be defensive about types, only about shape.

### Stats

Only emit a stat that **cannot be recomputed** from the records you returned — a follower
count, a contribution total, a reputation score. Anything countable (projects, stars,
publications, citations) is derived downstream, and emitting it yourself would risk the
page showing a number its own records contradict.

```js
stats: { entries: [{
  id: 'followers',
  label: 'Followers',
  value: 120,
  kind: 'fetched',        // 'fetched' only if an API really returned it
  connectors: ['example'],
}] },
```

---

## Testing

Add cases to `tests/connectors.test.js`. Use a stub `fetch` — no network, no account:

```js
test('imports projects and skips forks', async () => {
  const { sources, status } = await runOne(
    { example: { username: 'ada' } },
    stubFetch({ 'api.example.com/users/ada': { repos: [{ name: 'x', stars: 5 }] } }),
  )
  assert.equal(status.example.state, 'imported')
  assert.equal(sources[0].profile.projects.length, 1)
})
```

The existing suite already enforces the contract on every registered connector — that ids
are unique, that a `manual` connector has no `fetch`, that anything non-automatic documents
its limits. Your connector is checked by those the moment you register it.

Worth covering yourself: a missing account, a malformed response, and any pagination.

```bash
npm test
```

---

## Checklist

- [ ] Honest `availability`, and `limits` that say what it cannot do
- [ ] `identify` accepts a pasted profile URL
- [ ] `normalize` never throws
- [ ] Every record carries `source`
- [ ] Derived evidence counts only what renders
- [ ] Optional sub-requests warn instead of failing
- [ ] Registered in `src/connectors/index.js`
- [ ] Tests with a stub `fetch`
- [ ] Added to the table in `docs/connectors.md`
