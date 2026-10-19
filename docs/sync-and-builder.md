# Self-updating identity and the component-native builder

This records the architecture for two capabilities and the audit that shaped it. It is written
against the repository as it was at `588dadd`, and every claim about "what exists" can be
checked in the files named.

- [1. Audit: what exists](#1-audit-what-exists)
- [2. Gap analysis](#2-gap-analysis)
- [3. Pillar A — automatic synchronization](#3-pillar-a--automatic-synchronization)
- [4. Pillar B — component-native builder](#4-pillar-b--component-native-builder)
- [5. Pillar C — canvas versus moodboard](#5-pillar-c--canvas-versus-moodboard)
- [6. How the pieces share one data model](#6-how-the-pieces-share-one-data-model)
- [7. Milestones](#7-milestones)

## 1. Audit: what exists

```
 connectors ──► normalized profile ──► buildPortfolio ──► sections ──► Next static export
 (src/connectors)  (src/core/schema)    (src/core/generate)            (GitHub Pages)
      ▲                  ▲                    ▲
      │                  │                    └── config  (portfolio.config.js ← src/data/config.json)
  http client       overrides.json / manual.json   user-owned, committed, the only writable files
  (timeout, retry,   (provenance, precedence)
   Retry-After,
   conditional 304)

 admin (in the same Next app)  ──►  canvas · inspector · live preview over the real components
        │                              drafts in localStorage → Publish
        ▼
 workers/admin (Cloudflare Worker, no bindings)  ──►  commits the three JSON files via a GitHub App
                                                       → push to main → deploy.yml
```

| Area | State at `588dadd` | Where |
| --- | --- | --- |
| Connectors | ~45, each declares availability, fields, limits, `normalize` | `src/connectors/*` |
| Conditional requests | Real. A validator is sent only if the provider supplied one | `src/connectors/cache.js`, `http.js` |
| Retry | Real. Bounded exponential backoff, `Retry-After` honoured, **no jitter** | `src/connectors/http.js` |
| Failure isolation | Real. One source's failure becomes one status, never throws | `src/connectors/run.js` |
| Health model | Real. `lastSuccessfulAt` survives failure; staleness; rate-limit `nextRetryAt` | `src/core/sources/health.js` |
| Change summary | Real locally: `recordsChanged` per source, shown in the admin and in the Actions run summary. **Meaningless in CI** (see G1) | `run.js` `withHistory`, `scripts/refresh-report.mjs` |
| Refresh policy | Real and honest: states that nothing can receive a webhook (`ingestible: false`) | `src/core/sources/refresh.js` |
| Automatic execution | One workflow: weekly cron + every push to `main`. Not per-source | `.github/workflows/deploy.yml` |
| Server-side code | One Cloudflare Worker, publishing only. Deliberately stateless | `workers/admin` |
| Component registry | shadcn-schema `registry.json` (64 items), six registries in `components.json`, built to `public/r/` | `registry.json`, `src/registry/` |
| Page model | A **fixed** set of 13 section ids, ordered and shown/hidden by config | `src/core/config/defaults.js`, adapter |
| Admin canvas | Selectable regions over the real components, contextual inspector, viewports | `src/admin/preview`, `panels/CanvasPanel.jsx` |
| Config liveness | Every `setConfig` path must have a probe proving something reads it | `src/admin/config-liveness.test.ts` |

`SECURITY.md` states the project has "no hosted service". That remains true of the default
deployment: everything below that needs a server is **optional** and off unless deployed.

## 2. Gap analysis

Genuinely missing, in the order they bite:

| # | Gap | Evidence | Consequence |
| --- | --- | --- | --- |
| G1 | **Last-known-good data is not preserved.** A configured source that fails has its previous profile *deleted* ("produced nothing") on a full run, and CI starts from a clean checkout so it has no previous profile to keep | `scripts/import.mjs` `writeSources`; `generated/` is gitignored; `deploy.yml` has no cache. (An existing test comment claimed the opposite — "its previous data is left in place" — which the code contradicted.) | One transient 5xx during a scheduled deploy removes that source from the live site until the next good run |
| G2 | Nothing can receive an event | `refresh.js` says so; the admin Worker has no webhook route | Latency is up to a week, or until the owner pushes |
| G3 | No idempotency, queue, coalescing or observable job state | no code | A webhook receiver added naively would double-build and be unobservable |
| G4 | Backoff has no jitter | `http.js` `backoff` | Synchronized retries after a provider outage |
| G5 | Capability model has no sync dimension (mechanism, minimum interval, latency) | `capabilities.js` | The UI cannot say *how* a source updates, only that it does |
| G6 | Change summaries are computed against nothing in CI, so every run reports every record as "+N added" | `diffProfiles(undefined, profile)` counts everything as added; same root cause as G1 | The Actions run summary cannot tell a refresh that changed things from one that did not |
| G7 | No component capability manifest | — | Registry metadata distributes code; nothing says what is editable |
| G8 | No component instance model; the page is 13 hard-wired sections | `PAGE_SECTION_BY_ENGINE_ID` | The canvas can reorder and hide blocks but cannot add one |
| G9 | No undo/redo, drag-and-drop, or component tray | — | Deferred to Milestone 4 |

Measured, not assumed — the deploy pipeline (`run 35899266591`) takes **175 s**: Build 57 s,
install 21 s, import 8 s, tests 6 s, the rest runner overhead. That number decides the
incremental-processing question in §3.4.

## 3. Pillar A — automatic synchronization

### 3.1 The principle that makes it safe

> **An event is an invalidation signal, not a state delta.**

A webhook says "something about this account changed". The pipeline responds by re-reading the
authoritative state, never by applying the event's payload. Consequences that fall out for free:

- **Duplicate events** cause at most a redundant rebuild.
- **Out-of-order events** cannot produce wrong data — there is no order-dependent state to corrupt.
- **A forged or replayed event** can only cause a rebuild of public data, and signatures stop it earlier.
- **A missed event** is repaired by the next poll or the weekly run, because correctness never
  depended on receiving it.

### 3.2 Mechanism: provider → service → publish

```
GitHub ──webhook (HMAC-signed)──┐
                                ├─► sync service (Cloudflare Worker + KV) ──repository_dispatch──► deploy.yml
GitHub ──Events API (ETag) ─────┘      verify · dedupe · classify · coalesce · retry                │
   polled by the Worker's cron          status at GET /sync/status  ◄── workflow_run webhook ◄──────┘
                                                                         (observed end-to-end latency)
```

Why a separate Worker and not the admin Worker: the admin Worker is deliberately stateless
("sessions are signed cookies and GitHub is the database"). Sync needs state — delivery ids for
idempotency, a coalescing window, a status record — so it gets its own Worker with one KV
binding, and the admin keeps its property that it needs no storage.

Why `repository_dispatch`: it needs only `contents: write`, which the existing GitHub App already
holds. No new permission, and `deploy.yml`'s `concurrency: pages` already guarantees one running
and at most one pending build, which bounds a burst on the GitHub side too.

### 3.3 Honest latency

| Stage | Observed / documented |
| --- | --- |
| GitHub webhook → our receiver | provider-side, typically seconds; not guaranteed |
| Receiver → `repository_dispatch` accepted | one HTTPS call; sub-second in practice |
| Events API visibility (polling path) | `X-Poll-Interval: 60`, but `Cache-Control: max-age=300` — **events can be 1–6 minutes late by the provider's own caching** |
| Dispatch → site live | **~3 min** (175 s measured): this is the floor for a Pages rebuild |

So: *event-to-dispatch is seconds; event-to-live is minutes.* With no deployed service, the
mechanism is the weekly schedule plus pushes, and the UI says exactly that.

### 3.3a What the live probes found

Two assumptions in the first design were wrong, and both were found by asking GitHub rather than
by reasoning:

1. **Event ids are not ordered.** The first poller kept "the highest event id seen" as a cursor.
   A real response mixed two id sequences — pushes and repository creations near 24.4 billion,
   stars and pull requests near 17.5 billion — in neither id nor time order. A new event from the
   lower sequence would have been *older than the cursor and silently skipped*. The poller now
   remembers a bounded **set** of seen ids. A regression test uses a real page's shape, and a
   mutant that restores cursor semantics is caught.
2. **The account's own feed does not contain other people's stars.** `/users/{u}/events/public`
   lists what the account *did*. Someone else starring a repository appears only through a
   webhook. Polling and webhooks are therefore declared as different mechanisms with a stated
   blind spot, not as the same thing at two speeds.

### 3.4 Incremental processing — investigated, mostly declined

The pipeline is 175 s end to end; import is 8 s of it. Restricting the import to the changed
source (`--only`) or skipping tests on dispatch would save single-digit seconds while adding
workflow branches that cannot be tested locally. The build (57 s) cannot be made partial under
`output: "export"`. **Not done, on the evidence.** What *is* worth doing is G1: persisting
last-known-good state between runs, so a transient failure costs nothing.

### 3.5 What is a vertical slice and what is deployed

Implemented and tested in this milestone: signature verification, event normalization and
relevance, the idempotent coalescing ledger, retry with jitter and `Retry-After`, the Events-API
poller with ETag, the publisher, `workflow_run` closure, the Worker handlers, last-known-good,
and the capability/latency model. **Not done in this milestone:** deploying the Worker and
enabling the webhook — both need the owner's Cloudflare account and GitHub App settings. See
[sync-service.md](sync-service.md).

## 4. Pillar B — component-native builder

Registry metadata distributes **code**; it does not say what is editable. So the design adds a
layer on top and leaves the registry untouched:

```
shadcn registry item ──► capability manifest ──► serialized instance ──► renderer ──► real component
 (what to install)       (what is editable)      (what the user chose)    (validates)
```

- **Manifest** (`defineComponent`): versioned; declares each editable prop as a typed *control*
  with constraints; names its registry item so dependencies and licence are traceable.
  Nothing is editable unless a manifest says so — TypeScript prop interfaces are never exposed
  wholesale.
- **Instance**: `{ id, component, version, props }`, stable random id (never an array index),
  plain JSON only. No JavaScript is ever stored or evaluated.
- **Storage**: `config.components.instances`, in the existing `src/data/config.json`. This is the
  one source of truth — it rides the existing draft → publish path and the Worker's existing
  write allow-list, so no second persistence mechanism and no new write permission.
- **Validation**: on save in the inspector and again at render. An unknown component or invalid
  props renders nothing on the public page and a labelled placeholder in the editor — never a
  crash, never silently dropped data.
- **Three levels of editing support**: manifest-driven (built now), custom inspector (a hook on the
  manifest type, so complex components can supply their own), and automatic inference from
  TypeScript types (deferred: it needs build-time type extraction, which is Milestone 4).

Third-party code: components are installed as source files by the shadcn CLI into the repository
and reviewed like any dependency. The platform never loads component code at runtime from a
registry.

## 5. Pillar C — canvas versus moodboard

Decided on evidence in [canvas-evaluation.md](canvas-evaluation.md).

## 6. How the pieces share one data model

- **One config, one profile.** Sync changes the *profile* (generated, from connectors).
  The builder changes *config* (committed). They never write each other's data, so a GitHub
  refresh cannot overwrite styling and a layout change cannot touch provenance.
- **Bindings are not built yet.** An instance prop will eventually be able to point at profile
  data instead of holding a literal (`{ bind: "profile.projects[0].title" }`). Props are bare
  literals today, so that will be a versioned migration of the instance schema — which is what
  the `version` field on every instance is for. Milestone 4.
- **Replacing a component** replaces an instance; the profile it displayed is untouched, because
  the profile never lived in the instance.

## 7. Milestones

| # | Milestone | Depends on | Acceptance |
| --- | --- | --- | --- |
| 1 | **This one**: sync core + Worker + last-known-good; manifest + one real instance in the inspector | — | Tests green; instance edit changes rendered output and persists through config |
| 2 | **Deploy and observe**: deploy the Worker, enable the webhook, record a real push propagating | owner's Cloudflare account + GitHub App webhook + KV namespace | A real push to a public repo → live site updated, with `/sync/status` showing the observed latency |
| 3 | **More providers** | M2 | Add providers by category using each one's real mechanism; contract tests per provider |
| 4 | **Builder**: tray, drag-and-drop, undo/redo, slots, responsive props, data bindings, registry browser, type-inferred controls | M1 | Instance tree with children; every control covered by a liveness probe |
