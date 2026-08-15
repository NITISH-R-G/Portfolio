# Sample profiles

Eleven complete, realistic portfolios you can try in about five seconds — no account, no
API key, no import.

```bash
npm run example -- list
npm run example -- researcher
npm run dev
```

When you are done:

```bash
npm run example -- restore
```

`restore` puts back your own `portfolio.config.js`, `src/data/manual.json` and imported
sources, all of which are copied aside (as `.mine` files) before a sample is applied.
Applying a second sample never overwrites those copies.

## Why these exist

**To show what the tool does before you commit to it.** Reading a feature list tells you
less than looking at a finished portfolio built from a profile like yours.

**To prove section auto-detection is real.** Each persona deliberately fills a different
part of the schema, and the sections that appear differ accordingly:

| Persona | Sections it produces |
| --- | --- |
| `software-engineer` | projects, experience, education, skills, open source |
| `ai-ml-engineer` | projects, experience, publications, **models**, open source |
| `data-scientist` | experience, education, **models**, achievements |
| `frontend-developer` | projects, experience, **packages**, **talks** |
| `backend-developer` | projects, experience, **packages**, open source |
| `devops-engineer` | experience, **packages**, **certifications** |
| `competitive-programmer` | education, **competitive**, achievements |
| `open-source-maintainer` | projects, open source, **writing**, **packages** |
| `researcher` | experience, education, **publications**, **talks** |
| `student` | education, projects, certifications, competitive, **languages** |
| `hackathon-builder` | **hackathons**, projects, achievements |

Nobody configured those lists. Every persona runs the same `sections: {}` default, and the
generator decides from the data — which is exactly what happens to your own portfolio. If
you have no publications, you get no Publications heading.

The table above is not maintained by hand either: `npm run example -- list` prints the
section list for each persona by running the real pipeline, so it cannot drift from
reality. `tests/examples.test.js` asserts on the same output.

## A note on the numbers

Every figure here is invented but plausible, and none of it pretends to be fetched.
Nothing in `personas.js` carries a `fetchedAt` timestamp, so any statistic derived from it
is labelled **self-reported** rather than **reported** — the same rule that applies to a
real connector for a platform with no public API. You can see the distinction on the stats
row of any sample portfolio.

## Adding one

`examples/personas.js` is a single array. Add an entry with `id`, `name`, `description`,
`config` and `profile`, and it appears in `npm run example -- list` automatically. The
`profile` object uses the schema described in [docs/data-schema.md](../docs/data-schema.md).

A good persona demonstrates a *shape* the others do not — a section combination, an empty
section that should stay hidden, or an edge case like a profile with no projects at all.
