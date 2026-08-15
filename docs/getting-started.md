# Getting started

From a clone to a deployed portfolio. Budget about five minutes for the first three steps.

## Requirements

Node 18 or newer. That is all — no database, no account, no API key.

```bash
node --version
```

## 1. Clone and install

```bash
git clone https://github.com/NITISH-R-G/Portfolio.git my-portfolio
cd my-portfolio
npm install
```

## 2. Look at it first (optional, recommended)

Before configuring anything, see what the tool produces:

```bash
npm run example -- list
npm run example -- software-engineer
npm run dev
```

Open <http://localhost:5173>. Try `researcher` and `competitive-programmer` too — they
produce visibly different portfolios from the same code, because sections are chosen from
the data.

When you are done:

```bash
npm run example -- restore
```

## 3. Set yourself up

```bash
npm run setup
```

Six questions, then a list of platforms to pick from. Every answer is optional and every
one can be changed later. It writes exactly one file: `portfolio.config.js`.

The wizard tells you, for each platform, whether it imports automatically or needs
something from you. If you would rather type it, skip the wizard and write the config
yourself:

```js
// portfolio.config.js
import { defineConfig } from './src/core/config/types.js'

export default defineConfig({
  identity: {
    name: 'Ada Lovelace',
    headline: 'Software Engineer',
  },
  dataSources: {
    github: { username: 'ada' },
  },
})
```

That is a complete, valid configuration. Everything else has a working default.

## 4. Import your data

```bash
npm run import
```

Each source reports what it did:

```
  GitHub           imported              ada
    Imported 24 projects, 18 skills and 2 stats.

  Codeforces       imported              ada_l
    Imported 1 platform.

  LinkedIn         manual
    Profile link added. No data was fetched — see this connector's limits.
```

Nothing here can fail your build. A source that errors reports why and the rest continue.

**Optional:** create a `.env` from `.env.example` and add a `GITHUB_TOKEN`. It raises the
GitHub rate limit from 60 requests/hour to 5,000 and unlocks pinned repositories and your
contribution count. Everything works without it.

## 5. Look at the result

```bash
npm run dev
```

- <http://localhost:5173> — your portfolio
- <http://localhost:5173/admin.html> — the builder

The builder is where you review what was imported, fix anything a platform got wrong, try
themes and reorder sections. It cannot write files, so its changes come out as two blocks
you paste into `src/data/overrides.json` and `portfolio.config.js`.

Your corrections live in a layer *above* the imported data, so running `npm run import`
again never undoes them.

## 6. Check it

```bash
npm run doctor
```

This is the one worth reading. It reports what will render, what will not **and why**, and
catches the config mistakes that are otherwise invisible until after you deploy:

```
─ Sections ──────────────────────────────────────
  Showing  hero, about, stats, projects, experience, skills
  Hidden   publications, packages, competitive

  Hidden because there is not enough data — this is normal, not a fault:
    publications     0 of 1 needed
    packages         0 of 1 needed
```

## 7. Deploy

```bash
npm run deploy:check
```

Runs the doctor, then builds into `dist/`.

**The one setting that matters:** `site.base`.

| Hosting | `site.base` |
| --- | --- |
| GitHub Pages project site | `/your-repo-name/` |
| GitHub Pages user site (`you.github.io`) | `/` |
| Vercel, Netlify, Cloudflare Pages, custom domain | `/` |

Get this wrong and every asset 404s — the page renders completely blank with nothing in
the console to explain it. `npm run doctor` checks it against your declared host.

For GitHub Pages: push to `main` and enable Pages under Settings → Pages → Source →
GitHub Actions. The included workflow builds, refreshes your data weekly, and deploys.

Full instructions for each host: **[deployment.md](deployment.md)**.

---

## What to do next

**Add more sources.** Each one you connect adds evidence. See
[connectors.md](connectors.md) for what all 29 can actually do.

**Choose a theme.** Twelve are built in. See [themes.md](themes.md).

**Write a summary.** It is the one thing worth typing by hand — it becomes your About
section and your meta description. Set `identity.summary`, or let the GitHub bio fill it in.

**Generate your résumé.** `npm run export` produces a JSON Resume, a Markdown résumé, a
GitHub profile README and three bio lengths from the same data.

---

## Common first problems

**"No sources are configured."** Add them under `dataSources` in `portfolio.config.js`, or
run `npm run setup`.

**A section is missing.** Run `npm run doctor` — it lists every hidden section with its
record count and the threshold it needed. Usually there simply is not enough data yet,
which is the intended behaviour.

**"GitHub refused the request."** The unauthenticated rate limit is 60 requests/hour. Wait,
or add a `GITHUB_TOKEN` to `.env`.

**The deployed page is blank.** `site.base` is wrong. See step 7.

More: **[troubleshooting.md](troubleshooting.md)**.
