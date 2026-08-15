# Troubleshooting

Start here:

```bash
npm run doctor
```

It reports what will render, what will not **and why**, plus the config mistakes that are
otherwise invisible until after you deploy.

---

## The deployed page is completely blank

Almost always `site.base`.

A GitHub Pages project site is served from `/your-repo-name/`. If `site.base` is `/`, every
asset URL is wrong, everything 404s, and the page renders empty with nothing in the console
naming the cause.

```js
site: { base: '/your-repo-name/' },
deployment: { target: 'github-pages' },
```

Confirm before deploying:

```bash
npm run build
npm run preview     # serves at the configured base
```

Or check the built HTML directly — the asset paths should start with your base:

```bash
grep 'src="' dist/index.html
```

---

## A section is missing

This is usually correct behaviour, not a fault. Sections are hidden when there is not
enough data — that is what stops an empty "Publications" heading appearing.

```bash
npm run doctor
```

```
  Hidden because there is not enough data — this is normal, not a fault:
    publications     0 of 1 needed
    writing          1 of 2 needed
```

Thresholds: `stats` and `skills` need 3 records, `writing` and `videos` need 2, everything
else needs 1.

To force one visible regardless:

```js
sections: { publications: true },
```

It will render empty. That is why `'auto'` is the default.

---

## Nothing imported at all

```bash
npm run doctor
```

- **"No sources are configured"** — add them under `dataSources`, or run `npm run setup`.
- **`skipped`** — the connector is missing a required field, or `enabled: false`.
- **`never imported`** — configured, but you have not run `npm run import` yet.

---

## "GitHub refused the request"

The unauthenticated rate limit is 60 requests per hour, per IP. A large account can exhaust
it in one import.

Add a token to `.env`:

```
GITHUB_TOKEN=ghp_...
```

A token with **no scopes** is enough for public data. It raises the limit to 5,000/hour and
unlocks pinned repositories and your contribution total. Create one at
<https://github.com/settings/tokens>.

---

## A connector says "unavailable"

It is configured correctly but cannot run here — almost always a missing credential.

```
  Kaggle    unavailable    Kaggle requires credentials. Download kaggle.json …
```

Set the variables named in the message in `.env`, then re-import. Anything you typed into
that connector's config is kept in the meantime, so you lose the live data rather than the
whole section.

---

## A connector says "error"

Read the message — they are written to be actionable.

| Message | Cause |
| --- | --- |
| "has no such account or resource" | A typo in the username. Pasting the full profile URL also works. |
| "rate limit reached" | Wait, or add the relevant credential. |
| "is having trouble right now" | The platform is down. Not your configuration. |
| "did not respond within 15s" | Network or platform slowness. Re-run. |
| "profile is private" | The connector can only read public profiles. |

One failing source never affects another, and never fails a build.

---

## My edits disappeared after re-importing

They should not — that is the whole point of the layer model. Check where you made them.

Edits belong in **`src/data/overrides.json`**, which is applied *on top* of imported data.
If you edited `src/data/generated/sources/*.json` directly, `npm run import` overwrites
those files by design.

Use the builder at `/admin.html`, or write overrides by hand:

```json
{
  "records": {
    "projects": { "github-my-repo": { "description": "A better description." } }
  }
}
```

---

## The builder's changes are not in my site

The builder cannot write files — it runs entirely in your browser. Its changes live in
`localStorage` and preview live, but reaching your repository requires one paste.

Open the **Save** panel and copy each block into the file named above it:
`src/data/overrides.json`, and a patch for `portfolio.config.js`.

---

## The title or social preview is wrong

SEO metadata is baked into the HTML at build time. After changing `identity` or `site`:

```bash
npm run build
grep -o '<title>[^<]*</title>' dist/index.html
```

If it still says `Portfolio`, `identity.name` is not set.

In dev, config edits are picked up on the next page load without restarting the server.

---

## A skill looks wrong or noisy

Skills are derived from repository languages and topics, so they inherit whatever you
tagged your repositories with.

- **Wrong casing** (`Ai Agents`) — topics are lower-cased by GitHub and title-cased back.
  Common initialisms are handled; open an issue if one is missing.
- **Noise** — remove the topic on GitHub, or exclude the repository:
  `github: { exclude: ['scratch-repo'] }`.
- **Missing** — language breakdowns are read for the top 8 repositories without a token, or
  30 with one. Set `GITHUB_TOKEN`.

---

## Too many projects

Ranking puts the strongest first, but everything is shown by default. Cap it:

```js
sectionOptions: { projects: { limit: 8 } },
```

The rest stay in your data and in the exports. Or hide specific ones in the builder.

---

## `npm run import:file` did not understand my file

| Format | Notes |
| --- | --- |
| JSON Resume | Detected by shape, not filename |
| `portfolio.json` | This project's own export |
| YAML | Minimal parser — anchors, multi-line blocks and flow maps are refused rather than mangled |
| Markdown | Approximate; maps recognised headings and drops the rest |
| LinkedIn `.zip` / `.csv` | Reads Positions, Education, Skills, Certifications |

For unsupported YAML, convert it first:

```bash
npx js-yaml profile.yaml > profile.json
npm run import:file -- profile.json
```

---

## Tests fail after I changed something

```bash
npm test
```

The suite covers the data pipeline, not the visual layer, so a failure is a real behaviour
change. Common ones:

- Adding a connector without registering it, or registering one that violates the contract
  (an id collision, a `manual` connector with a `fetch` method, a non-automatic connector
  with no `limits`).
- Changing a `deriveStats` entry's `kind`. `fetched` must mean a platform actually returned
  it — the tests enforce that, on purpose.
- Changing section thresholds, which changes what the sample profiles render.

---

## Still stuck

```bash
npm run doctor
npm run import -- --dry-run
```

The generated data is plain JSON you can read:

```
src/data/generated/sources/*.json   what each connector produced
src/data/generated/status.json      what happened on the last import
```

If it looks like a bug, open an issue with your `npm run doctor` output — with any
usernames removed if you would rather not share them.
