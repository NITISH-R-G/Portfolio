import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { text } from "@/features/builder/controls"
import { defineComponent } from "@/features/builder/define"
import type { ComponentInstance } from "@/features/builder/instances"
import type { ManifestLookup } from "@/features/builder/registry"

import { Composed } from "./composed"

/**
 * The public page's own handling of placed components.
 *
 * `builder.test.ts` covers resolution one instance at a time. This covers the *section*: which
 * of a list actually reach the page, in what order, and what appears when none do. A synthetic
 * component is used so the assertions are about `Composed`, not about any real component's
 * markup.
 */

const note = defineComponent({
  id: "note",
  title: "Note",
  category: "Test",
  version: 1,
  props: { body: text({ label: "Body", required: true, default: "A note" }) },
  render: (props) => createElement("p", { "data-note": true }, props.body),
})

const lookup: ManifestLookup = (id) => (id === "note" ? note : undefined)

const instance = (id: string, over: Partial<ComponentInstance> = {}): ComponentInstance => ({
  id, component: "note", version: 1, props: { body: `body of ${id}` }, ...over,
})

const render = (instances: ComponentInstance[]) =>
  renderToStaticMarkup(createElement(Composed, { instances, lookup }))

describe("the composed section", () => {
  it("draws nothing at all when nothing is placed — no empty panel", () => {
    expect(render([])).toBe("")
  })

  it("draws each placed component, in the order placed, keyed by its id", () => {
    const html = render([instance("ci_b"), instance("ci_a"), instance("ci_c")])
    expect(html.match(/data-instance="([^"]+)"/g)).toEqual([
      'data-instance="ci_b"', 'data-instance="ci_a"', 'data-instance="ci_c"',
    ])
    expect(html).toContain('id="composed"')
    expect(html).toContain('data-component="note"')
    expect(html).toContain("body of ci_a")
  })

  it("leaves out an instance whose component no longer exists, and draws the rest", () => {
    const html = render([instance("ci_ok"), instance("ci_gone", { component: "was-removed" }), instance("ci_ok2")])
    expect(html).toContain('data-instance="ci_ok"')
    expect(html).toContain('data-instance="ci_ok2"')
    expect(html).not.toContain("ci_gone")
  })

  it("leaves out an instance with an empty required field, rather than drawing an empty block", () => {
    const html = render([instance("ci_ok"), instance("ci_blank", { props: { body: "   " } })])
    expect(html).toContain('data-instance="ci_ok"')
    expect(html).not.toContain("ci_blank")
  })

  it("leaves out an instance from a newer version of the application", () => {
    const html = render([instance("ci_ok"), instance("ci_future", { version: 99 })])
    expect(html).not.toContain("ci_future")
    expect(html).toContain('data-instance="ci_ok"')
  })

  it("draws nothing when instances exist but none can be shown", () => {
    expect(render([instance("a", { component: "nope" }), instance("b", { props: { body: "" } })])).toBe("")
  })

  it("repairs a corrupt property on the way through, instead of dropping the whole instance", () => {
    const html = render([instance("ci_x", { props: { body: "kept", injected: "<script>alert(1)</script>" } })])
    expect(html).toContain("kept")
    expect(html).not.toContain("script")
    expect(html).not.toContain("injected")
  })

  it("escapes text: a placed component cannot inject markup", () => {
    const html = render([instance("ci_x", { props: { body: "<img src=x onerror=alert(1)>" } })])
    expect(html).not.toContain("<img")
    expect(html).toContain("&lt;img")
  })
})
