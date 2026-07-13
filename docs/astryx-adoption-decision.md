# Astryx Adoption Decision — Task 26

## Decision: PATH 2 — Use Astryx as design/layout reference only

## Reasoning

### Why not adopt directly

1. **Bundle impact** — `@astryxdesign/core` is 13.8 MB unpacked. Even tree-shaken, it would add significant weight to a portfolio that's currently 159KB gzipped.

2. **Component conflict** — The portfolio already has working React components (Sidebar, FloatingNav, ProjectCard, etc.) with established props and behavior. Rewriting them to use Astryx primitives would require significant refactoring.

3. **StyleX dependency** — Astryx core uses StyleX for styling, which is a different styling paradigm than the current CSS-in-JS approach. This would require build tooling changes.

4. **Deployment risk** — The site is live and deployed via GitHub Pages. Introducing a major dependency change risks breaking the deployment pipeline.

5. **Theme mismatch** — While `@astryxdesign/theme-neutral` is "restrained warm grays," our current monochrome palette uses `color-mix()` for neutral layers, which is already working well.

### What we adopt from Astryx

1. **Frame-first shell philosophy** — Define the app shell before filling content.

2. **Explicit region budgets** — Use px-based budgets for shell regions instead of fluid-only approaches.

3. **Scrolling contract** — Define which element owns scroll behavior.

4. **Responsive contract** — Define breakpoints and layout behavior before implementation.

5. **"Card soup" warning** — Reduce unnecessary card wrappers for a more editorial feel.

6. **Neutral minimal theme** — The design direction aligns with our monochrome palette.

### Implementation approach

Use Astryx concepts as design guidance:
- Apply their layout principles to the existing CSS grid shell
- Use their spacing philosophy (explicit budgets, not just fluid)
- Adopt their scrolling architecture patterns
- Keep existing React components
- Keep existing CSS approach (custom properties + color-mix)
- No new dependencies

## Outcome

The portfolio benefits from Astryx's design thinking without the risk of direct adoption. The shell refactor uses Astryx-inspired patterns while maintaining the current tech stack.
