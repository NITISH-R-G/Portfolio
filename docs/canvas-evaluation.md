# Infinite canvas or a simpler composition workspace?

**Recommendation: not yet.** Build drag-and-drop ordering and undo/redo on the page canvas that
already exists. Revisit an infinite moodboard only when an owner needs to compare candidates side
by side, and if so build it as a separate, never-published workspace on an MIT library — not
tldraw, whose licence needs review first.

This is a decision from technical evidence, **not from a prototype**: no infinite canvas was built
or measured. What was measured is stated below, with its limits.

## The question

The goal is a creative workspace where someone can browse and compare components, keep candidates
to hand, explore compositions, arrange sections, preview at different sizes, move a choice into
the real page, undo, and switch between a freeform workspace and a structured responsive page.
The test for any approach is whether it makes that *meaningfully* better than the smallest thing
that would — not whether it is impressive.

## What already exists

The Admin canvas ([sync-and-builder.md](sync-and-builder.md), Milestone 1) is already a page
canvas. It renders the real components over the draft, selects blocks by pointer or keyboard,
shows a contextual inspector, previews at three viewport widths, and — as of this milestone —
adds, orders, removes and edits placed components through a tray and a manifest-generated
inspector. Every operation on the instance list is a pure function that returns a new list
([`instances.ts`](../src/features/builder/instances.ts)).

Against the goal, what is missing is:

| Need | Today | Smallest thing that fixes it |
| --- | --- | --- |
| Arrange by dragging | up/down buttons | drag-and-drop on the existing list |
| Undo and redo | none | a history stack over the instance list |
| Compare candidates side by side | add one, look, remove it | **the only need an infinite canvas serves** |
| Freeform exploration | none | an infinite canvas, if the need is real |
| Preview at sizes | three fixed widths | already there |
| Move a choice into the page | add from the tray | already there |

Five of six needs are met or are small, well-understood additions. One is not.

## The options

| | A. Page canvas + tray *(today)* | B. A + drag-and-drop + undo/redo | C. Infinite canvas / moodboard |
| --- | --- | --- | --- |
| Arrange | buttons | drag, and keyboard | drag, freeform |
| Compare candidates | one at a time | one at a time | **side by side** |
| Maps to the published page | exactly | exactly | **not at all** — positions are 2-D, the page is a responsive column |
| Dependency | none | `@dnd-kit` (MIT) | `@xyflow/react` (MIT) or tldraw (see below) |
| Accessibility risk | low | low–medium | **high** |
| Build cost | done | small | large |

## Evidence

**Libraries** (queried from the npm registry on the day of writing):

| Package | Version | Licence field | Unpacked | Direct deps |
| --- | --- | --- | --- | --- |
| `@dnd-kit/core` | 6.3.1 | MIT | 1,041 KB | 3 |
| `@dnd-kit/sortable` | 10.0.0 | MIT | 229 KB | — |
| `@xyflow/react` | 12.12.0 | MIT | 1,188 KB | 3 |
| `react-zoom-pan-pinch` | 4.2.0 | MIT | 1,170 KB | 0 |
| `tldraw` | 5.5.2 | *"SEE LICENSE IN LICENSE.md"* | **14,887 KB** | 17 |

- **tldraw is not MIT.** Its package declares a custom licence file. I have *not* read its terms
  and am not asserting what they are; the point is that this project is MIT and publishes a
  template others fork, so a non-MIT dependency needs a deliberate licence review before it is
  considered — and it is also roughly **12× the unpacked size** of `@xyflow/react`, with 17
  direct dependencies against 3. It is the heaviest and least certain option by a wide margin.
- Unpacked size is install size, not what ships to a browser; it is a rough proxy, not a bundle
  measurement. No bundle was built for these.

**What a page frame costs** (measured from the exported `index.html`):

| Frames | DOM elements |
| --- | --- |
| 1 | 2,250 (204 SVG paths) |
| 4 | ~9,000 |
| 9 | ~20,000 |
| 16 | ~36,000 |

This counts static markup only — it omits the live parts (the dot-grid canvas, motion
animations, hover cards), so the real per-frame cost is higher. It matters because a moodboard
for comparing *whole page compositions* means N live pages at once, each running its own
animations. That is the expensive reading of "moodboard".

The cheap reading is comparing *component candidates*, and that is small: a shimmering statement
is a span per character, a few dozen elements. The cost argument therefore rules out
"infinite canvas of pages", not "infinite canvas of components" — which is the one that would
actually serve the stated need.

**Accessibility.** The Admin's canvas is one tab stop, steps by arrow keys, announces its
selection and has a labelled inspector. A freeform canvas has no reading order: nothing tells a
keyboard or screen-reader user where "next" is. Libraries differ in how much they provide, and
I have not verified any of them against this project; the structural problem is that a spatial
layout carries meaning a linear one does not.

**It does not map to the published page.** The published portfolio is a single responsive column
whose order is the order of `sectionOrder` and `components.instances`. A freeform arrangement has
no such order, so "move it into the page" would need a rule (sort by position? by hand?) that
silently decides the layout. The brief is right that the moodboard and the page must be distinct;
the practical consequence is that the moodboard cannot be the source of truth for anything
published.

## Why B first

- It closes the two gaps owners hit immediately — ordering by hand and recovering from a
  mistake — with the smallest dependency.
- **Undo/redo is nearly free**, because the model was designed for it: instance operations are
  pure and return new lists, ids are stable (never positions), and edits are validated before
  they are stored. A history is a stack of lists; the work is in coalescing a burst of
  keystrokes into one step, not in the data model.
- It keeps one source of truth. Drag-and-drop reorders the same `components.instances` the
  buttons do, so nothing new has to be reconciled with the published page.

## If an infinite canvas is later justified

Only if owners ask to compare three or more candidates side by side. Then:

1. **A separate workspace, never published.** Its state does not live in `components.instances`
   (it would be a second source of truth for the page). It is a scratch area; "use this" calls
   `addInstance`, the one path onto the page.
2. **Candidates, not pages.** Each node renders a manifest's `render` at a fixed preview scale.
   That is the cheap reading above.
3. **`@xyflow/react`** (MIT, three dependencies) over tldraw, unless a licence review clears
   tldraw and a concrete feature justifies its weight.
4. **Gate it with a spike measuring** frame cost with live components, keyboard operability, and
   that nothing in it can reach `config.json`.

## What was and was not done

- **Done:** gathered licence, size and dependency facts from the registry; measured per-frame DOM
  cost from a real export; mapped the goal against what exists.
- **Not done:** no prototype of any canvas; no bundle-size measurement; no accessibility testing of
  any candidate library; tldraw's licence not read. A recommendation resting on those would be
  stronger, and they are the first things a spike should produce.
