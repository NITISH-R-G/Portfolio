# Contributing

The most valuable contribution is a **connector**. There are hundreds of platforms
technical people build reputations on, and this covers 29.

```bash
git clone https://github.com/NITISH-R-G/Portfolio.git
cd Portfolio
npm install
npm test
```

Node 18+. No other setup, no accounts, no keys — the test suite stubs every network call.

---

## Adding a connector

Read **[docs/adding-a-connector.md](docs/adding-a-connector.md)**. It is about eighty
lines of work, and the walkthrough is complete.

### The rule that is not negotiable

**Never build against an interface that requires defeating bot protection, or whose terms
prohibit automated access.**

If a platform has no usable public API, the connector is `manual` or `url-only` and says
so. That is not a limitation to work around — it is the product working as intended. A
connector that scrapes a protected page will break silently and may get a user's account
restricted, and neither is an acceptable trade for one more number on a page.

Borderline cases — public but undocumented, like LeetCode's GraphQL endpoint — are fine.
Say so plainly in `limits`, and make the connector degrade to a warning rather than an
error when the shape changes.

### Other rules

- **`normalize` never throws.** Drop malformed records; return what you can.
- **All network access via `ctx.http`.** Timeouts, retries and readable errors come free,
  and the connector stays testable with a stub.
- **Stamp every record** with `stamp(id, url, ctx.now)`. Provenance is what makes a figure
  traceable, and `fetchedAt` is what distinguishes fetched data from typed data.
- **Evidence must match what renders.** A skill claiming "24 repositories" beside a page
  showing three is the failure this project exists to avoid.
- **Public data only**, unless the user explicitly opts in.

---

## Adding a theme

`src/core/themes/presets.js` is one array. A preset declares only what it changes;
everything else inherits from `BASE_TOKENS`. See **[docs/themes.md](docs/themes.md)**.

Check contrast — every built-in preset meets WCAG AA for body text, and a new one should
too. Accent foregrounds are computed automatically, so you do not need to solve that part.

---

## Code style

Match the surrounding code. Broadly:

- ES modules, no semicolons, single quotes, two-space indent.
- JSDoc on exported functions. The project is typed through JSDoc rather than TypeScript so
  it runs directly in Node and the browser with no build step for the pipeline.
- Comments explain **why**, not what. If a line needs a comment to say what it does, rename
  something instead.
- No new runtime dependencies without a reason in the pull request. The dependency tree is
  short deliberately — `npm install` should stay quick and auditable.

---

## Tests

```bash
npm test
```

233 tests over the data pipeline: schema, merging, config, themes, generation, connectors
and the sample profiles. No network, no fixtures on disk that go stale.

New behaviour needs a test. Test the **contract**, not the implementation — assert that
hiding a project removes its stars from the total, not that a particular function was
called.

The suite already enforces the connector contract on everything in the registry, so a new
connector is partly tested the moment you register it. Add cases for a missing account, a
malformed response, and pagination if it has any.

---

## Pull requests

1. Branch from `main`.
2. `npm test` passes.
3. `npm run doctor` still works on a real config.
4. Update the docs you affected — `docs/connectors.md` for a connector,
   `docs/themes.md` for a theme, `docs/configuration.md` for a new option.
5. Describe *why*, not just what.

Small and focused beats large and sweeping. A single connector is a perfect pull request.

---

## Reporting a bug

Include the output of:

```bash
npm run doctor
```

Redact usernames if you would rather not share them — the shape of the output is what
matters. If it involves an import, `npm run import -- --dry-run` is useful too.

---

## Design principles

Worth knowing before proposing something substantial.

**Honest about capability.** Every integration states what it cannot do. No fake API
support, ever.

**Evidence over assertion.** Prefer a number a reader can verify to an adjective they
cannot.

**Empty means hidden.** A section with nothing in it does not render. No user should have
to configure a section away.

**Refresh never destroys.** Imported data is never edited in place. Corrections live in a
layer above it.

**Local-first and static.** No hosted backend, no lock-in. The output is files you own, and
the project must stay useful with no service behind it.

**Configuration over code.** A user should not open a component to change how their
portfolio looks or what it contains.

**Extensible at the edges.** A new platform is a new directory, never a change to the UI.

A proposal that conflicts with one of these is not automatically rejected — but the
pull request should say which one, and why the trade is worth it.
