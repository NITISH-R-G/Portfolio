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
