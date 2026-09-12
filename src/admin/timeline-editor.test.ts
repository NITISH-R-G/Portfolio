import { createElement } from "react"
import TimelinePanel from "@/admin/panels/TimelinePanel.jsx"
import { buildPortfolio } from "@/core/generate/build.js"
import { fieldState, presentationState } from "@/core/identity/explain.js"
import { evidenceFor } from "@/core/identity/resolve.js"
import { renderToReadableStream } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Timeline } from "@/features/portfolio/components/timeline"
import { toTimeline } from "@/features/portfolio/data/adapter"

/**
 * The timeline, end to end, and the provenance badges beside it.
 *
 * Two things are being guarded here, and both were real defects rather than hypotheticals.
 *
 * The first is that the timeline was *orphaned*: the component existed, its data module existed,
 * and nothing on the page imported either. An editor for it would have been the purest form of
 * the failure this phase exists to prevent — a panel that saves real configuration to a
 * component no visitor can ever see.
 *
 * The second is subtler and is why the first went unnoticed. `toTimeline` read `role.start`,
 * `award.issuer` and `p.awards`, none of which the normaliser produces — it writes `dates.start`,
 * `organization` and `achievements`. Every one of those reads returned `undefined`, so the
 * derivation produced an empty strip for any real profile, silently and with no error. Nothing
 * caught it because nothing rendered it.
 */

/** Only the parts of a build these tests read. */
type Built = {
  profile: { identity: Record<string, unknown> } & Record<string, unknown>
  config: Record<string, unknown>
  sections: { id: string; visible: boolean; count: number }[]
  evidence: Map<string, unknown[]>
}

/**
 * Render to HTML, allowing async components.
 *
 * The synchronous renderer cannot be used here: the timeline's entries go through `Markdown`,
 * which wraps `MarkdownAsync`, and a synchronous render throws "a component suspended" rather
 * than waiting. Streaming and awaiting `allReady` renders the same tree the page renders — which
 * is the point of testing the real component rather than a stand-in.
 */
async function render(element: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(element)
  await stream.allReady
  return new Response(stream).text()
}

/** A profile with dates in the shape `core/schema/profile.js` actually emits. */
function withRecords() {
  return buildPortfolio({
    config: { identity: { name: "Ada Lovelace" } },
    sources: [
      {
        key: "github",
        profile: {
          identity: { name: "Ada Lovelace" },
          experience: [
            { company: "Acme", role: "Engineer", startDate: "2021-03-01" },
          ],
          education: [
            {
              institution: "State University",
              degree: "BSc",
              startDate: "2018-09-01",
              endDate: "2022-06-01",
            },
          ],
          achievements: [
            { title: "Best Paper", organization: "ACM", date: "2023" },
          ],
        },
      },
    ],
  }) as unknown as Built
}

describe("the timeline is derived from records the normaliser actually produces", () => {
  const built = withRecords()
  const timeline = toTimeline(built.profile, built.config)

  it("finds every dated record", async () => {
    // The regression. Reading the connector's input names instead of the schema's produced an
    // empty strip, so the assertion that matters is simply that anything came out at all.
    const years = timeline.milestones
      .filter((m) => m.content)
      .map((m) => m.year)
    expect(years, "no milestones were derived from dated records").not.toEqual(
      []
    )
    expect(years).toContain(2018) // education start
    expect(years).toContain(2021) // experience start
    expect(years).toContain(2023) // achievement date
  })

  it("names the record, not an 'a new role' fallback", async () => {
    // Each fallback in the derivation fires exactly when the field name is wrong, so a strip
    // full of placeholders is what the previous bug looked like when it half-worked.
    const text = timeline.milestones.map((m) => m.content ?? "").join(" ")
    expect(text).toContain("Acme")
    expect(text).toContain("State University")
    expect(text).toContain("Best Paper")
    expect(text).toContain("ACM")
    expect(text, "a record's name could not be read").not.toContain(
      "a new role"
    )
    expect(text, "a record's name could not be read").not.toContain(
      "a new school"
    )
  })

  it("fills the years between, so the strip is continuous", async () => {
    const years = timeline.milestones.map((m) => m.year)
    expect(years).toEqual([...Array(2023 - 2018 + 1)].map((_, i) => 2018 + i))
  })

  it("lets an authored list replace the derivation outright", async () => {
    const authored = toTimeline(built.profile, {
      ...built.config,
      timeline: { milestones: [{ year: 1833, content: "Met Babbage." }] },
    } as never)
    expect(authored.milestones.map((m) => m.content).join(" ")).toContain(
      "Met Babbage."
    )
    expect(
      authored.milestones.map((m) => m.content ?? "").join(" "),
      "an authored list was merged with the derivation instead of replacing it"
    ).not.toContain("Acme")
  })

  it("re-bases the age column on a configured birth year", async () => {
    const based = toTimeline(built.profile, {
      ...built.config,
      timeline: { birthYear: 2000 },
    } as never)
    expect(based.birthYear).toBe(2000)
    expect(based.milestones[0].year).toBe(2000)
  })
})

describe("the timeline section appears only when it has something to draw", () => {
  const section = (profile: Record<string, unknown>) => {
    const built = buildPortfolio({
      config: { identity: { name: "Ada" } },
      sources: [
        { key: "github", profile: { identity: { name: "Ada" }, ...profile } },
      ],
    }) as unknown as Built
    return built.sections.find((entry) => entry.id === "timeline")!
  }

  it("exists in the engine's catalogue", async () => {
    // Without this the page's `PAGE_SECTION_BY_ENGINE_ID` entry maps from nothing and the
    // section can never render, however complete the editor is.
    expect(section({})).toBeTruthy()
  })

  it("stays hidden for a single dated record", async () => {
    // One tick on a rail reads as broken rather than sparse.
    expect(
      section({
        experience: [{ company: "Acme", role: "X", startDate: "2020-01-01" }],
      }).visible
    ).toBe(false)
  })

  it("counts only years the strip will actually mark", async () => {
    // An end date moves no tick, because the derivation writes "Started at …" and has no text
    // for an ending. Counting it would let the threshold pass on a year drawn empty.
    const oneRoleThatEnded = section({
      experience: [
        {
          company: "Acme",
          role: "X",
          startDate: "2020-01-01",
          endDate: "2024-01-01",
        },
      ],
    })
    expect(
      oneRoleThatEnded.count,
      "an end year was counted as a milestone"
    ).toBe(1)
    expect(oneRoleThatEnded.visible).toBe(false)
  })

  it("appears once two different years carry an entry", async () => {
    expect(
      section({
        experience: [{ company: "Acme", role: "X", startDate: "2020-01-01" }],
        achievements: [{ title: "Prize", date: "2022" }],
      }).visible
    ).toBe(true)
  })
})

describe("the Timeline component", () => {
  it("renders the milestones it is given, not a module constant", async () => {
    // The prop path is what makes the admin preview live. If it fell back to the built-in
    // export, editing would change the config and the preview would sit there unchanged.
    const html = await render(
      createElement(Timeline, {
        birthYear: 2000,
        milestones: [{ year: 2010, content: "Something happened." }],
      })
    )
    expect(html).toContain("Something happened.")
    expect(html).toContain("2010")
    expect(html).toContain(">10<") // the age column: 2010 − 2000
  })

  it("renders nothing rather than an empty rail", async () => {
    expect(await render(createElement(Timeline, { milestones: [] }))).toBe("")
  })
})

describe("the Timeline panel", () => {
  const panel = (config: Record<string, unknown> = {}) => {
    const built = buildPortfolio({
      config: { identity: { name: "Ada Lovelace" }, ...config },
      sources: [
        {
          key: "github",
          profile: {
            identity: { name: "Ada Lovelace" },
            experience: [
              { company: "Acme", role: "Engineer", startDate: "2021-03-01" },
            ],
            achievements: [
              { title: "Best Paper", organization: "ACM", date: "2023" },
            ],
          },
        },
      ],
    })
    return render(
      createElement(TimelinePanel, {
        builder: { built, documents: [], configDraft: {}, setConfig: () => {} },
      } as never)
    )
  }

  it("offers the derived mode's controls and no per-year editing", async () => {
    const html = await panel()
    expect(html).toContain(
      "Derived from the dates on your roles, degrees and awards."
    )
    expect(html).toContain("Write my own instead")
    // Per-year controls in derived mode would imply a merge `toTimeline` does not perform.
    expect(html).not.toContain("Add a year")
  })

  it("states how many years the derivation actually found", async () => {
    expect(await panel()).toContain("2 years have an entry")
  })

  it("switches to per-year controls once a list is authored", async () => {
    const html = await panel({
      timeline: { milestones: [{ year: 1833, content: "Met Babbage." }] },
    })
    expect(html).toContain("Written by hand")
    expect(html).toContain("Add a year")
    expect(html).toContain("Go back to the derived timeline")
    expect(html).toContain("Met Babbage.")
  })

  it("says why the section is hidden rather than leaving the edits unexplained", async () => {
    const html = await render(
      createElement(TimelinePanel, {
        builder: {
          built: buildPortfolio({ config: { identity: { name: "Ada" } } }),
          documents: [],
          configDraft: {},
          setConfig: () => {},
        },
      } as never)
    )
    expect(html).toContain("Hidden")
    expect(html).toContain("at least two different years")
  })

  it("renders the real component in its preview, not an admin stand-in", async () => {
    // `Timescale` is his registry component; the panel's preview must be the thing the page
    // renders, which is the whole premise of the workbench.
    expect(await panel()).toContain("Best Paper")
  })
})

/* -------------------------------------------------------------------------- */
/* Provenance badges                                                          */
/* -------------------------------------------------------------------------- */

describe("a field says where its value came from", () => {
  const built = buildPortfolio({
    config: { identity: { name: "From Config" } },
    sources: [
      {
        key: "github",
        profile: {
          identity: {
            name: "GitHub Name",
            headline: "Engineer",
            location: "Earth",
          },
        },
      },
    ],
    overrides: { identity: { location: "Remote" } },
  }) as unknown as Built

  const state = (field: string) =>
    fieldState({
      field,
      value: built.profile.identity[field],
      overrides: {},
      claims: evidenceFor(
        { evidence: built.evidence } as never,
        "identity",
        field
      ),
    })

  it("names the connector an imported value came from", async () => {
    // "Imported" alone still leaves you guessing which of forty platforms said it.
    expect(state("headline")).toMatchObject({
      state: "imported",
      source: "github",
    })
  })

  it("calls a value written in the config file configured, not imported", async () => {
    // Config is authored. Calling it "imported" would suggest the next run could change it.
    expect(state("name").state).toBe("configured")
  })

  it("reads the override from the winning claim, not the caller's bucket", async () => {
    // The bucket passed in above is deliberately empty. Trusting it labelled an overridden
    // field "imported from you" — the layer said override and the two halves disagreed.
    expect(state("location")).toMatchObject({
      state: "overridden",
      canRevert: true,
    })
  })

  it("says what reverting would restore", async () => {
    // A revert button that cannot say what it restores is asking someone to guess.
    expect(state("location").underlying).toBe("Earth")
  })

  it("reports an absent value as missing, with nothing to revert", async () => {
    expect(state("pronouns")).toMatchObject({
      state: "missing",
      canRevert: false,
    })
  })

  it("never invents provenance for a presentation setting", async () => {
    // A theme or a flip interval is not a claim about a person: nothing imported it and no
    // source can contradict it. Routing it through `fieldState` would manufacture a source.
    expect(presentationState("minimal-dark", "").source).toBeUndefined()
    expect(presentationState("minimal-dark", "").state).toBe("configured")
    expect(presentationState(undefined, "").state).toBe("default")
    expect(presentationState(undefined, "").canRevert).toBe(false)
  })
})
