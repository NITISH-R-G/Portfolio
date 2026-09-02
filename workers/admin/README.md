# Admin publishing API

A Cloudflare Worker that lets you edit your portfolio at `/admin.html`, press **Publish**, and
have the change committed to your repository and deployed — without downloading a file, editing
JSON by hand, or running a command.

It is **optional**. With no Worker deployed, the builder behaves exactly as it always has: it
shows you the two files to save and you commit them yourself. Publishing replaces that
copy-and-paste step, not the architecture underneath it.

## Why this exists rather than an off-the-shelf CMS

The requirement was a portfolio anyone can fork and run with no bill. That rules out hosted
auth (Auth0, Clerk, Firebase), hosted databases (Supabase, PlanetScale) and hosted CMSes
(Sanity, Contentful) — every one of them is free until it isn't, and all of them add a second
place your content lives.

What is left is: GitHub is already the database, GitHub already knows who you are, and the only
missing piece is somewhere to hold a private key that a browser must never see. That is about
three hundred lines of Worker.

## What it costs

Nothing, on these free tiers:

| Thing | Free allowance | What this uses |
| --- | --- | --- |
| Cloudflare Workers | 100,000 requests/day | a handful per editing session |
| GitHub App | unlimited | one installation on one repository |
| GitHub Actions | unlimited on public repos, 2,000 min/month on private | one build per publish |
| GitHub Pages | free for public repositories | the site itself |

No database, no key-value store, no queue, no paid add-on. If you exceed 100,000 Worker
requests a day editing your own portfolio, something is wrong.

**The honest caveat:** a free tier is a company's policy, not a law. This is free today on
these terms; if Cloudflare changes them, the manual save path still works and still costs
nothing, because it never needed a server.

## Setup

This is the part nobody can do for you, and it is roughly ten minutes. It is written out in
full rather than described as "one click", because it is not one click. See
[Who does what](#who-does-what) below for what is manual, what is already done, and what
happens on its own afterwards.

### 1. Create a GitHub App

At **Settings → Developer settings → GitHub Apps → New GitHub App**:

- **Homepage URL** — your portfolio URL.
- **Callback URL** — `https://YOUR-WORKER.workers.dev/auth/callback`. You will not know this
  until step 4, so put a placeholder and come back.
- **Webhook** — uncheck *Active*. This App receives no webhooks.
- **Repository permissions** → **Contents: Read and write**. Nothing else. Not Actions, not
  Administration, not Workflows.
- **Where can this App be installed** — *Only on this account*.

Then, on the App's page:

- Note the **App ID**.
- **Generate a client secret**, and note it along with the **Client ID**.
- **Generate a private key**. It downloads as PKCS#1, which WebCrypto cannot read. Convert it
  once:

  ```bash
  openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in downloaded-key.pem -out key.pkcs8.pem
  ```

- **Install App** → your account → **Only select repositories** → your portfolio repository.

### 2. Configure the Worker

Edit `wrangler.toml` in this directory and set `REPOSITORY`, `ADMIN_ORIGIN` and `BRANCH`.

### 3. Set the secrets

From this directory:

```bash
npx wrangler secret put GITHUB_APP_ID
```

Repeat for `GITHUB_PRIVATE_KEY` (paste the whole `key.pkcs8.pem`, including the BEGIN and END
lines), `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `SESSION_SECRET` — generate that last
one with:

```bash
openssl rand -base64 48
```

### 4. Deploy

```bash
npx wrangler deploy
```

Wrangler prints the Worker's URL. Go back to the GitHub App and set the real **Callback URL**.

### 5. Point the portfolio at it

In `portfolio.config.js`:

```js
admin: {
  api: 'https://portfolio-admin.YOUR-SUBDOMAIN.workers.dev',
},
```

Commit and deploy. Open `/admin.html`, go to **Save**, and the Publish panel is there.

## Who does what

The three categories are worth keeping apart, because "setup" is often quoted as though it were
one thing.

### Required once, by you, the portfolio owner

Five steps, roughly ten minutes, and **none of them can be automated away**. Each is an act of
granting authority that only the owner of the repository and the Cloudflare account can perform:

| | Why it cannot be done for you |
| --- | --- |
| Create the GitHub App | Only you can grant write access to your repository |
| Convert the private key | GitHub issues PKCS#1; WebCrypto imports only PKCS#8 |
| Store the five secrets | They must live where only your server can read them |
| Deploy the Worker | It runs under your Cloudflare account, not anyone else's |
| Set `admin.api` | The page has to know where to send the request |

A `create-portfolio` script could prompt for the values and run `wrangler` for you, and it still
could not click *Generate a private key* on your behalf. **This is not one click, and it is not
described as one.**

### Already done, by the project maintainer

Nothing here is your problem — it is committed and works out of the box:

- The Worker itself, its routes, session signing, the path allowlist and payload validation.
- The admin UI's Publish panel, and its behaviour when publishing is not configured.
- The `src/data/config.json` layer and its merge into the config.
- The deployment workflow, including generating the semantic index and refusing to deploy
  without it.
- 69 tests covering the security boundary and the publishing client.

### Automatic afterwards, forever

Once the five steps are done, this is the whole loop and none of it needs you:

- Sign in — GitHub remembers the App installation; the session lasts eight hours and renews by
  signing in again.
- Publish — the Worker mints a fresh token per request, commits, and returns the commit URL.
- Build and deploy — the existing Actions workflow runs on the commit; Pages serves the result.
- Token rotation — installation tokens expire in an hour and are never reused. Nothing to
  rotate by hand.

The one thing that is *not* automatic: the GitHub App client secret does not expire, but you
should rotate it if you ever suspect it leaked, by generating a new one and re-running
`npx wrangler secret put GITHUB_CLIENT_SECRET`.

## Security model

**The boundary.** The browser holds a signed session cookie and nothing else. The App private
key, the client secret and every installation token stay in the Worker. There is no code path
that returns a credential to the client, and a test asserts it.

**Writable paths are an allowlist of three exact strings** — `src/data/manual.json`,
`src/data/overrides.json`, `src/data/config.json`. Not a prefix, not a pattern. `src/data/` as
a prefix would admit `src/data/../../.github/workflows/deploy.yml`, and a workflow file is code
that runs on every future push. All three are JSON, so the admin can never write a file the
build executes — which is also why config edits go to `src/data/config.json` rather than to
`portfolio.config.js`.

**Authorization is the App installation**, not the sign-in. Anyone can sign in with GitHub;
only someone who installed this App on this repository gets a session carrying an installation
id, and `mayWrite` refuses without one. The repository is read from the session, never from the
request body.

**Tokens are minted per request** and scoped to one repository with `contents: write`. Nothing
long-lived exists to be stolen.

**CSRF** is blocked by a mandatory `Origin`/`Referer` check on the only state-changing route.
The session cookie is `SameSite=None` because the admin page and the Worker are on different
registrable domains, and no other value would let the cookie be sent at all — see the comment
on `cookie()` in `src/index.js`. On a single custom domain, set `SAMESITE = "Lax"` and get
browser-level protection on top.

**OAuth `state`** is signed, expiring, and *also* stored in a cookie, so a callback must arrive
in the same browser that started the sign-in. A captured callback URL cannot be replayed
elsewhere, and cannot be replayed at all after ten minutes.

**Concurrent saves** are refused, not merged. The editor sends the commit it was looking at; if
the branch moved, the Worker returns 409 and asks the user to reload. The ref update itself is
`force: false`, so GitHub refuses independently even if that check were bypassed.

**Payload limits** are enforced before any GitHub call: 512 kB total, at most three files, no
duplicates, and every file must parse as a JSON object.

### What this does not defend against

- Someone with your GitHub account. The App is authority you delegated; anyone who is you can
  use it.
- A compromised Cloudflare account. The secrets are there.
- A malicious commit made directly to the repository. This Worker guards its own endpoint, not
  every write path your repository has.

## Verification status

Stated precisely, because "tested" covers very different things here.

**Verified against the real Worker handler** — `tests/admin-worker.test.js` sends real `Request`
objects through the exported `fetch` and asserts on the real `Response`, with the network
stubbed to throw so anything that unexpectedly reached GitHub fails the test. That covers:
unauthenticated publish, forged session, expired session, wrong repository, signed-in-without-
installation, cross-site and lookalike origins, missing Origin, path traversal, writes to
executable files, malformed JSON, non-object content, oversized payloads, duplicate targets,
cookie flags, CORS, misconfiguration, and that a repository named in the request body cannot
steer the write.

**Verified against a stateful local stand-in** — sign-in, pending files, publish, the committed
state, the offline state, the 409 conflict, and merge-not-replace across two sessions with the
browser's drafts cleared between them.

**Not verified** — the paths that need a real GitHub App: the OAuth code exchange, the
installation lookup, installation-token minting, and the commit itself. Running those requires a
GitHub App and a Cloudflare account that only the repository owner can create, so they are
covered by unit tests against an injected `fetch` and nothing more. Do not read this document as
saying the live integration has been exercised. It has not.
