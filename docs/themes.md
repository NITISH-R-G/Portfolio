# Themes

A theme is a configuration object, not a separate implementation. There is one set of
components; twelve presets change how they look by redefining design tokens.

```js
theme: { preset: 'editorial' }
```

---

## The twelve

| Preset | Scheme | Character |
| --- | --- | --- |
| `minimal-dark` | dark | Near-black monochrome, hairline borders. The default. |
| `minimal-light` | light | The same restraint on paper white. |
| `editorial` | light | Warm paper, serif headings, generous measure. |
| `glass` | dark | Deep blue, translucent surfaces, soft glow. |
| `terminal` | dark | Monospace throughout, green on black. |
| `academic` | light | Serif, dense, conservative. Built for publication lists. |
| `neo-brutalist` | light | Hard shadows, thick borders, high contrast. |
| `developer` | dark | Editor-like: slate surfaces, syntax-adjacent accents. |
| `corporate` | light | Blue, restrained, unremarkable in the way a CV should be. |
| `creative` | dark | Saturated gradients, expressive type. |
| `monochrome` | light | Pure greyscale. No accent colour at all. |
| `swiss` | light | Grid-driven, red accent, tight tracking. |

Try them without committing:

```bash
npm run dev
# open http://localhost:5173/admin.html#style
```

The builder repaints itself as you click, so you are judging the theme by looking at it.

---

## Customizing

Four shortcuts cover most of what people want:

```js
theme: {
  preset: 'minimal-dark',
  accent: '#7dd3fc',
  fontSans: 'Inter, system-ui, sans-serif',
  fontMono: 'ui-monospace, SFMono-Regular, monospace',
  radius: '12px',        // a bare number is read as pixels; 0 gives square corners
  density: 'comfortable',
}
```

**Accent contrast is computed for you.** Set a light accent and button labels go dark;
set a dark one and they go light. A custom colour cannot produce unreadable text.

**Density** scales the whole spacing ramp — `compact`, `comfortable`, `spacious`.

---

## Overriding tokens

For anything the shortcuts do not cover:

```js
theme: {
  preset: 'minimal-dark',
  tokens: {
    color: {
      bg: '#0a0a0f',
      surface: '#12121a',
      text: '#e8e8f0',
      textMuted: '#9a9aab',
      border: '#22222e',
    },
    radius: { md: '4px', lg: '8px' },
    shadow: { md: '0 4px 24px rgba(0,0,0,0.4)' },
  },
},
```

Flat `--custom-property` form works too:

```js
tokens: { '--color-accent': '#ff5722' }
```

### Token groups

| Group | Examples |
| --- | --- |
| `color` | `bg`, `page`, `sidebar`, `surface`, `surface2`, `surfaceHover`, `border`, `borderStrong`, `text`, `textMuted`, `textFaint`, `accent`, `accentSecondary`, `accentContrast`, `success`, `warning`, `danger`, `focusRing` |
| `font` | `sans`, `mono`, `display` |
| `text` | `hero`, `section`, `cardTitle`, `body`, `meta` |
| `tracking` | `label`, `heading`, `body` |
| `leading` | `hero`, `body`, `meta` |
| `weight` | `body`, `medium`, `heading`, `label` |
| `space` | `1` through `8` |
| `radius` | `sm`, `md`, `lg`, `xl`, `full` |
| `shadow` | `none`, `sm`, `md`, `lg` |
| `card` | `bg`, `border`, `radius`, `shadow`, `hoverBorder` |

Each becomes a CSS custom property: `color.textMuted` → `--color-text-muted`.

Inspect the resolved set for any preset:

```bash
node -e "import('./src/core/themes/apply.js').then(m => \
  console.log(m.resolveTheme({ theme: { preset: 'glass' } }).vars))"
```

---

## Layout

Layout is separate from theme — any combination works:

```js
layout: {
  shell: 'sidebar',            // 'sidebar' | 'stacked'
  navigation: 'dock',          // 'dock' | 'top' | 'none'
  maxWidth: 'default',         // 'narrow' | 'default' | 'wide' | 'full'
  projectLayout: 'carousel',   // 'carousel' | 'grid' | 'list'
  experienceLayout: 'cards',   // 'cards' | 'timeline'
  avatarStyle: 'circle',       // 'circle' | 'rounded' | 'square'
  socialIconStyle: 'outline',  // 'outline' | 'solid' | 'plain'
  customCursor: true,
},
```

`sidebar` puts identity, about, skills and languages in a fixed rail beside the scrolling
column. `stacked` is one column top to bottom, and usually pairs with `navigation: 'top'`.

---

## Motion

```js
animations: {
  intensity: 'standard',   // 'none' | 'subtle' | 'standard' | 'expressive'
  smoothScroll: true,
},
```

`intensity` scales every duration through one token, so `none` genuinely means no motion
rather than fast motion.

`prefers-reduced-motion` is **always** honoured, regardless of configuration. It is
exposed in config only so it is visible; setting it to `false` is ignored.

---

## Accessibility

Themes must not compromise it, and the built-in ones do not:

- Every preset meets WCAG AA contrast for body text against its background.
- Accent foregrounds are computed rather than declared, so custom accents stay readable.
- Focus rings are a token (`color.focusRing`) and always visible.
- Nothing conveys meaning by colour alone.

If you override tokens, check contrast. `npm run doctor` does not — it cannot know what
you intended.

---

## Adding a theme

`src/core/themes/presets.js` is one array. A preset declares only what it *changes*:

```js
{
  id: 'sunset',
  name: 'Sunset',
  description: 'Warm dusk tones with a coral accent.',
  colorScheme: 'dark',
  tokens: {
    color: {
      bg: '#1a1116',
      surface: '#241820',
      text: '#f5e6e0',
      textMuted: '#c9a99f',
      accent: '#ff7a59',
      accentContrast: '#1a1116',
      border: '#3a2830',
    },
  },
}
```

Everything unspecified inherits from `BASE_TOKENS`. `minimal-dark` declares nothing at all.

It appears in the setup wizard and the builder automatically, with swatches resolved from
the real theme resolver — no swatch definition to maintain.

The theme tests check that every preset resolves, emits valid CSS, and defines the tokens
components depend on:

```bash
npm test
```
