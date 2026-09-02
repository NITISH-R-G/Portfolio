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
full rather than described as "one click", because it is not one click.

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

### What is genuinely unavoidable

Five things, and no amount of tooling removes them, because each is an act of granting
authority that only the repository owner can perform:

1. Creating a GitHub App — only you can grant write access to your repository.
2. Converting the private key — GitHub issues a format WebCrypto cannot import.
3. Storing the secrets — they must live somewhere only your server can read.
4. Deploying the Worker — it runs under your Cloudflare account, not anyone else's.
5. Setting `admin.api` — the page has to know where to send the request.

A `create-portfolio` script could prompt for values and run `wrangler` for you, and it would
still not be able to click *Generate a private key* on your behalf. Calling that "one click"
would be a lie, so it is not claimed here.

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

The security logic — sessions, the allowlist, payload validation, CSRF, the commit sequence,
the concurrency guard — is covered by 45 assertions in `tests/admin-security.test.js`, run by
`npm test`. The GitHub client is exercised against an injected `fetch`, so the request sequence
is asserted without touching a repository.

End-to-end sign-in has **not** been run against live GitHub and Cloudflare, because doing so
requires a GitHub App and a Cloudflare account that only the repository owner can create.
