import fs from "node:fs"
import path from "node:path"
import { buildPortfolio } from "@/core/generate/build.js"
import type { Profile } from "@/core/schema/types.js"
import { toPublicManifest } from "@/core/standard/public.js"
import { describe, expect, it } from "vitest"

import {
  toFooter,
  toProfileOptions,
  toTimeline,
} from "@/features/portfolio/data/adapter"

/**
 * No dead settings.
 *
 * The rule this fork is held to is a chain: an admin control writes real configuration, real
 * configuration reaches a real component, and the component renders a real difference. A control
 * that breaks the chain anywhere is worse than a missing feature — it looks like it worked.
 *
 * That failure is not hypothetical here. An entire write API once shipped with its transport
 * deleted: every panel rendered, every button responded, and nothing was ever saved. Nothing in
 * the test suite noticed, because every test asserted that the *functions* behaved.
 *
 * So this asserts the chain end to end, mechanically, and in the direction that catches rot:
 *
 *   completeness — every `setConfig(...)` path in every panel must be listed below. Adding a
 *                  control without saying how it can be observed fails the suite.
 *   liveness     — each listed path must produce an observable difference in something the
 *                  public site actually consumes. Deleting the consumer fails the suite.
 *
 * The probes deliberately do not assert *what* changed, only that a change reaches the output.
 * Pinning exact strings here would make this a change-detector for unrelated refactors, and the
 * question it exists to answer is narrower: is anything still listening?
 */

const ROOT = process.cwd()
const PANELS = path.join(ROOT, "src/admin/panels")

/* -------------------------------------------------------------------------- */
/* What the admin can write                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Every `setConfig('some.path', …)` literal across the panels.
 *
 * Read from source rather than from a maintained list, because a maintained list is exactly the
 * thing that goes stale — the point is to notice controls nobody remembered to declare.
 */
function writtenPaths(): string[] {
  const files = fs
    .readdirSync(PANELS)
    .filter((name) => name.endsWith(".jsx"))
    .map((name) => fs.readFileSync(path.join(PANELS, name), "utf8"))

  const found = new Set<string>()
  for (const source of files) {
    for (const match of source.matchAll(/setConfig\(\s*'([^']+)'/g)) {
      found.add(match[1])
    }
  }
  return [...found].sort()
}

/**
 * Paths built from a template literal, which the scan above cannot see.
 *
 * Listed by hand and asserted to still be written that way, so the exemption cannot silently
 * grow to cover a control that stopped working.
 */
const DYNAMIC = [
  {
    // `setConfig(`sections.${id}`, …)` — one toggle per section, in NavigationPanel.
    path: "sections.<id>",
    file: "NavigationPanel.jsx",
    pattern: /setConfig\(\s*`sections\.\$\{/,
  },
]

/* -------------------------------------------------------------------------- */
/* Probes                                                                     */
/* -------------------------------------------------------------------------- */

const BASE = {
  identity: {
    name: "Ada Lovelace",
    headline: "Analytical Engine Programmer",
    contact: { email: "ada@example.com" },
  },
}

const SOURCES = [
  {
    key: "github",
    profile: {
      identity: { name: "Ada Lovelace" },
      projects: [{ id: "engine", name: "Analytical Engine" }],
      experience: [
        { company: "Acme", role: "Engineer", startDate: "2020-01-01" },
      ],
      education: [
        { institution: "State", degree: "BSc", startDate: "2016-01-01" },
      ],
    },
  },
]

/** Deep-set a dotted path, creating objects on the way down. */
function at(config: Record<string, unknown>, dotted: string, value: unknown) {
  const parts = dotted.split(".")
  let target = config
  for (const part of parts.slice(0, -1)) {
    target = (target[part] ??= {}) as Record<string, unknown>
  }
  target[parts.at(-1)!] = value
  return config
}

/**
 * Everything the build publishes, as one comparable string.
 *
 * `result.config` is deliberately excluded. The resolved config echoes back every key it
 * recognises, so including it made this comparison differ for *any* accepted setting whether or
 * not a single consumer read it — every probe below passed, and would have kept passing with the
 * entire renderer deleted. What is compared here is only what the site is built out of.
 */
function built(config: Record<string, unknown>) {
  const result = buildPortfolio({ config, sources: SOURCES }) as Record<
    string,
    unknown
  >
  return JSON.stringify({
    profile: result.profile,
    sections: result.sections,
    navigation: result.navigation,
    seo: result.seo,
    theme: result.theme,
  })
}

/** The build output with one setting applied, versus without it. */
function changesTheBuild(dotted: string, value: unknown) {
  const before = built(structuredClone(BASE))
  const after = built(
    at(structuredClone(BASE) as Record<string, unknown>, dotted, value)
  )
  expect(after, `${dotted} reaches nothing the site renders`).not.toBe(before)
}

/**
 * A setting whose consumer is a module constant, not a function this test can call.
 *
 * `src/config/site.ts` reads the config once at import time and the app reads *it*; `next.config
 * .ts` does the same for the base path. Neither can be re-evaluated with a different config from
 * inside a test, so what is asserted is the narrower honest claim: the consuming module still
 * reads this key. That is weaker than the behavioural probes above and is used only where the
 * architecture genuinely leaves no stronger option.
 */
function readBy(file: string, pattern: RegExp) {
  const source = fs.readFileSync(path.join(ROOT, file), "utf8")
  expect(source, `${file} no longer reads this setting`).toMatch(pattern)
}

/** A setting the *application* maps, rather than the engine. */
function changesTheAdapter(
  map: (config: never) => unknown,
  dotted: string,
  value: unknown
) {
  const before = JSON.stringify(map(structuredClone(BASE) as never))
  const after = JSON.stringify(
    map(
      at(
        structuredClone(BASE) as Record<string, unknown>,
        dotted,
        value
      ) as never
    )
  )
  expect(after, `${dotted} reaches no component`).not.toBe(before)
}

/** The profile the timeline mapper needs, since it derives from records rather than config. */
function profileFor(config: Record<string, unknown>): Profile {
  return (buildPortfolio({ config, sources: SOURCES }) as { profile: Profile })
    .profile
}

/**
 * How each writable path proves it is still connected.
 *
 * A probe is a claim about the consumer, not about the value — "something downstream reads
 * this". Where that consumer is the build, `changesTheBuild` covers it; where it is a different
 * boundary, the probe names that boundary explicitly.
 */
const PROBES: Record<string, () => void> = {
  /* Sections and navigation ------------------------------------------------- */
  sectionOrder: () =>
    changesTheBuild("sectionOrder", ["projects", "experience"]),
  "sections.blocks": () => changesTheBuild("sections.blocks", true),
  "sections.<id>": () => changesTheBuild("sections.projects", false),
  // The header nav is `MAIN_NAV` in `src/config/site.ts`, built from this key at import time.
  "navigation.items": () => readBy("src/config/site.ts", /navigation\?\.items/),

  /* Footer — mapped by `toFooter` and rendered by `SiteFooter` --------------- */
  "footer.enabled": () => changesTheAdapter(toFooter, "footer.enabled", false),
  "footer.items": () =>
    changesTheAdapter(toFooter, "footer.items", [
      { label: "Built with", values: [{ text: "Next.js" }] },
    ]),
  "footer.showDmca": () => changesTheAdapter(toFooter, "footer.showDmca", true),
  "footer.showSocialLinks": () =>
    changesTheAdapter(toFooter, "footer.showSocialLinks", false),
  "footer.showSourceCode": () =>
    changesTheAdapter(toFooter, "footer.showSourceCode", false),

  /* Profile header — `toProfileOptions` → `ProfileHeader`'s `flipInterval` ---- */
  "profile.flipInterval": () =>
    changesTheAdapter(toProfileOptions, "profile.flipInterval", 9),

  /* Timeline — `toTimeline` → the `Timescale` strip -------------------------- */
  "timeline.birthYear": () => {
    const profile = profileFor(structuredClone(BASE))
    const before = JSON.stringify(
      toTimeline(profile, structuredClone(BASE) as never)
    )
    const after = JSON.stringify(
      toTimeline(
        profile,
        at(
          structuredClone(BASE) as Record<string, unknown>,
          "timeline.birthYear",
          1815
        ) as never
      )
    )
    expect(after, "timeline.birthYear reaches no component").not.toBe(before)
  },
  "timeline.milestones": () => {
    const profile = profileFor(structuredClone(BASE))
    const authored = at(
      structuredClone(BASE) as Record<string, unknown>,
      "timeline.milestones",
      [
        { year: 1833, content: "Met Babbage." },
        { year: 1843, content: "Published the notes." },
      ]
    )
    const result = JSON.stringify(toTimeline(profile, authored as never))
    expect(result, "an authored timeline is ignored").toContain("Met Babbage.")
  },

  /* Site metadata ----------------------------------------------------------- */
  "site.title": () => changesTheBuild("site.title", "A Different Title"),
  "site.description": () =>
    changesTheBuild("site.description", "A different description."),
  // `SITE_INFO.language` in `src/config/site.ts`, which the root layout puts on `<html lang>`.
  "site.language": () =>
    readBy("src/config/site.ts", /SITE_CONFIG\.site\?\.language/),
  "site.ogImage": () => changesTheBuild("site.ogImage", "different-og.png"),
  "site.url": () => changesTheBuild("site.url", "https://different.example"),
  // Next's `basePath`, read once when the config module is evaluated.
  "site.base": () => readBy("next.config.ts", /site\?\.base|site\.base/),

  /**
   * Merged with keywords derived from the profile rather than replacing them, so the probe
   * asserts the authored ones survive that merge — a consumer that read the config and then
   * discarded it would still change the output otherwise.
   */
  "seo.keywords": () => {
    const withKeywords = built(
      at(structuredClone(BASE) as Record<string, unknown>, "seo.keywords", [
        "difference-engine",
      ])
    )
    expect(
      withKeywords,
      "authored keywords never reach the rendered head"
    ).toContain("difference-engine")
  },

  /**
   * Deployment target — a diagnostic setting, and labelled as one.
   *
   * It changes nothing the site renders. What reads it is `scripts/doctor.mjs`, which uses it to
   * catch a base path that contradicts the target. Probing it against the build would have been
   * the dishonest option: it would pass, and it would be describing an effect that does not
   * exist.
   */
  "deployment.target": () =>
    readBy("scripts/doctor.mjs", /config\.deployment\.target/),

  /* Privacy ----------------------------------------------------------------- */
  /**
   * Like `obfuscateEmail`, this governs the published manifest rather than the page. The build
   * output does not carry the address either way, so a build probe passed for the wrong reason.
   */
  "privacy.hideEmail": () => {
    const profile = profileFor(structuredClone(BASE))
    const published = JSON.stringify(
      toPublicManifest(profile, {
        config: { privacy: { obfuscateEmail: false } },
      })
    )
    const withheld = JSON.stringify(
      toPublicManifest(profile, {
        config: { privacy: { obfuscateEmail: false, hideEmail: true } },
      })
    )
    expect(
      published,
      "the manifest never carried the address to begin with"
    ).toContain("ada@example.com")
    expect(withheld, "hideEmail no longer withholds the address").not.toContain(
      "ada@example.com"
    )
  },

  /**
   * The one setting the build does not answer for.
   *
   * `obfuscateEmail` governs the *published manifest*, not the rendered page, and
   * `toPublicManifest` defaults it on — so the observable direction is turning it off. Probing
   * this through the build would have passed for the wrong reason and left the real consumer
   * unguarded.
   */
  "privacy.obfuscateEmail": () => {
    const profile = profileFor(structuredClone(BASE))

    const published = JSON.stringify(
      toPublicManifest(profile, {
        config: { privacy: { obfuscateEmail: false } },
      })
    )
    const withheld = JSON.stringify(
      toPublicManifest(profile, {
        config: { privacy: { obfuscateEmail: true } },
      })
    )

    expect(
      published,
      "the manifest never carried the address to begin with"
    ).toContain("ada@example.com")
    expect(
      withheld,
      "obfuscateEmail no longer withholds the address"
    ).not.toContain("ada@example.com")
  },
}

/* -------------------------------------------------------------------------- */

describe("every admin control writes configuration something reads", () => {
  const paths = writtenPaths()

  it("finds the panels' writes at all", () => {
    // A scan that silently matches nothing would make every assertion below vacuous.
    expect(paths.length).toBeGreaterThan(10)
  })

  it("has a probe for every path a panel writes", () => {
    const undeclared = paths.filter((key) => !(key in PROBES))
    expect(
      undeclared,
      "a control was added without saying how its effect can be observed — add a probe to PROBES"
    ).toEqual([])
  })

  it("probes nothing that is no longer written", () => {
    // The other direction: a probe left behind after its control was deleted would keep
    // asserting that a setting nobody can reach still works.
    const known = new Set([...paths, ...DYNAMIC.map((entry) => entry.path)])
    expect([...Object.keys(PROBES)].filter((key) => !known.has(key))).toEqual(
      []
    )
  })

  for (const [dotted, probe] of Object.entries(PROBES)) {
    it(`${dotted} reaches something real`, probe)
  }
})

describe("dynamically built config paths", () => {
  for (const { path: dotted, file, pattern } of DYNAMIC) {
    it(`${dotted} is still written by ${file}`, () => {
      const source = fs.readFileSync(path.join(PANELS, file), "utf8")
      expect(
        source,
        `${dotted} is no longer written the way this exemption assumes`
      ).toMatch(pattern)
    })
  }
})
