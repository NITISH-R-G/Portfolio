# Privacy

## What this project does not do

- No account, no sign-up, no hosted service.
- No telemetry. Nothing reports back to this project or its author, ever.
- No third-party analytics script is bundled. There is nothing to turn on.
- No cookies are set by the portfolio.
- No data is sent anywhere you did not explicitly configure.

Everything runs on your machine or in your own CI. The output is static files you own.

---

## What is fetched, and from where

Only **public profile data**, only from platforms you list under `dataSources`, only when
you run `npm run import`.

- Private repositories are never read. `privacy.excludePrivateRepos` defaults to `true`,
  and the connectors filter private records regardless.
- Nothing is fetched at page load. The built site makes **no requests to any platform** —
  all data is resolved at build time and baked in. A visitor's browser never contacts
  GitHub, and no platform learns who is reading your portfolio.
- No connector fetches anything about anyone other than the account you configured.

You can see exactly what was fetched: it is sitting in `src/data/generated/sources/` as
readable JSON, one file per source.

---

## Credentials

Every credential is optional except Kaggle's.

| Where it lives | What reads it |
| --- | --- |
| `.env` (gitignored) | Node, during `npm run import` |
| CI secrets | The import step of your deploy workflow |

**Credentials are never bundled into the built site.** They are read by Node during the
import and never reach the browser. `.env` is gitignored, and `npm run setup` writes the
file with the keys blank so no secret ever passes through a prompt or your shell history.

The one exception is deliberate and namespaced: `VITE_ANALYTICS_ENDPOINT` *is* bundled,
because the browser has to know where to send events. It is a URL you control, not a
secret.

If a credential leaks, revoke it on the platform. Nothing here can revoke it for you.

---

## Your email address

Three settings, and the middle one does more than it looks like it does.

```js
privacy: {
  hideEmail: false,        // remove it from the page, the JSON-LD and the exports
  obfuscateEmail: true,    // render it against naive scrapers — and omit it from the JSON-LD
},
```

`obfuscateEmail` also keeps your address out of the structured data in the page head.
Obfuscating the visible text while leaving a plain `mailto:` in a JSON-LD blob would be
theatre: that blob is the single easiest thing on the page for a harvester to read.

`hideEmail: true` removes it everywhere — page, structured data, `resume.json` and the
Markdown exports.

Neither is a guarantee. If you do not want an address on the public internet, do not put
one in your config; use a contact form or a profile link instead.

---

## Provenance

`privacy.showDataProvenance` (on by default) labels every figure with where it came from:

| Label | Meaning |
| --- | --- |
| **reported** | A platform's API returned this figure verbatim |
| *(none)* | Derived — counted from the records shown on the page |
| **self-reported** | You typed it, because that platform publishes no API |

This is a feature *for the reader*, not a compliance checkbox. It is what lets someone
looking at your portfolio tell a measurement from a claim. Turning it off hides that
distinction; the underlying data does not change.

---

## Controlling what appears

**Disable a source** without deleting its configuration:

```js
dataSources: {
  github: { username: 'ada', enabled: false },
},
```

**Exclude specific repositories:**

```js
github: { username: 'ada', exclude: ['dotfiles', 'private-notes'] },
```

**Hide individual records** — in the builder, or directly in `src/data/overrides.json`:

```json
{ "hidden": { "projects": ["github-old-experiment"] } }
```

A hidden record is removed from the page **and from every total it contributed to**. Hide
a project and its stars leave your star count, because a portfolio should never advertise
a number whose evidence it is not showing.

**Hide a whole section:**

```js
sections: { competitive: false },
```

---

## What is stored in your browser

The builder at `/admin.html` keeps unsaved drafts in `localStorage` under two keys:

- `portfolio-admin-overrides`
- `portfolio-admin-config`

Local to your browser, never transmitted anywhere. Clear them with "Discard unsaved
changes" in the Save panel, or by clearing site data.

The published portfolio itself writes nothing to storage.

---

## Analytics

Off by default, and there is no third-party provider to enable.

```js
analytics: {
  endpoint: 'https://analytics.example.com/collect',
  respectDoNotTrack: true,
},
```

If you set an endpoint, the page posts anonymous events to **your own** URL via
`sendBeacon`. No cookies, no fingerprinting, no third-party script, no personal data.
`respectDoNotTrack` honours the browser's Do Not Track header.

Prefer `VITE_ANALYTICS_ENDPOINT` in `.env` to keep the URL out of your committed config.

---

## Third parties in the built site

By default the built page loads one external resource: the Inter webfont from Google
Fonts, requested by `index.html`. That means Google sees your visitors' IP addresses.

To avoid it, delete the three `<link>` tags from `index.html` and set a system font stack:

```js
theme: { fontSans: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' },
```

Nothing else phones out. Avatar and project images are whatever URLs your connectors
returned — usually the platform's own CDN — so if you would rather not hotlink those,
download them into `public/` and point `identity.avatar` at the local copy.

---

## Licensing and your data

Your portfolio data is yours. This project neither claims nor transmits any of it. The
code is MIT licensed; the data in your fork is not covered by that and never leaves your
repository unless you publish it.
