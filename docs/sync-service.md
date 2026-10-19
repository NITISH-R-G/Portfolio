# The sync service

An **optional** server-side component that lets a connected source tell your portfolio when it
changed, instead of the portfolio waiting for its weekly rebuild. Without it nothing here
applies and the project behaves exactly as before: it refreshes weekly and on every push.

Read [sync-and-builder.md](sync-and-builder.md) for why it is designed the way it is. This page
is for deploying and operating it.

- [What you get, and what you do not](#what-you-get-and-what-you-do-not)
- [The minimum deployable backend](#the-minimum-deployable-backend)
- [Setup](#setup)
- [Configuration reference](#configuration-reference)
- [Checking that it works](#checking-that-it-works)
- [Operating it](#operating-it)
- [Provider-neutral design](#provider-neutral-design)

## What you get, and what you do not

| | With the service | Without it |
| --- | --- | --- |
| A change on GitHub is noticed | **Seconds** (webhook) or **1–6 minutes** (polling) | Up to a week, or your next push |
| Site live after it is noticed | About **3 minutes** (a full rebuild; measured at 175 s) | Same |
| Stars and forks by *other people* | Webhook only | Weekly |
| A failed rebuild is retried | Yes, with backoff, bounded | No |

Honest limits, none of which are ours to remove:

- **The rebuild is the floor.** Whatever notices the change, the site is a static export and a
  rebuild takes minutes. "Real time" is not available on this architecture.
- **Polling is bounded by GitHub's own cache.** The public events feed is cached for about five
  minutes (`Cache-Control: max-age=300`, probed), and GitHub documents that events can lag
  further. Polling every minute makes this service prompt; it does not make GitHub faster.
- **Polling cannot see your audience.** The feed lists what *you* did. A star or fork from someone
  else only arrives by webhook.
- **Only GitHub is wired up.** Other connectors still refresh on the schedule. A connector
  declares a mechanism only after it has been checked against the real provider.

The admin shows which mechanism a source is *actually* using, promoted only on evidence the
service has recorded (a delivery seen, a poll completed) — never merely because it is configured.

## The minimum deployable backend

One Cloudflare Worker (`workers/sync`) with one KV namespace. That is all.

```
GitHub ──webhook──► Worker ──repository_dispatch──► deploy.yml ──► GitHub Pages
GitHub ◄──poll (cron, every minute)──┘                  │
Worker ◄──────────── workflow_run (completed) ◄─────────┘   (how latency is observed)
```

It is a **separate Worker** from `workers/admin`. That one is deliberately stateless; this one has
to remember delivery ids (so a redelivery is recognised), a coalescing window and a status
record. KV is the least that does it.

**Free-tier fit.** Workers: 100,000 requests/day; the cron uses 1,440. KV: 1,000 writes/day; an
idle service writes about 144 (a ten-minute heartbeat) and a test pins the ceiling. Cloudflare
and GitHub can change those terms; nothing here depends on them except cost.

**Consistency.** KV is eventually consistent, so two simultaneous deliveries can both see "no
publish yet". The worst outcome is one redundant `repository_dispatch`, which `deploy.yml`'s
concurrency group already coalesces (one running, one pending). If you need strict single-flight,
implement `SyncStore` over a Durable Object; nothing else changes.

## Setup

You need: a Cloudflare account, `wrangler` (`npx wrangler`), and the GitHub App from
[workers/admin/README.md](../workers/admin/README.md) already created and installed on the
repository. Reusing that App means no second set of credentials.

### 1. Create the KV namespace

```bash
cd workers/sync
npx wrangler kv namespace create SYNC_KV
```

Paste the printed `id` into `wrangler.toml`.

### 2. Set the public variables

In `wrangler.toml`: `REPOSITORY`, `ACCOUNT` (the GitHub login whose activity is polled) and
`ADMIN_ORIGIN` (your Pages origin, so the admin may read `/sync/status`).

### 3. Set the secrets

```bash
npx wrangler secret put GITHUB_WEBHOOK_SECRET   # openssl rand -hex 32 — keep this value for step 5
npx wrangler secret put GITHUB_APP_ID           # the same App as the admin Worker
npx wrangler secret put GITHUB_PRIVATE_KEY      # the same PKCS#8 PEM
npx wrangler secret put GITHUB_POLL_TOKEN       # OPTIONAL, see below
```

`GITHUB_POLL_TOKEN` is any token with **no scopes** (the feed is public). It only lifts the rate
limit: unauthenticated requests from a shared Cloudflare address can exhaust GitHub's 60/hour
allowance. Skip it if you rely on webhooks.

### 4. Deploy

```bash
npx wrangler deploy
```

Note the `https://portfolio-sync.<you>.workers.dev` URL.

### 5. Turn on the webhook

In the GitHub App's settings:

- **Webhook → Active**, **URL** `https://portfolio-sync.<you>.workers.dev/hooks/github`
- **Content type** `application/json` (the Worker refuses form-encoded bodies, with a reason in
  GitHub's delivery log)
- **Secret** — the value from step 3
- **Subscribe to events:** `push`, `repository`, `star`, `release`, `public`, `fork`, `workflow_run`

Permissions: everything except `workflow_run` is covered by what the App already holds
(Contents and Metadata). **`workflow_run` additionally requires Actions: read-only**, which is a
new permission that existing installations must accept. It is optional: without it the service
still notices changes and publishes, but cannot learn whether a rebuild succeeded, so it reports
no observed latency and cannot retry a failed deploy. GitHub's App settings page lists exactly
which events each permission unlocks; check there if you change this.

Keep the App's other permissions as they were. `repository_dispatch` needs only Contents: write.

**Which repositories the App is installed on decides what the webhook can see.** GitHub sends an
App's webhooks only for repositories where it is installed. The admin README installs the App on
the portfolio repository alone, so with that setup the service sees events from *that repository
only* — pushes, stars and forks on your other repositories never arrive, and polling is then the
only way their activity is noticed. To have the webhook cover the repositories your portfolio
shows, change the installation to **All repositories**, or select each of them.

The trade-off is real: a wider installation gives the App `Contents: write` on every repository
it covers. What stays narrow is each dispatch — the token minted for one is limited to the single
portfolio repository (`installationToken` requests `repositories: [repo]`). And the service only
accepts `workflow_run` reports from `REPOSITORY`, so a `deploy.yml` in some other repository
cannot be mistaken for yours.

### 6. Record the endpoint

Set `sync.endpoint` (Admin → Sources, or `src/data/config.json`) to the Worker URL. That is what
lets the admin show the live status; it enables nothing on its own.

## Configuration reference

| Name | Kind | Meaning |
| --- | --- | --- |
| `REPOSITORY` | var | `owner/name`. The one repository this service may ever dispatch to |
| `ACCOUNT` | var | Login whose activity is polled and whose repositories' webhooks are accepted. Defaults to the repository owner |
| `ADMIN_ORIGIN` | var | Origin allowed to read `/sync/status`. Unset means no cross-origin access |
| `POLL_ENABLED` | var | `"false"` to rely on webhooks alone |
| `COOLDOWN_SECONDS` | var | After a publish, how long later changes wait. Default 90 |
| `GITHUB_WEBHOOK_SECRET` | **secret** | HMAC key. Unset means *every* webhook is refused (503) — it fails closed |
| `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY` | **secret** | The App used to mint a short-lived, single-repository token for each dispatch. Never stored |
| `GITHUB_POLL_TOKEN` | **secret**, optional | Lifts the polling rate limit |
| `SYNC_KV` | binding | The KV namespace |

No secret is ever written to KV, to a log line, or into `/sync/status`; tests assert it.

## Checking that it works

1. **GitHub's own check.** App → Advanced → Recent deliveries → the `ping`. It should be a green
   `200` with `{"ok":true,"pong":true}`. A `401` means the secret differs; a `503` means the Worker
   has no secret; a `415` means the content type is wrong.
2. **Status.** `curl https://portfolio-sync.<you>.workers.dev/sync/status`. Before anything has
   happened `mechanisms.webhook.configured` is `true` and `lastSeenAt` is `null` — configured is
   not the same as working, and the admin will say so.
3. **A real change.** Push to a default branch, or create a repository. Within seconds
   `lastSeenAt` is set and `lastDispatch` appears; about three minutes later `lastPublish`
   reports the rebuild with its measured `latencyMs`. That number — not an estimate — is the
   observed update latency.
4. **The run.** Actions → *Deploy portfolio*. A run started by the service shows
   "Trigger: `repository_dispatch`" and the reported change in its summary.

## Operating it

**A rebuild failed.** The previously deployed site stays live. With `workflow_run` subscribed the
service retries with jittered backoff (honouring `Retry-After`) up to five times, then stops and
says so in `/sync/status` (`pending.stalled: true`). A new event revives it for one more try.
Re-running the workflow by hand always works.

**KV was cleared.** The state resets. Delivery ids are forgotten, so for up to a day a
redelivery could cause one redundant rebuild. Nothing is lost: correctness never depended on the
state, because every rebuild re-reads the providers.

**Replay a delivery.** Use GitHub's *Redeliver*. A delivery id seen in the last 24 hours is
recognised and ignored, so redelivering a handled event is harmless.

**Rotate the webhook secret.** Change it in the App settings and `wrangler secret put
GITHUB_WEBHOOK_SECRET` together. Deliveries in between are refused with 401 and GitHub retries
them on request.

**Turn it off.** Remove the webhook (or delete the Worker). The weekly schedule and push-to-main
builds are unaffected, because nothing depended on the service existing.

**Logs.** `npx wrangler tail`. One line per tick that did something; idle ticks are silent.

**Migrations.** None yet. Stored state carries `version: 1`; a future change that needs a
migration will read it and upgrade in place, defaulting any missing field.

## Provider-neutral design

The Worker is a router. Everything else is in `src/core/sync/` and depends on three small
interfaces, so a different host or provider replaces a file rather than the design:

- **`SyncStore`** — `get` / `put` (with TTL) / `delete` over JSON. KV and an in-memory map ship.
- **`Publish`** — an async function returning `{ ok, status?, retryAfterMs?, error? }`. The
  repository-dispatch publisher ships; it never throws.
- **A provider module** — turns that provider's webhook or feed into a `ChangeEvent`
  (`core/sync/github.js`). Adding a provider means a module like it, a `sync` declaration on its
  connector, and a live check of its real behaviour.

Verification is Web Crypto only, so the same code runs in a Worker, in Node, and in the tests.
