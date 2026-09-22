# Connecting your sources

**Say where you are. Working out what that means is this project's job, not yours.**

You should never have to know that GitHub is a public API, Medium is an RSS feed, Kaggle
needs a credential and LinkedIn is a file upload. You give an identifier; the system picks
the best way to use it.

---

## The fastest route

```bash
npm run dev
```

Then open `/admin.html`. The **Connect** screen is the onboarding flow: connect accounts,
paste links, drop your résumé, import. It writes to `portfolio.config.js` for you.

Prefer the terminal? `npm run setup` walks the same ground.

---

## Paste anything

Every platform identifies people differently — a username, a numeric id, a hyphenated code.
So don't learn the difference. Paste the URL:

| You paste | It becomes |
| --- | --- |
| `github.com/octocat` | `github: { username: 'octocat' }` |
| `stackoverflow.com/users/22656/jon-skeet` | `stackoverflow: { userId: '22656' }` |
| `orcid.org/0000-0002-1825-0097` | `orcid: { id: '0000-0002-1825-0097' }` |
| `scholar.google.com/citations?user=abc` | `googleScholar: { id: 'abc' }` |
| `ada.substack.com` | `substack: { publication: 'ada' }` |

27 platforms are recognised. Anything else with a feed is treated as a personal website —
most static-site generators publish one.

When a link is *nearly* right, it says so rather than failing:

```
https://github.com/octocat/hello-world
  → That is a single repository. Connecting your GitHub account imports all of them.
    Use just github.com/your-username.
```

---

## The connection ladder

Underneath, every source resolves to the best method it can actually reach:

```
official API  ›  OAuth  ›  public endpoint  ›  profile URL
                                ›  extraction  ›  upload  ›  manual
```

| Method | What it means | Status |
| --- | --- | --- |
| `api` | Reads a documented public API | Available |
| `oauth` | You authorise access once | **Not built** — needs a registered app and a callback server, which a static site has nowhere to put |
| `endpoint` | Reads a public feed (RSS, JSON) | Available |
| `profile-url` | Your profile is linked and verified, but its numbers are not readable | Available |
| `extraction` | Content is read from the public page | **Not built** — no backend configured, and several platforms forbid it |
| `upload` | You supply a file the platform exports | Available |
| `manual` | You type the figures, attributed and linked | Available |

The UI never shows you these words. It shows **Connected**, **Linked**, **Needs a
credential**, **Entered by you**.

### Why extraction is a rung and not the foundation

Scraping is on the ladder, below the profile URL, and it is deliberately *not* what the
architecture rests on. A source that can be read through a documented API is read that way;
extraction is what you fall to when nothing better exists.

That ordering is what keeps this project from being coupled to any scraping vendor. Adding
a backend later means registering an implementation of one rung — nothing above it changes,
and swapping providers is a configuration change rather than a rewrite.

---

## Upload your résumé

Drop it on the Connect screen, or:

```bash
npm run import:file -- ~/Documents/resume.pdf
```

It becomes a source in its own right, with provenance down to the page and section. See
[canonical identity](identity.md#documents-as-sources) for how versions work and why the
document keeps one stable id.

**`.docx` and `.md` read far more reliably than `.pdf`.** A PDF stores glyph-drawing
instructions rather than text, so extraction is a reconstruction; where it cannot be done
honestly — a scanned page, a custom font encoding — the importer refuses and says why.

---

## Can't connect?

Some platforms genuinely cannot be read, and the project says so rather than shipping an
integration that silently returns nothing:

| Platform | Why | What you get |
| --- | --- | --- |
| LinkedIn | No third-party profile API; automated access is prohibited | Verified link, plus your own data export |
| Google Scholar | No API, automated access prohibited | Verified link — use ORCID, Semantic Scholar or dblp for the publications |
| HackerRank, HackerEarth, CodeChef | No public profile API | Verified link, plus figures you enter |
| Devpost | No documented API | Hackathons you enter, each linked to its public submission |
| X | No free API tier | Verified link, and the handle for card metadata |

In every case the profile link is real and the figures you type are attributed and labelled
**self-reported** — never presented as though the platform had confirmed them.

---

## Where the writes go

The Connect screen edits real files:

| Action | Writes |
| --- | --- |
| Connect a source | `portfolio.config.js` (previous version kept as `.backup`) |
| Upload a document | `src/data/documents/<id>.json` |
| Import | `src/data/generated/` |
| Save edits | `src/data/overrides.json` |

This works **only while `npm run dev` is running**. The dev server exposes a small local
write API at `/__portfolio`; it is dev-only (`apply: 'serve'`), writes to a fixed set of
known paths, refuses cross-origin requests, and does not exist in a build. A deployed site
is exactly as static as before, with no backend of any kind.

Without the dev server, the builder still computes every change and hands you the file to
paste — it just cannot save for you.

---

## Source health

Once ten sources are connected, "did that work?" stops being answerable by reading
scrollback. The **Sources** screen is the standing answer:

```
5 connected   1 needs attention   324 records          [Refresh all]

Kaggle                                 NEEDS A CREDENTIAL
  Kaggle requires credentials. Set KAGGLE_USERNAME and KAGGLE_KEY in .env.
  Never synced · Last tried today                          [Refresh]

Codeforces                                      CONNECTED
  tourist · Imported 1 platform.
  1 records · Last synced today · +1 since last sync       [Refresh]

npm                                               PARTIAL
  sindresorhus · Imported 1 skill and 250 packages.
  251 records · Last synced today · +251 since last sync   [Refresh]
  Download counts were read for the first 40 of 250 packages.

LinkedIn                                   ENTERED BY YOU
  Profile link added. No data was fetched.
```

Sources needing attention sort to the top. Everything else is settled — LinkedIn cannot be
fetched and never will be, which is information rather than a problem.

### Health states

| State | Means | Can you act? |
| --- | --- | --- |
| `connected` | Fetched successfully | No |
| `partial` | Worked, with some limitation noted | No — the warning says what more is available |
| `stale` | Worked, but the data is over two weeks old | Refresh |
| `empty` | Ran fine; the account genuinely has nothing | No |
| `manual` / `link-only` | No API; you supplied it | No |
| `authentication-required` | Needs a credential you can provide | Set it in `.env` |
| `rate-limited` | The platform asked you to wait | Wait — `nextRetryAt` says until when |
| `unsupported` | The platform publishes nothing fetchable | No |
| `error` | Tried and failed | Read the message |
| `never-run` | Configured but never imported | Import |

### Attempted is not succeeded

Each source records both `lastAttemptedAt` and `lastSuccessfulAt`, and **a failed run never
erases the last success**. A source that worked yesterday and timed out this morning shows
as failing *while still knowing it worked yesterday* — the difference between a transient
blip and a broken integration, which is otherwise invisible.

### What changed

Every refresh records `recordsChanged` — added, updated, removed — compared against what
was already on disk. Provenance timestamps are excluded from the comparison, so a
re-import with no upstream change correctly reports nothing changed rather than marking
every record as updated.

That answers a question a progress line cannot: a source can succeed having brought back
nothing new, and without this there is no way to tell that apart from a real update.

## Preview before you apply

An import in the admin runs in two steps. **Fetch & preview** runs the connectors for real —
fetching, normalising and diffing against what is already on disk — and writes nothing. What
it reports is what applying would do, because it is the same code path: `npm run import
--dry-run`, which has always fetched without writing, now also emits its result as JSON.

Only **Apply** writes. Cancelling leaves every generated file byte-identical.

This is deliberately not a cheap metadata check. There is no way to know what a source will
contribute without asking it, and a "preview" that guessed would be worse than none — so the
preview costs a real fetch and tells you the truth.

### What a preview cannot tell you

Removals are detected only for sources that were previously imported: there is nothing to
compare a first import against, so everything in it is an addition. A source that fails
during preview reports the failure rather than an empty result, because "nothing to update"
and "could not be read" are opposite answers to the same question.

### Failure is safe

A source that fails leaves the last good import in place. Its `lastSuccessfulAt` is
preserved, only `lastAttemptedAt` moves, and the file on disk is untouched — so the
portfolio keeps showing the data that worked while the health view reports the failure.

---

## Staying current

Once a source is connected it refreshes without you. The repository's workflow runs the
importer **weekly, Mondays at 06:00 UTC**, and again on every push to `main`. That is the
whole of the automatic schedule.

### There is no per-source cadence

GitHub Actions cannot run independent schedules per source, so one schedule covers every
source and no per-source cadence is offered. A config value promising `hourly` would be a
lie the infrastructure could not keep, so none exists.

### What each source can actually do

| Mode | Meaning |
| --- | --- |
| `automatic` | Refreshes on the schedule above. 19 of 29 connectors. |
| `blocked` | Could refresh, but the credential it needs is not set. |
| `manual` | No readable interface; refreshes when you edit it. |
| `unsupported` | Contributes a verified link and nothing else. |

Derived from what each connector declares — `availability`, `fetch`, `authEnv` — not from a
per-connector table that would drift.

### Conditional requests

When a provider returns an `ETag` or `Last-Modified`, it is stored and offered back on the
next run. If the provider answers `304 Not Modified`, the stored body is reused and nothing
is refetched — which for GitHub also means the request costs nothing against the rate limit.

**Support is discovered, never declared.** A conditional header is only ever sent if the
provider itself supplied a validator, so a provider that sends none simply keeps doing full
fetches and nothing has to know which is which. Verified to return real 304s: GitHub, DEV
Community, PyPI, and RSS/Atom feeds served with validators. Verified not to send validators:
Docker Hub, ORCID, npm's search endpoint.

The store lives at `src/data/generated/http-cache.json`, is git-ignored, and can be deleted
at any time — losing it costs one full fetch per URL, never correctness.

### Rate limits are not failures

A 429 is a rate limit. So is a `403` carrying `x-ratelimit-remaining: 0`, which is how GitHub
signals an exhausted quota — without that check its rate limit reads as "refused the request"
and sends you looking for a permissions problem that is not there. A 403 with no such header
stays an ordinary refusal, because that is all it is known to be.

Rate-limited sources report when to come back and are not marked as needing attention:
waiting is not something you can do anything about.

### Webhooks

Several providers support them. **This project cannot receive one** — the public site is a
static export with no server, and the admin API is a loopback process that exists only while
you are developing. Provider support is recorded so the gap is documented; nothing anywhere
offers webhook ingestion.

---

### Staleness is derived, not stored

A source is not *in* a stale state; it is connected, and its data is old. Storing staleness
would mean rewriting status files as time passes. Sources that cannot be refreshed — a
manual entry from a platform with no API — never go stale, because telling someone to
refresh something that cannot change is telling them to do nothing.

---

## Where did this come from?

Every meaningful value on the finished page can be traced:

```
Python
20 projects
GitHub · Résumé
```

Corroboration across independent sources is the strongest thing a portfolio can say about a
claim, so it is shown wherever more than one source agrees. See
[canonical identity](identity.md#evidence).
