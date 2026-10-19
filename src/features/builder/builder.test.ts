import fs from "node:fs"
import path from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type * as MotionReact from "motion/react"

import { resolveConfig } from "@/core/config/resolve.js"
import type { Control } from "./controls"
import { cssColor } from "./color"
import { boolean, color, link, number, range, select, text } from "./controls"
import { MAX_CONTROLS, ManifestError, defineComponent } from "./define"
import {
  addInstance,
  createInstance,
  migrateInstance,
  moveInstance,
  newInstanceId,
  removeInstance,
  updateProps,
} from "./instances"
import type { ComponentInstance } from "./instances"
import { MANIFESTS, getManifest } from "./registry"
import { describeRegistryItem } from "./registry-info"
import { renderResolved, resolveInstance } from "./resolve"
import { isSafeLink, validateProps, validateValue } from "./validate"
import { shimmeringText } from "./manifests/shimmering-text"

// The shimmer reads the visitor's motion preference, which has no answer in Node; and the real
// registry component is replaced by a stub that prints exactly the props it was given, so the
// tests can assert what the *mapping* does without depending on how motion serialises itself.
const motion = vi.hoisted(() => ({ reduced: false }))
type Captured = { text: string; duration: number; isStopped: boolean; style: Record<string, string> }
const captured = vi.hoisted(() => ({ last: null as unknown }))
vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof MotionReact>()
  return { ...actual, useReducedMotion: () => motion.reduced }
})
vi.mock("@/registry/components/shimmering-text", () => ({
  ShimmeringText: (props: Record<string, unknown>) => {
    captured.last = props
    return createElement("span", { "data-stub": JSON.stringify(props) })
  },
}))

/**
 * The builder's foundations: controls, manifests, instances, resolution, and the first real
 * component.
 *
 * The properties worth defending are the ones that fail quietly. A stored value that reaches a
 * `style` attribute unchecked. An id that is really a position. A migration that stamps a new
 * version on data it did not convert. A control that is declared, shown in the inspector, saved
 * to disk, and ignored by the component — which is the dead setting this project exists to
 * avoid, and which the "every control changes the output" test below makes impossible to ship.
 */

/**
 * The engine's resolved config, typed for what these tests read. `PortfolioConfig` is the
 * engine's loose JSDoc type and does not list every section (neither does it list `footer`);
 * the app reads them through casts at its boundary, and so do these.
 */
const resolved = (config: unknown) =>
  (config as { components: { instances: ComponentInstance[] } }).components

/* Controls and validation ------------------------------------------------------- */

describe("validating values", () => {
  const v = (control: Parameters<typeof validateValue>[0], value: unknown) => validateValue(control, value, "p")

  describe("text", () => {
    const t = text({ label: "T", default: "d", maxLength: 10 })

    it("accepts a string and takes the default for a missing one", () => {
      expect(v(t, "hello")).toEqual({ value: "hello", issues: [] })
      expect(v(t, undefined)).toEqual({ value: "d", issues: [] })
    })

    it("replaces a value of the wrong type with the default, and says so", () => {
      for (const bad of [5, true, null, {}, [], () => "x"]) {
        const r = v(t, bad)
        expect(r.value).toBe("d")
        expect(r.issues[0]).toMatchObject({ level: "error", path: "p" })
      }
    })

    it("strips control characters, including newlines in single-line text", () => {
      expect(v(t, "a\u0000b\u0007c").value).toBe("a b c")
      expect(v(t, "line\none").value).toBe("line one")
    })

    it("keeps newlines and tabs in multiline text, and only those", () => {
      const multi = text({ label: "M", multiline: true })
      expect(v(multi, "a\nb\tc\u0000d").value).toBe("a\nb\tcd")
    })

    it("truncates to maxLength with a warning, not an error", () => {
      const r = v(t, "x".repeat(25))
      expect(r.value).toBe("x".repeat(10))
      expect(r.issues).toEqual([expect.objectContaining({ level: "warning" })])
    })

    it("has a default ceiling when none is given", () => {
      expect((v(text({ label: "T" }), "x".repeat(900)).value as string).length).toBe(500)
    })

    it("a required value that is empty makes the instance unrenderable", () => {
      const req = text({ label: "Title", required: true, default: "" })
      for (const empty of ["", "   ", "\n\t"]) {
        expect(v(req, empty).issues).toEqual([expect.objectContaining({ blocking: true })])
      }
      expect(v(req, undefined).issues).toEqual([expect.objectContaining({ blocking: true })])
      expect(v(req, "x").issues).toEqual([])
    })
  })

  describe("number and range", () => {
    it("rejects anything that is not a finite number", () => {
      const n = number({ label: "N", default: 3 })
      for (const bad of ["5", NaN, Infinity, -Infinity, null, true, []]) {
        expect(v(n, bad).value, String(bad)).toBe(3)
        expect(v(n, bad).issues[0].level).toBe("error")
      }
    })

    it("clamps to its bounds with a warning", () => {
      const n = number({ label: "N", min: 1, max: 5 })
      expect(v(n, 0)).toMatchObject({ value: 1, issues: [{ level: "warning" }] })
      expect(v(n, 9)).toMatchObject({ value: 5, issues: [{ level: "warning" }] })
      expect(v(n, 3)).toEqual({ value: 3, issues: [] })
    })

    it("rounds when it must be an integer", () => {
      expect(v(number({ label: "N", integer: true }), 2.6).value).toBe(3)
    })

    it("snaps a range to its step grid, without floating point residue", () => {
      const r = range({ label: "R", min: 0.4, max: 4, step: 0.1 })
      expect(v(r, 1.234).value).toBe(1.2)
      expect(v(r, 0.1 + 0.2 + 0.4).value).toBe(0.7) // 0.7000000000000001 in raw arithmetic
      expect(v(r, 99).value).toBe(4)
      expect(v(r, -3).value).toBe(0.4)
    })
  })

  describe("boolean and select", () => {
    it("a boolean must be a boolean — 'true' and 1 are not", () => {
      const b = boolean({ label: "B", default: false })
      expect(v(b, true).value).toBe(true)
      for (const bad of ["true", 1, 0, null]) expect(v(b, bad).value).toBe(false)
    })

    it("a select must be one of its options, and names them when it is not", () => {
      const s = select({ label: "S", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }], default: "a" })
      expect(v(s, "b").value).toBe("b")
      const bad = v(s, "c")
      expect(bad.value).toBe("a")
      expect(bad.issues[0].message).toMatch(/a, b/)
      for (const notString of [1, null, {}]) expect(v(s, notString).value).toBe("a")
    })

    it("an inherited property name is not an option", () => {
      const s = select({ label: "S", options: [{ value: "a", label: "A" }] })
      expect(v(s, "toString").value).toBe("a")
      expect(v(s, "__proto__").value).toBe("a")
    })
  })

  describe("colour", () => {
    const c = color({ label: "C", tokens: ["primary", "foreground"] })

    it("accepts no override, a listed theme token, or a hex value (normalised)", () => {
      expect(v(c, "").value).toBe("")
      expect(v(c, "token:primary").value).toBe("token:primary")
      expect(v(c, "#ABC").value).toBe("#abc")
      expect(v(c, "#A1B2C3").value).toBe("#a1b2c3")
      expect(v(c, "#a1b2c3ff").value).toBe("#a1b2c3ff")
    })

    it("refuses everything else — this is what reaches a style attribute", () => {
      for (const bad of [
        "red", "rgb(0,0,0)", "url(https://evil/x)", "expression(alert(1))", "var(--x)",
        "#12", "#12345", "#gggggg", "token:secret", "token:", "token:../x", "javascript:alert(1)",
        "#abc; background:url(x)", "#abc\"onload=\"x", 5, null,
      ]) {
        expect(v(c, bad).value, String(bad)).toBe("")
        expect(v(c, bad).issues[0].level).toBe("error")
      }
    })

    it("can forbid custom colours entirely", () => {
      const strict = color({ label: "C", tokens: ["primary"], allowCustom: false })
      expect(v(strict, "#fff").value).toBe("")
      expect(v(strict, "token:primary").value).toBe("token:primary")
    })

    it("cssColor formats only what validation accepts, and nothing else", () => {
      expect(cssColor("token:primary")).toBe("var(--primary)")
      expect(cssColor("#a1b2c3")).toBe("#a1b2c3")
      for (const bad of ["", "red", "token:", "token:A", "url(x)", "#12"]) expect(cssColor(bad)).toBeUndefined()
    })
  })

  describe("links", () => {
    const l = link({ label: "L" })

    it("accepts https, http, mailto, root-relative paths and anchors", () => {
      for (const ok of ["https://example.com/a?b=1#c", "http://example.com", "mailto:a@b.co", "/blocks", "/a/b?c", "#stack"]) {
        expect(v(l, ok).value, ok).toBe(ok)
        expect(isSafeLink(ok)).toBe(true)
      }
    })

    it("refuses schemes that execute or exfiltrate, and protocol-relative URLs", () => {
      for (const bad of [
        "javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>1</script>", "vbscript:x",
        "file:///etc/passwd", "ftp://x", "//evil.example", "/\\evil.example", "\\\\evil", "about:blank",
        "https://", "not a url", "x".repeat(2100),
      ]) {
        expect(v(l, bad).value, bad.slice(0, 30)).toBe("")
        expect(isSafeLink(bad), bad.slice(0, 30)).toBe(false)
      }
    })

    it("trims, and treats a whitespace-obscured scheme as what it is", () => {
      expect(v(l, "  https://example.com  ").value).toBe("https://example.com")
      expect(v(l, "  javascript:alert(1)").value).toBe("")
      expect(v(l, "java\tscript:alert(1)").value).toBe("")
    })

    it("a required link that is empty is blocking", () => {
      const req = link({ label: "L", required: true })
      expect(v(req, "").issues).toEqual([expect.objectContaining({ blocking: true })])
    })
  })
})

describe("validating a whole property bag", () => {
  const controls = shimmeringText.props

  it("gives every declared property a valid value, from nothing", () => {
    const r = validateProps(controls, {})
    expect(Object.keys(r.props).sort()).toEqual(Object.keys(controls).sort())
    expect(r.issues).toEqual([])
    expect(r.renderable).toBe(true)
  })

  it("drops what no control declares — the guarantee that nothing undeclared is editable", () => {
    const r = validateProps(controls, {
      text: "Hi", className: "fixed inset-0", style: { position: "fixed" },
      dangerouslySetInnerHTML: { __html: "<script>1</script>" }, onClick: "alert(1)",
    })
    expect(Object.keys(r.props)).not.toContain("className")
    expect(Object.keys(r.props)).not.toContain("dangerouslySetInnerHTML")
    expect(r.issues.filter((i) => i.level === "warning").map((i) => i.path).sort())
      .toEqual(["className", "dangerouslySetInnerHTML", "onClick", "style"])
  })

  it("a corrupt property falls back alone; the others are untouched", () => {
    const r = validateProps(controls, { text: "Keep me", size: "gigantic", duration: 2.5 })
    expect(r.props.text).toBe("Keep me")
    expect(r.props.duration).toBe(2.5)
    expect(r.props.size).toBe("lg")
    expect(r.issues.map((i) => i.path)).toEqual(["size"])
    expect(r.renderable).toBe(true)
  })

  it("an empty required property is not renderable, rather than rendering an empty heading", () => {
    expect(validateProps(controls, { text: "   " }).renderable).toBe(false)
  })

  it("a non-object bag is survived", () => {
    for (const bad of [null, "text", 5, [], true]) {
      const r = validateProps(controls, bad)
      expect(r.props.text).toBe("Building things that ship.")
      expect(r.issues.length).toBeGreaterThan(0)
    }
  })

  it("an own `__proto__` key from JSON.parse is ignored and pollutes nothing", () => {
    const r = validateProps(controls, JSON.parse('{"text":"x","__proto__":{"polluted":true}}'))
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect((r.props as Record<string, unknown>).polluted).toBeUndefined()
    expect(r.issues.some((i) => i.path === "__proto__")).toBe(true)
  })

  it("does not read inherited properties as values", () => {
    const inherited = Object.create({ text: "from the prototype" })
    expect(validateProps(controls, inherited).props.text).toBe("Building things that ship.")
  })
})

/* Defining components ----------------------------------------------------------- */

describe("defining a component", () => {
  const base = { id: "demo", title: "Demo", category: "Test", version: 1, props: {}, render: () => null }
  const bad = (override: object, message: RegExp) =>
    expect(() => defineComponent({ ...base, ...override } as never)).toThrow(message)

  it("accepts a well-formed definition and freezes it", () => {
    const m = defineComponent({ ...base, props: { label: text({ label: "L" }) } })
    expect(Object.isFrozen(m)).toBe(true)
    expect(m.id).toBe("demo")
  })

  it("throws a ManifestError that names the component", () => {
    try {
      defineComponent({ ...base, id: "Bad Id" } as never)
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(ManifestError)
      expect((error as Error).message).toMatch(/Component "Bad Id"/)
    }
  })

  it("checks identity and version", () => {
    bad({ id: "" }, /id must be/)
    bad({ id: "A" }, /id must be/)
    bad({ id: "a_b" }, /id must be/)
    bad({ version: 0 }, /version/)
    bad({ version: 1.5 }, /version/)
    bad({ title: "  " }, /title/)
  })

  it("rejects unusable property names, and too many controls", () => {
    for (const name of ["__proto__", "constructor", "prototype", "1abc", "has space", "kebab-case", ""]) {
      bad({ props: Object.fromEntries([[name, text({ label: "x" })]]) }, /usable property name/)
    }
    const many = Object.fromEntries(Array.from({ length: MAX_CONTROLS + 1 }, (_, i) => [`p${i}`, text({ label: "x" })]))
    bad({ props: many }, /at most/)
  })

  it("rejects contradictory bounds and empty or duplicated options", () => {
    bad({ props: { r: range({ label: "r", min: 5, max: 1, step: 1 }) } }, /min < max/)
    bad({ props: { r: range({ label: "r", min: 0, max: 1, step: 0 }) } }, /positive step/)
    bad({ props: { n: number({ label: "n", min: 9, max: 1 }) } }, /min is above max/)
    bad({ props: { s: select({ label: "s", options: [] as never }) } }, /a select needs options/)
    bad({ props: { s: select({ label: "s", options: [{ value: "a", label: "A" }, { value: "a", label: "B" }] }) } }, /duplicate option/)
  })

  it("rejects a default that fails its own control", () => {
    bad({ props: { r: range({ label: "r", min: 0, max: 1, step: 0.1, default: 9 }) } }, /default is not valid/)
    bad({ props: { s: select({ label: "s", options: [{ value: "a", label: "A" }], default: "zzz" as never }) } }, /default is not valid/)
    bad({ props: { c: color({ label: "c", tokens: ["primary"], default: "red" }) } }, /default is not valid/)
    bad({ props: { l: link({ label: "l", default: "javascript:alert(1)" }) } }, /default is not valid/)
  })

  it("allows a required field to default to empty, because it is blocking, not invalid", () => {
    expect(() => defineComponent({ ...base, props: { t: text({ label: "t", required: true }) } })).not.toThrow()
  })

  it("requires a migration for every step below the current version", () => {
    bad({ version: 3, migrations: { 1: (p: object) => p } }, /no migration from version 2/)
    bad({ version: 2, migrations: { 5: (p: object) => p } }, /must migrate a version below/)
    expect(() => defineComponent({ ...base, version: 3, migrations: { 1: (p) => p, 2: (p) => p } })).not.toThrow()
  })
})

/* Instances --------------------------------------------------------------------- */

describe("instance identity", () => {
  it("ids have a fixed shape", () => {
    expect(newInstanceId()).toMatch(/^ci_[a-z0-9]{12}$/)
  })

  it("ids do not collide, even across many thousands", () => {
    const seen = new Set(Array.from({ length: 20_000 }, () => newInstanceId()))
    expect(seen.size).toBe(20_000)
  })

  it("draws from the injected randomness, and avoids modulo bias", () => {
    // 252 is the first byte that would bias the alphabet (256 - 256 % 36 = 252): it must be skipped.
    const biased = { getRandomValues: (a: Uint8Array) => { a.fill(255); return a } }
    let calls = 0
    const mixed = {
      getRandomValues: (a: Uint8Array) => {
        calls += 1
        a.fill(calls === 1 ? 255 : 0)
        return a
      },
    }
    expect(newInstanceId(mixed as never)).toBe("ci_" + "a".repeat(12))
    expect(calls).toBe(2)
    expect(() => {
      // All-bias source would loop forever; prove the guard by bounding it.
      let n = 0
      const guarded = { getRandomValues: (a: Uint8Array) => { if (++n > 3) throw new Error("rejected every byte"); return biased.getRandomValues(a) } }
      newInstanceId(guarded as never)
    }).toThrow("rejected every byte")
  })

  it("an id is not an array index: it survives reordering and deletion", () => {
    const a = createInstance(shimmeringText, "ci_a")
    const b = createInstance(shimmeringText, "ci_b")
    const c = createInstance(shimmeringText, "ci_c")
    let list: readonly ComponentInstance[] = [a, b, c]
    list = moveInstance(list, "ci_c", -1)
    list = moveInstance(list, "ci_c", -1)
    list = removeInstance(list, "ci_a")
    expect(list.map((i) => i.id)).toEqual(["ci_c", "ci_b"])
    const result = updateProps(list, "ci_b", { text: "Edited" }, shimmeringText)
    expect(result.list.find((i) => i.id === "ci_b")?.props.text).toBe("Edited")
    expect(result.list.find((i) => i.id === "ci_c")?.props.text).toBe("Building things that ship.")
  })
})

describe("instance operations", () => {
  const make = (id: string) => createInstance(shimmeringText, id)

  it("a new instance holds EVERY property, so it never changes when a default does", () => {
    const i = make("ci_x")
    expect(Object.keys(i.props).sort()).toEqual(Object.keys(shimmeringText.props).sort())
    expect(i).toMatchObject({ id: "ci_x", component: "shimmering-text", version: shimmeringText.version })
  })

  it("stores only plain JSON, which is what the engine will accept", () => {
    const { config } = resolveConfig({ components: { instances: [make("ci_x")] } } as never)
    expect(resolved(config).instances).toHaveLength(1)
    expect(JSON.parse(JSON.stringify(make("ci_x")))).toEqual(make("ci_x"))
  })

  it("adds, with a position clamped into range and duplicates ignored", () => {
    const a = make("ci_a"), b = make("ci_b")
    expect(addInstance([a], b).map((i) => i.id)).toEqual(["ci_a", "ci_b"])
    expect(addInstance([a], b, 0).map((i) => i.id)).toEqual(["ci_b", "ci_a"])
    expect(addInstance([a], b, 99).map((i) => i.id)).toEqual(["ci_a", "ci_b"])
    expect(addInstance([a], b, -5).map((i) => i.id)).toEqual(["ci_b", "ci_a"])
    expect(addInstance([a], make("ci_a")).map((i) => i.id)).toEqual(["ci_a"])
  })

  it("moves one step and is a no-op at either end, returning the same list", () => {
    const list = [make("ci_a"), make("ci_b"), make("ci_c")]
    expect(moveInstance(list, "ci_b", 1).map((i) => i.id)).toEqual(["ci_a", "ci_c", "ci_b"])
    expect(moveInstance(list, "ci_a", -1)).toBe(list)
    expect(moveInstance(list, "ci_c", 1)).toBe(list)
    expect(moveInstance(list, "missing", 1)).toBe(list)
  })

  it("removes, and an unknown id changes nothing", () => {
    const list = [make("ci_a"), make("ci_b")]
    expect(removeInstance(list, "ci_a").map((i) => i.id)).toEqual(["ci_b"])
    expect(removeInstance(list, "nope")).toBe(list)
  })

  it("never mutates what it is given", () => {
    const list = Object.freeze([make("ci_a"), make("ci_b")].map((i) => Object.freeze({ ...i, props: Object.freeze({ ...i.props }) })))
    const snapshot = JSON.stringify(list)
    addInstance(list as never, make("ci_c"))
    removeInstance(list, "ci_a")
    moveInstance(list, "ci_a", 1)
    updateProps(list, "ci_a", { text: "x" }, shimmeringText)
    expect(JSON.stringify(list)).toBe(snapshot)
  })

  it("an edit is validated before it is stored, and what is stored is what will render", () => {
    const list = [make("ci_a")]
    const { list: next, issues } = updateProps(list, "ci_a", { duration: 99, size: "huge", text: "Fine" }, shimmeringText)
    expect(next[0].props).toMatchObject({ duration: 4, size: "lg", text: "Fine" })
    expect(issues.map((i) => i.path).sort()).toEqual(["duration", "size"])
  })

  it("saving cleans a hand-edited file of undeclared keys", () => {
    const dirty: ComponentInstance = { ...make("ci_a"), props: { ...make("ci_a").props, className: "evil", extra: 1 } }
    const { list } = updateProps([dirty], "ci_a", {}, shimmeringText)
    expect(Object.keys(list[0].props)).not.toContain("className")
    expect(Object.keys(list[0].props)).not.toContain("extra")
  })

  it("editing an unknown instance returns the same list", () => {
    const list = [make("ci_a")]
    expect(updateProps(list, "nope", { text: "x" }, shimmeringText).list).toBe(list)
  })
})

/* Versioning -------------------------------------------------------------------- */

describe("migrating instances between schema versions", () => {
  // A component whose `heading` was renamed `title` in version 2 and given a `level` in 3.
  const evolving = defineComponent({
    id: "evolving",
    title: "Evolving",
    category: "Test",
    version: 3,
    props: { title: text({ label: "Title", default: "Untitled" }), level: number({ label: "Level", min: 1, max: 3, default: 2, integer: true }) },
    migrations: {
      1: (p) => { const { heading, ...rest } = p; return { ...rest, title: heading } },
      2: (p) => ({ ...p, level: p.level ?? 1 }),
    },
    render: () => null,
  })
  const v1: ComponentInstance = { id: "ci_old", component: "evolving", version: 1, props: { heading: "My chosen words" } }

  it("rewrites old props step by step, so a renamed property keeps the owner's value", () => {
    const m = migrateInstance(evolving, v1)
    expect(m.status).toBe("migrated")
    expect(m.instance).toMatchObject({ version: 3, props: { title: "My chosen words", level: 1 } })
    expect("heading" in m.instance.props).toBe(false)
  })

  it("does not mutate the stored instance", () => {
    const snapshot = JSON.stringify(v1)
    migrateInstance(evolving, v1)
    expect(JSON.stringify(v1)).toBe(snapshot)
  })

  it("a current instance passes through untouched", () => {
    const current = { ...v1, version: 3, props: { title: "x", level: 2 } }
    expect(migrateInstance(evolving, current)).toEqual({ status: "current", instance: current })
  })

  it("refuses to interpret an instance saved by a NEWER version", () => {
    const m = migrateInstance(evolving, { ...v1, version: 9 })
    expect(m.status).toBe("too-new")
    expect(m.status === "too-new" && m.issue.blocking).toBe(true)
  })

  it("a migration that throws leaves the original intact and reports it", () => {
    const fragile = defineComponent({
      id: "fragile", title: "Fragile", category: "Test", version: 2, props: {},
      migrations: { 1: () => { throw new Error("boom") } }, render: () => null,
    })
    const original: ComponentInstance = { id: "ci_f", component: "fragile", version: 1, props: { keep: "me" } }
    const m = migrateInstance(fragile, original)
    expect(m.status).toBe("failed")
    expect(m.instance).toBe(original)
    expect(m.status === "failed" && m.issue.message).toMatch(/boom/)
  })

  it("an EDIT migrates first — it must not validate old props against new controls and stamp the new version", () => {
    const { list } = updateProps([v1], "ci_old", { level: 3 }, evolving)
    expect(list[0].version).toBe(3)
    expect(list[0].props.title).toBe("My chosen words")
    expect(list[0].props.level).toBe(3)
  })

  it("an edit to a too-new instance changes nothing and says why", () => {
    const future = { ...v1, version: 9 }
    const r = updateProps([future], "ci_old", { level: 3 }, evolving)
    expect(r.list[0]).toBe(future)
    expect(r.issues[0].blocking).toBe(true)
  })
})

/* Resolution -------------------------------------------------------------------- */

describe("resolving an instance for display", () => {
  const lookup = getManifest
  const good = createInstance(shimmeringText, "ci_good")

  it("a known, current, valid instance is ok and renderable", () => {
    const r = resolveInstance(good, lookup)
    expect(r).toMatchObject({ status: "ok", renderable: true, migrated: false })
    expect(renderResolved(r)).not.toBeNull()
  })

  it("an unknown component is named, not rendered, and the stored data is untouched", () => {
    const orphan: ComponentInstance = { id: "ci_o", component: "was-removed", version: 1, props: { text: "precious" } }
    const r = resolveInstance(orphan, lookup)
    expect(r.status).toBe("unknown-component")
    expect(r.renderable).toBe(false)
    expect(r.issues[0].message).toMatch(/was-removed/)
    expect(r.instance).toBe(orphan)
    expect(renderResolved(r)).toBeNull()
  })

  it("too-new and failed migrations are reported with their own statuses", () => {
    expect(resolveInstance({ ...good, version: 99 }, lookup).status).toBe("too-new")
    const fragile = defineComponent({
      id: "fragile2", title: "F", category: "T", version: 2, props: {},
      migrations: { 1: () => { throw new Error("nope") } }, render: () => null,
    })
    expect(resolveInstance({ id: "ci_x", component: "fragile2", version: 1, props: {} }, (id) => (id === "fragile2" ? fragile : undefined)).status)
      .toBe("migration-failed")
  })

  it("an instance with an empty required property is ok but not renderable", () => {
    const r = resolveInstance({ ...good, props: { ...good.props, text: "" } }, lookup)
    expect(r.status).toBe("ok")
    expect(r.renderable).toBe(false)
    expect(renderResolved(r)).toBeNull()
  })

  it("one bad property does not stop the rest rendering", () => {
    const r = resolveInstance({ ...good, props: { ...good.props, size: "nonsense", text: "Still here" } }, lookup)
    expect(r.renderable).toBe(true)
    expect(r.status === "ok" && r.props.text).toBe("Still here")
    expect(r.status === "ok" && r.props.size).toBe("lg")
  })
})

/* The real component ------------------------------------------------------------ */

describe("the shimmering statement", () => {
  const html = (props: Record<string, unknown> = {}, reduced = false) => {
    motion.reduced = reduced
    const resolved = resolveInstance({ ...createInstance(shimmeringText, "ci_t"), props }, getManifest)
    return renderToStaticMarkup(createElement("div", null, renderResolved(resolved)))
  }
  // The props the registry component was actually given, captured by the stub.
  const stub = (props: Record<string, unknown> = {}, reduced = false) => {
    captured.last = null
    html(props, reduced)
    return captured.last as Captured
  }

  it("passes the declared text and duration to the registry component", () => {
    const p = stub({ text: "Hello there", duration: 2.5 })
    expect(p.text).toBe("Hello there")
    expect(p.duration).toBe(2.5)
  })

  it("maps `animate` onto the component's inverted `isStopped`", () => {
    expect(stub({ animate: true }).isStopped).toBe(false)
    expect(stub({ animate: false }).isStopped).toBe(true)
  })

  it("the visitor's reduced-motion preference beats the owner's wish to animate", () => {
    expect(stub({ animate: true }, true).isStopped).toBe(true)
    expect(stub({ animate: true }, false).isStopped).toBe(false)
  })

  it("theme colours become CSS variables that follow the theme; custom ones pass through", () => {
    expect(stub({ color: "token:primary" }).style).toEqual({ "--color": "var(--primary)" })
    expect(stub({ shimmerColor: "#A1B2C3" }).style).toEqual({ "--shimmering-color": "#a1b2c3" })
    expect(stub({}).style).toEqual({})
  })

  it("a hostile colour never reaches the style attribute", () => {
    const m = html({ color: "url(https://evil.example/x)", shimmerColor: "red; position:fixed" })
    expect(m).not.toContain("evil.example")
    expect(m).not.toContain("position:fixed")
    expect(stub({ color: "url(x)" }).style).toEqual({})
  })

  it("size and alignment change the heading's classes", () => {
    expect(html({ size: "xl" })).toContain("text-3xl")
    expect(html({ size: "md" })).toContain("text-xl")
    expect(html({ align: "center" })).toContain("text-center")
    expect(html({ align: "left" })).toContain("text-left")
  })

  it("EVERY declared control changes what is rendered — none is decorative", () => {
    // The central guarantee of the inspector. For each control in the manifest, take a second
    // valid value and require the output to differ. A control that is saved and ignored fails
    // here, whoever adds it and however it is wired.
    const baseline = html({})
    // Typed as the general union: the manifest's own inferred type only contains the control
    // types it uses, but the switch below is deliberately exhaustive over all of them.
    for (const [name, control] of Object.entries(shimmeringText.props as Record<string, Control>)) {
      let alternative: unknown
      switch (control.type) {
        case "text": alternative = "A different line entirely"; break
        case "select": alternative = control.options.find((o) => o.value !== control.default)!.value; break
        case "range": case "number": alternative = control.default === control.max ? control.min : control.max; break
        case "boolean": alternative = !control.default; break
        case "color": alternative = "token:primary"; break
        case "link": alternative = "https://example.com"; break
      }
      expect(html({ [name]: alternative }), `control "${name}" does nothing`).not.toBe(baseline)
    }
  })

  it("the manifest covers exactly the props it claims, and no more", () => {
    expect(Object.keys(shimmeringText.props).sort()).toEqual(
      ["align", "animate", "color", "duration", "shimmerColor", "size", "text"]
    )
    // Notably absent: className, style, handlers — everything a motion.span would accept.
    for (const hidden of ["className", "style", "onClick", "ref", "isStopped"]) {
      expect(Object.keys(shimmeringText.props)).not.toContain(hidden)
    }
  })

  it("text is accessible text, not only per-character spans", () => {
    // Asserted against the *real* component in the next block's spirit: the stub carries the
    // string, and the registry component renders an sr-only copy of it (checked in the registry
    // linkage test below against its source).
    const source = fs.readFileSync(path.join(process.cwd(), "src/registry/components/shimmering-text/shimmering-text.tsx"), "utf8")
    expect(source).toMatch(/sr-only/)
    expect(source).toMatch(/aria-hidden/)
  })
})

/* Registry linkage -------------------------------------------------------------- */

describe("the link to the shadcn registry", () => {
  const registry = JSON.parse(fs.readFileSync(path.join(process.cwd(), "registry.json"), "utf8")) as {
    items: { name: string; license?: string }[]
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }

  it("every manifest that names a registry item names one that exists", () => {
    for (const manifest of MANIFESTS) {
      if (!manifest.registry) continue
      expect(registry.items.map((i) => i.name), manifest.id).toContain(manifest.registry.item)
    }
  })

  it("dependencies and files are read from the registry, not restated", () => {
    const info = describeRegistryItem(shimmeringText)!
    expect(info).toMatchObject({ item: "shimmering-text", found: true, dependencies: ["motion"] })
    expect(info.files).toContain("@components/shimmering-text.tsx")
    expect(info.author).toMatch(/ncdai/)
  })

  it("the registry's dependencies are actually installed here", () => {
    for (const dep of describeRegistryItem(shimmeringText)!.dependencies) {
      expect({ ...pkg.dependencies, ...pkg.devDependencies }, dep).toHaveProperty(dep)
    }
  })

  it("licence is reported as declared — and says nothing when the item declares nothing", () => {
    // None of the registry's items carries a `license` field. Reporting "MIT" would be a guess.
    expect(describeRegistryItem(shimmeringText)!.license).toBeNull()
    expect(registry.items.filter((i) => i.license)).toHaveLength(0)
  })

  it("an item the registry does not have is reported, not invented", () => {
    const ghost = { ...shimmeringText, registry: { item: "no-such-item" } }
    expect(describeRegistryItem(ghost)).toMatchObject({ found: false, dependencies: [], license: null })
    expect(describeRegistryItem({ ...shimmeringText, registry: undefined })).toBeNull()
  })

  it("component ids are unique and are valid component names for the engine", () => {
    const ids = MANIFESTS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const manifest of MANIFESTS) {
      const { config } = resolveConfig({ components: { instances: [createInstance(manifest, "ci_probe")] } } as never)
      expect(resolved(config).instances, `the engine rejected "${manifest.id}" as a component name`).toHaveLength(1)
    }
  })
})

/* Portability ------------------------------------------------------------------- */

describe("a page assembled from components is portable and reproducible", () => {
  it("survives a JSON round trip through the engine and renders identically", () => {
    const built = [createInstance(shimmeringText, "ci_one"), createInstance(shimmeringText, "ci_two")]
    const edited = updateProps(built, "ci_two", { text: "Second line", color: "token:primary" }, shimmeringText).list

    const onDisk = JSON.stringify({ components: { instances: edited } })
    const { config } = resolveConfig(JSON.parse(onDisk) as never)

    expect(resolved(config).instances).toEqual(edited)
    const render = (list: readonly ComponentInstance[]) =>
      list.map((i) => renderToStaticMarkup(createElement("div", null, renderResolved(resolveInstance(i, getManifest)))))
    expect(render(resolved(config).instances)).toEqual(render(edited))
  })

  it("separates code from configuration: nothing in a stored instance names a path or module", () => {
    const text = JSON.stringify(createInstance(shimmeringText, "ci_x"))
    expect(text).not.toMatch(/import|require|\.tsx?|\.js|http|=>|function/)
  })
})
