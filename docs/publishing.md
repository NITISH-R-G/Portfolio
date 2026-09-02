# Publishing

How an edit made at `/admin.html` becomes a deployed change — and why the architecture is shaped
the way it is.

## Two ways to save, and neither one is a downgrade

**Manual** — the default, and complete on its own. The builder shows you the two files your
changes produce, you copy them into the repository, and the existing workflow deploys. Works in
a fresh clone with no account anywhere.

**Publish** — optional. Sign in with GitHub, press Publish, and the same two files are committed
for you. Same files, same pipeline, same source of truth. It replaces a copy-and-paste step, not
the architecture.

The manual path stays in the UI even when publishing is configured, because it is also the
fallback when the service is unreachable.

## The flow

```
Admin UI  →  validated patch  →  overrides / config JSON
          →  Worker (auth, allowlist, validation)
          →  GitHub commit
          →  existing Actions build  →  normalizeProfile  →  manifest
          →  Pages deploy
```

Nothing new sits in that chain. The Worker hands the same JSON to the same repository that a
human copy-paste would have produced, and everything after the commit is the pipeline that was
already there.

## The data model, and why there is no second schema

The admin writes exactly three files:

| File | What it holds |
| --- | --- |
| `src/data/overrides.json` | content edits, hides, pins |
| `src/data/config.json` | published settings — theme, layout, sections |
| `src/data/manual.json` | hand-authored records |

`src/data/config.json` is the only new one, and it is not a new schema. The config loader has
always merged three layers: `portfolio.config.js`, then a browser draft in localStorage, then
what you see. `config.json` slots between the first two, with the same shape and the same
`deepMerge`. It is the unsaved draft made durable.

It exists rather than writing `portfolio.config.js` directly for a security reason and a
practical one. The security reason: that file is *imported by the build*, so a write to it is
arbitrary code execution on the next deploy, and no amount of payload validation makes that
safe. The practical one: rewriting hand-authored JavaScript would destroy the comments and
computed values in it.

Every writable path is therefore JSON. The admin can never write a file the build executes.

## Authentication

A **GitHub App**, not an OAuth App. An OAuth App's `repo` scope is all-or-nothing: you would be
granting write access to every repository you own in order to edit one portfolio. An App is
installed per repository and cannot see the rest.

```
Browser                Worker                    GitHub
   │  /auth/login        │                          │
   ├────────────────────>│  signed state + cookie   │
   │<── 302 ─────────────┤                          │
   ├──────────────────── authorize ────────────────>│
   │<─────────────────── 302 with code ─────────────┤
   ├─ /auth/callback ───>│                          │
   │                     ├─ verify state cookie     │
   │                     ├─ exchange code ─────────>│  (user token, used once, discarded)
   │                     ├─ App installed here? ───>│
   │<── 302 + session ───┤                          │
   │                     │                          │
   ├─ POST /api/save ───>│  origin, session,        │
   │                     │  allowlist, JSON, size   │
   │                     ├─ mint installation token>│
   │                     ├─ blobs, tree, commit, ref>
   │<── commit URL ──────┤                          │
```

The browser ends up holding one thing: a signed, expiring session cookie. The App private key,
the client secret and every installation token stay in the Worker.

## Sessions without a database

A session is a signed token — subject, repository, installation id, expiry — authenticated with
HMAC-SHA256 and carried in a `__Host-` prefixed cookie. The Worker verifies it without storing
anything.

That removes the one component of this design that would otherwise have to be paid for, and
removes session storage as a thing that can leak or drift. It also means the Worker needs no KV,
no D1, no Durable Object, no queue — it is a script and five secrets.

## Security model in one page

| Threat | What stops it |
| --- | --- |
| Unauthenticated write | `verify` on the session cookie; no session, 401 |
| Forged or edited session | HMAC over the payload; any edit invalidates the signature |
| Expired session | expiry inside the signed payload, checked on every request |
| Writing another repository | repository read from the session, never from the request body |
| Signed in but not authorized | session must carry an installation id proving the App is installed here |
| Arbitrary file write | allowlist of three exact path strings — not a prefix, not a pattern |
| Path traversal | exact-string comparison; there is nothing to traverse |
| Deploy-time RCE | every writable path is JSON; no executable file is writable |
| CSRF | mandatory `Origin`/`Referer` check on the only state-changing route |
| Forged OAuth callback | `state` must be signed *and* match a cookie set in the same browser |
| Replayed `state` | ten-minute expiry inside the signed state |
| Open redirect | `?return=` accepts same-origin paths only |
| Oversized payload | 512 kB total, checked before any GitHub call |
| Malformed payload | every file must parse as a JSON object |
| Concurrent saves | client sends the commit it loaded; mismatch is a 409, and the ref update is `force: false` |
| GitHub outage | reported as a degraded session, not as a signed-out one |

45 assertions in `tests/admin-security.test.js` cover these, with the GitHub client exercised
against an injected `fetch` so the commit sequence is asserted without touching a repository.

**What it does not defend against:** someone with your GitHub account, a compromised Cloudflare
account, or a commit made to the repository by some other route. The Worker guards its own
endpoint.

## Cost

| | Free allowance | What this uses |
| --- | --- | --- |
| Cloudflare Workers | 100,000 requests/day | a handful per editing session |
| GitHub App | unlimited | one installation, one repository |
| GitHub Actions | unlimited on public repos | one build per publish |
| GitHub Pages | free for public repositories | the site |

No database, no auth SaaS, no CMS, no per-search inference charge, no per-user infrastructure.

**Honest caveat:** a free tier is a company's policy, not a law. If Cloudflare changes theirs, the
manual save path still works and still costs nothing, because it never needed a server.

## Setup

Roughly ten minutes, and five steps of it cannot be automated away — creating the App,
converting the private key, storing the secrets, deploying the Worker, and telling the page
where it lives. Each is an act of granting authority that only the repository owner can perform.

Full instructions, including the exact GitHub App permissions and the `openssl` command for the
key: **[workers/admin/README.md](../workers/admin/README.md)**.

## Verification status

Unit-tested end to end in logic; **not** verified against live GitHub and Cloudflare, because
that requires a GitHub App and a Cloudflare account that only the repository owner can create.
