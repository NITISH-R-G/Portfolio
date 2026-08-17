# Deployment

The output is a static site — HTML, CSS, JavaScript and images. No server, no database, no
hosted backend, nothing to pay for. Any static host works.

```bash
npm run deploy:check   # doctor, then build
```

---

## The one setting that matters

`site.base` in `portfolio.config.js`.

| Hosting | `site.base` |
| --- | --- |
| GitHub Pages **project** site (`you.github.io/repo`) | `/repo/` |
| GitHub Pages **user** site (`you.github.io`) | `/` |
| Vercel | `/` |
| Netlify | `/` |
| Cloudflare Pages | `/` |
| Custom domain, anywhere | `/` |

Get it wrong and every asset 404s. The page renders completely blank, and there is nothing
in the browser console that names the cause — which is why `npm run doctor` checks it
against `deployment.target`, and why the CI workflow verifies the built HTML actually
references assets under the configured path.

```js
site: { base: '/my-portfolio/' },
deployment: { target: 'github-pages' },
```

---

## GitHub Pages

A workflow is included at `.github/workflows/deploy.yml`. It works unmodified in any fork —
nothing in it hardcodes a repository name or username.

1. Set `site.base` to `/your-repo-name/` and `deployment.target` to `'github-pages'`.
2. Push to `main`.
3. Settings → Pages → Source → **GitHub Actions**.

The workflow runs tests, imports your data, runs the doctor, builds, verifies the output,
and deploys. It also re-imports **weekly**, so a deployed portfolio does not go stale while
you are not looking. Remove the `schedule:` block if you would rather import by hand.

### Secrets

All optional. Settings → Secrets and variables → Actions:

`STACKEXCHANGE_KEY` · `SEMANTIC_SCHOLAR_KEY` · `YOUTUBE_API_KEY` · `HUGGINGFACE_TOKEN` ·
`GITLAB_TOKEN` · `KAGGLE_USERNAME` · `KAGGLE_KEY`

`GITHUB_TOKEN` is provided by Actions automatically and needs no setup — it raises the
GitHub API rate limit and unlocks pinned repositories and your contribution total.

### Custom domain

Set `site.base` to `/`, `site.url` to your domain, add a `CNAME` file to `public/`, and
configure the domain under Settings → Pages.

---

## Vercel

`vercel.json` is included.

1. Set `site.base` to `/` and `deployment.target` to `'vercel'`.
2. Import the repository at [vercel.com/new](https://vercel.com/new). It detects Vite.
3. Add any connector credentials under Settings → Environment Variables.

Vercel does not run `npm run import`. Either commit your imported data — comment out
`src/data/generated/` in `.gitignore` — or change the build command to:

```
npm run import && npm run build
```

The second option needs your credentials present as environment variables, and re-imports
on every deploy.

---

## Netlify

`netlify.toml` is included.

1. Set `site.base` to `/` and `deployment.target` to `'netlify'`.
2. Import the repository. Build command and publish directory are read from the file.
3. Add credentials under Site settings → Environment variables.

Same choice as Vercel about whether to import at build time.

---

## Cloudflare Pages

`public/_headers` is included.

1. Set `site.base` to `/` and `deployment.target` to `'cloudflare'`.
2. Create a Pages project from the repository.
3. Build command `npm run build`, output directory `dist`.
4. Add credentials under Settings → Environment variables.

---

## Any other static host

```bash
npm run build
```

Upload `dist/`. That is the whole deployment. It works on S3, Cloudflare R2, nginx, GitLab
Pages, Surge, a university web directory, or a USB stick.

---

## Committing imported data

`src/data/generated/` is gitignored by default, because it is reproducible from your config
and committing it would fill your history with refresh diffs.

Comment that line out if:

- your host builds without network access to the platforms, or
- you want the site to build reproducibly from a checkout alone, or
- you would rather review each data change as a diff before it goes live.

The data is public either way — it came from your public profiles.

---

## Keeping it fresh

| Approach | How |
| --- | --- |
| **Scheduled** | The included workflow re-imports weekly. Adjust the `cron:` line. |
| **On every deploy** | Change the build command to `npm run import && npm run build`. |
| **By hand** | `npm run import`, commit, push. |

Every source refreshes independently, and your overrides in `src/data/overrides.json` are
applied *on top* of the refreshed data — so a refresh never undoes a correction.

---

## Before you publish

```bash
npm run deploy:check
```

Worth checking yourself:

- **`site.url`** is set, or canonical links, Open Graph tags and the sitemap are all omitted.
- **The social preview.** `dist/index.html` should contain your real `og:title` and
  `og:image`. Metadata is baked in at build time precisely because the scrapers that read
  it do not run JavaScript.
- **Your email.** If you would rather not publish it, set `privacy.hideEmail: true`.
- **Sections.** `npm run doctor` lists what will render and what will not.

---

## Preview a production build locally

```bash
npm run build
npm run preview
```

This serves the built output at the configured `base`, so it is the right way to catch a
base-path mistake before deploying rather than after.
