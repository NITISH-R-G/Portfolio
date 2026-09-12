import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { buildPortfolio } from "@/core/generate/build.js"
import { CONNECTORS } from "@/connectors/index.js"
import ConnectPanel from "@/admin/panels/ConnectPanel.jsx"
import SourcesPanel from "@/admin/panels/SourcesPanel.jsx"

/**
 * What the two source screens actually render.
 *
 * `tests/source-browser.test.js` proves the catalogue logic. This proves the logic reaches the
 * markup — a separate claim, and the one that was false for a year: the panels existed, looked
 * plausible, and showed twelve of twenty-nine connectors behind a "More" button while every
 * control beneath them was wired to an API with no server.
 *
 * Rendered as elements rather than called as functions, because both hold state; and rendered
 * with `renderToStaticMarkup`, so `useEffect` never runs and the panels are exercised in exactly
 * the state a fresh load starts in — before the sidecar has answered.
 */

const built = buildPortfolio({
  config: {
    identity: { name: "Ada Lovelace" },
    dataSources: { github: { username: "ada" } },
  },
})

/** The shape the panels take from `state.js`, with nothing they do not read. */
const builder = {
  built,
  documents: [],
  configDraft: {},
}

const connect = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(ConnectPanel, { builder: { ...builder, ...over } } as never))

const sources = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(SourcesPanel, { builder: { ...builder, ...over } } as never))

describe("the Connect browser", () => {
  const html = connect()

  it("renders every connector in the registry, not a featured subset", () => {
    for (const connector of CONNECTORS) {
      expect(html, `${connector.name} is missing`).toContain(connector.name)
    }
  })

  it("offers a category for each group and none that is empty", () => {
    // Read off the nav rather than the source list, so a label that renders but filters nothing
    // would still fail.
    expect(html).toContain('aria-label="Filter by category"')
    for (const label of ["Code", "Research", "Writing", "Competitive programming"]) {
      expect(html).toContain(label)
    }
    // Design became real in Phase 7 — CodePen, Behance and Dribbble are all in it, so it is
    // now expected rather than forbidden.
    expect(html).toContain("Design")

    // The categories that still have no connector behind them must stay absent. An empty tab
    // is a promise the engine cannot keep.
    for (const absent of ["Deployment", "Credentials", "Coming soon"]) {
      expect(html).not.toContain(`>${absent}<`)
    }
  })

  it("offers a search field over the whole catalogue", () => {
    expect(html).toContain('aria-label="Search platforms"')
    expect(html).toContain(`Search ${CONNECTORS.length} platforms`)
  })

  it("shows the connected source as connected, with its account", () => {
    expect(html).toContain("Connected")
    expect(html).toContain("ada")
  })

  it("says what each platform will actually do, on the row", () => {
    // The capability sentence, not a generic tagline.
    expect(html).toContain("Imports automatically")
    expect(html).toContain("publishes nothing that can be read")
  })

  it("never labels an unreadable platform's row as a connection", () => {
    // The visible half of the honesty rule. `source-browser.test.js` proves `actionFor` refuses
    // to return a connect action for these; this proves the row prints that refusal, because a
    // row saying CONNECT beside LinkedIn is the lie regardless of what the function returned.
    for (const name of ["LinkedIn", "Google Scholar", "ResearchGate"]) {
      const row = html.slice(html.indexOf(`>${name}<`))
      const label = row.slice(0, row.indexOf("</li>"))
      expect(label, `${name} offers a connect action`).toContain("Add profile URL")
      expect(label, `${name} offers a connect action`).not.toContain(">Connect<")
    }
    // And Kaggle asks for its credential rather than pretending it can just connect.
    const kaggle = html.slice(html.indexOf(">Kaggle<"))
    expect(kaggle.slice(0, kaggle.indexOf("</li>"))).toContain("Add credential")
  })

  it("renders no OAuth control anywhere", () => {
    // OAuth is on the ladder and deliberately unavailable. A button implying otherwise is the
    // exact dishonesty this screen exists to avoid.
    expect(html.toLowerCase()).not.toContain("oauth")
    expect(html.toLowerCase()).not.toContain("sign in with")
    expect(html.toLowerCase()).not.toContain("authorize")
  })

  it("keeps the paste-anything input", () => {
    expect(html).toContain("add-anything-input")
    expect(html).toContain("Paste a profile URL")
  })

  it("uses the workbench, not the old bespoke admin CSS", () => {
    for (const legacy of ["platform-tile", "btn-admin", "admin-subheading", "add-anything-foot"]) {
      expect(html, `${legacy} survived the migration`).not.toContain(legacy)
    }
    // And is built from his line language instead.
    expect(html).toContain("screen-line-bottom")
    expect(html).toContain("border-line")
  })
})

describe("the Sources screen", () => {
  it("renders a row for the configured source, from the health model", () => {
    const html = sources()
    expect(html).toContain("GitHub")
    // `deriveHealth` has never seen a status for this build, so it must say so rather than
    // implying a successful import.
    expect(html).toContain("Never imported")
  })

  it("shows the summary counts the health model produces", () => {
    const html = sources()
    expect(html).toContain("connected")
    expect(html).toContain("records imported")
  })

  it("renders real health facts when a status exists", () => {
    const withStatus = buildPortfolio({
      config: { identity: { name: "Ada" }, dataSources: { github: { username: "ada" } } },
    })
    // Cast at the boundary: `meta` is a loose record in the engine's own typing, and the shape
    // being planted here is exactly what `import.mjs` writes into `status.json`.
    ;(withStatus.profile as { meta: Record<string, unknown> }).meta = {
      ...withStatus.profile.meta,
      sourceStatus: {
        github: {
          connector: "github",
          name: "GitHub",
          state: "partial",
          message: "Imported 37 projects.",
          account: "ada",
          fetchedAt: new Date().toISOString(),
          lastSuccessfulAt: new Date().toISOString(),
          recordsImported: 66,
          recordsChanged: { added: 2, removed: 0, updated: 1 },
          counts: { projects: 37 },
        },
      },
    }
    const html = renderToStaticMarkup(
      createElement(SourcesPanel, { builder: { ...builder, built: withStatus } } as never)
    )
    expect(html).toContain("Imported 37 projects.")
    expect(html).toContain("66 records")
    expect(html).toContain("+2")
    expect(html).toContain("~1")
    expect(html).toContain("Partial")
  })

  it("shows a real empty state when nothing is configured", () => {
    const empty = buildPortfolio({ config: { identity: { name: "Ada" } } })
    const html = renderToStaticMarkup(
      createElement(SourcesPanel, { builder: { ...builder, built: empty, documents: [] } } as never)
    )
    expect(html).toContain("No sources yet")
    expect(html).toContain("Go to Connect")
  })

  it("renders no refresh control before the sidecar has answered", () => {
    // `live` is null until the probe resolves, and a refresh button that cannot refresh is a
    // dead control. useEffect does not run here, so this is exactly that pre-answer state.
    const html = sources()
    expect(html).not.toContain("Refresh all")
    expect(html).not.toContain('aria-label="Refresh GitHub"')
  })

  it("uses the workbench, not the old bespoke admin CSS", () => {
    const html = sources()
    for (const legacy of ["health-row", "health-summary", "btn-admin", "connector-catalogue"]) {
      expect(html, `${legacy} survived the migration`).not.toContain(legacy)
    }
    expect(html).toContain("screen-line-bottom")
  })
})
