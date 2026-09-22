# Effects

Every decorative effect in this engine is optional, individually switchable, and configurable
without touching a component. This page is how.

## The distinction the whole design rests on

**Functional motion** carries information: a panel opening, focus moving, a state changing. It
is not configurable, because switching it off would remove meaning rather than ornament.

**Decorative motion** is everything else — the goo, the beam, the flourish. The portfolio reads
exactly the same with all of it gone. That is what this system governs.

The search dialog holds both, and the difference is visible there: the Border Beam is
configurable, and the thinking orb next to it is not. The orb reports a real wait. Removing it
would remove information.

## Where settings live

Two blocks, each owning one question:

| Block | Owns |
| --- | --- |
| `animations` | *Motion.* How fast, how much, and whether at all — `intensity`, `smoothScroll`, `respectReducedMotion`. |
| `effects` | *Decoration.* Which ornaments exist and where. |

`effects` is **subordinate** to `animations`. That is what keeps them from becoming two
competing switches: whatever `effects` says, an effect is off when `animations.intensity` is
`'none'`, because a global "no motion" setting that left the goo morphing would be a lie.

## The gates

An effect renders only when **all five** agree. Each can only ever say no:

1. **`prefers-reduced-motion`** — the visitor's own request. Never overridable.
2. **`animations.intensity !== 'none'`** — the owner's global motion setting.
3. **`effects.enabled`** — the master decorative switch.
4. **`effects.<name>.enabled`** — the individual effect.
5. **`effects.<name>.targets.<target>`** — the specific place.

There is deliberately no configuration that switches an effect *on* against 1 or 2. If you need
an accessible opt-out from reduced motion, that is a design problem to solve in the open, not a
flag to add here.

## Precedence

Unchanged from the rest of the config — effects did not invent a hierarchy:

```
defaults  →  theme preset  →  portfolio.config.js  →  src/data/config.json  →  admin draft
```

Later layers win, merged by `deepMerge`. The admin draft is the browser's unsaved edit; publishing
turns it into `src/data/config.json`. See [publishing.md](publishing.md).

## Configuration

```js
effects: {
  enabled: true,

  liquidGooey: {
    enabled: true,
    blur: 7,              // goo blur sigma, px — how far apart pieces begin to bridge
    contrast: 20,         // alpha-contrast slope — how sharp the liquid edge reads
    fill: '',             // any CSS colour; empty inherits the theme's surface token
    shadow: '',           // box-shadow syntax, painted on the merged silhouette
    filterPadding: 24,    // filter-region slack, px, for pieces leaving the group box
    waviness: 0,          // px of edge undulation; 0 keeps the calm edge
    wavinessFreq: 0.02,
    targets: {
      copyMenu: true,
    },
  },

  borderBeam: {
    enabled: true,
    size: 'md',           // 'sm' | 'md' | 'lg'
    targets: { searchField: true },
  },
}
```

**Every parameter here is one the library actually honours.** They mirror `liquid-gooey`'s own
`GooeyProps` in the installed version, and a test asserts that correspondence — a setting the
implementation ignores is worse than no setting, because it looks like it worked.

### Some useful combinations

```js
effects: { enabled: false }                              // all decoration off
effects: { liquidGooey: { enabled: false } }             // beam on, goo off
effects: { borderBeam: { enabled: false } }              // goo on, beam off
animations: { intensity: 'none' }                        // all motion off, decoration included
effects: { liquidGooey: { targets: { copyMenu: false } } }  // goo on, just not there
```

## Where Liquid Gooey is used, and why not everywhere

The effect says one thing: **"these controls are one physical object."** It earns a place only
where that is true.

| Target | Default | Why |
| --- | --- | --- |
| `copyMenu` | **on** | The button and the panel sit 4px apart, and the panel is extruded from the button. The goo bridges that gap into a neck, so the two read as one control in two states. |

The floating mobile navigation was the other target this layer once offered. It was removed
with the old dock rather than re-pointed at its replacement: its two controls are *separate
functions*, not one object in two states, so the effect had nothing true to say there.

Deliberately **not** candidates: full-page containers, text blocks, cards, every button,
scrolling content, or anything already visually busy. The distortion costs readability, and
paying that everywhere would make the effect a gimmick rather than a signal.

## Reduced motion

`prefers-reduced-motion` switches off every decorative effect, and no setting overrides it.

When it is active: no morphing, no travelling beam, no looping decorative movement. Opacity and
background transitions that carry state are kept, because losing them would cost information.
The UI is entirely usable — the copy menu still opens, the search field still shows focus.

The gate lives in one place (`isEffectOn`), which is the point. Ten components previously each
called `useReducedMotion()` and made their own decision; that is how one component ends up
honouring a preference and its neighbour quietly not.

## Performance

A disabled effect is **absent, not hidden**. Verified in the built application:

| Config | Liquid Gooey chunk |
| --- | --- |
| `effects.enabled: false` | **never fetched**; the copy menu still opens with both items |
| enabled, menu closed | not fetched |
| enabled, menu opened | fetched then — 48.1 kB raw / 16.2 kB gzip |

The entry chunk does not contain it, and `activeEffects()` exists so a component can ask whether
anything needs loading before it imports.

## Adding an effect

1. Add it to `EFFECT_REGISTRY` in `src/core/effects/resolve.js` — label, description, targets.
2. Add its defaults to `effects` in `src/core/config/defaults.js`, matching the target names.
3. In the component: `const fx = useEffectSetting('yourEffect', 'yourTarget')`, then render on
   `fx.on` and spread `fx.params`.
4. Lazy-import the library so a disabled effect costs nothing.

The admin panel renders from the registry, so it picks the new effect up without being edited.
A test asserts the registry and the defaults agree — if they drift, a setting becomes
unreachable from the admin or a control appears for something no component reads.

**Adding a target** is one string in the registry plus one in the defaults.

## Validation

Anything unusable is replaced with the default and reported as a warning by `npm run doctor`.
The site always builds:

| Given | Result |
| --- | --- |
| `blur: 'quite a lot'` | default 7, warning |
| `contrast: -5`, `NaN`, `Infinity` | default 20, warning |
| `enabled: 'yes'` | default, warning |
| `size: 'enormous'` | `'md'`, warning |
| unknown effect or target | dropped, warning |
| `effects: 42` / `[]` / `null` | whole block replaced by defaults |

Unknown names are *dropped* rather than preserved, so a typo cannot masquerade as a working
setting.

## Backwards compatibility

A portfolio with no `effects` block keeps working and looks the same. `enabled` is checked
against `=== false` rather than truthiness precisely so that absent means "not configured", not
"off".
