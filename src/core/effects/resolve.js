/**
 * Whether a decorative effect is on, and with what parameters.
 *
 * One function answers that for every effect and every place one can appear, because the
 * alternative is what this file replaced: each component deciding for itself, each remembering
 * to check `prefers-reduced-motion`, and each drifting from the others the first time someone
 * adds a case. Ten components checked reduced motion independently before this existed.
 *
 * ## The gates, in order
 *
 * An effect is on only when *every* one of these agrees. Each can only ever say no:
 *
 *   1. `prefers-reduced-motion` — the visitor's own request. Never overridable. A portfolio
 *      does not get to insist on motion because its owner liked the look.
 *   2. `animations.intensity === 'none'` — the owner's global "no motion" setting, which would
 *      be a lie if decoration kept moving underneath it.
 *   3. `effects.enabled` — the master decorative switch.
 *   4. `effects.<name>.enabled` — the individual effect.
 *   5. `effects.<name>.targets.<target>` — the specific place.
 *
 * Ordering them this way means accessibility is checked first and cannot be reached past, and
 * that a `false` anywhere is final. There is deliberately no way to write configuration that
 * turns an effect *on* against one of the first two.
 *
 * ## Why this is pure
 *
 * No React, no `matchMedia`, no DOM. Reduced motion arrives as a boolean the caller measured,
 * so the whole decision table is testable without a browser — which is the only way the
 * precedence above gets verified rather than assumed.
 *
 * @module core/effects/resolve
 */

/**
 * Every effect the engine knows about, and where each may appear.
 *
 * Adding an effect is an entry here plus a component that asks about it. Adding a *target* is
 * one string. Nothing else in the system needs to learn either name — `isEffectOn` reads this
 * registry, the admin panel renders from it, and unknown names are rejected against it.
 */
export const EFFECT_REGISTRY = Object.freeze({
  liquidGooey: Object.freeze({
    label: 'Liquid Gooey',
    description: 'Adjacent controls rendered as one connected mass.',
    targets: Object.freeze({
      copyMenu: 'Copy button and its menu',
    }),
  }),
  borderBeam: Object.freeze({
    label: 'Border Beam',
    description: 'A travelling highlight that marks a field as live.',
    targets: Object.freeze({
      searchField: 'Search input, while focused',
    }),
  }),
})

/** @typedef {{reducedMotion?: boolean}} EffectContext */

/**
 * Is this effect on, in this place, for this visitor?
 *
 * @param {Record<string, any>} config A resolved portfolio config.
 * @param {string} name An effect from `EFFECT_REGISTRY`.
 * @param {string} [target] A target from that effect's registry entry. Omit to ask about the
 *   effect as a whole — useful for deciding whether to load its dependency at all.
 * @param {EffectContext} [context]
 * @returns {boolean}
 */
export function isEffectOn(config, name, target, context = {}) {
  // 1 and 2: the gates configuration cannot argue with.
  if (context.reducedMotion) return false
  if (config?.animations?.intensity === 'none') return false

  const effects = config?.effects
  // Absent config is not "off" — it is "not configured", and the defaults resolve it. Only an
  // explicit `false` disables, so a portfolio written before this block existed keeps its
  // effects rather than silently losing them.
  if (effects?.enabled === false) return false

  const effect = effects?.[name]
  if (!effect || effect.enabled === false) return false

  // An effect with no target asked about is on if the effect is on. This is what lets a
  // component skip importing a library entirely.
  if (target === undefined) return true

  // A target absent from the registry can never be on. Otherwise a typo in configuration would
  // read as an enabled effect in a place that does not exist, which is worse than a no-op: it
  // looks like it worked.
  if (!EFFECT_REGISTRY[name]?.targets?.[target]) return false

  return effect.targets?.[target] === true
}

/**
 * The parameters to hand an effect, with anything unset falling back to the resolved default.
 *
 * Returns only the effect's own parameters — never `enabled` or `targets`, which are decisions
 * rather than settings and have already been made by the time this is called.
 *
 * @param {Record<string, any>} config
 * @param {string} name
 * @returns {Record<string, any>}
 */
export function effectParams(config, name) {
  const { enabled, targets, ...params } = config?.effects?.[name] ?? {}
  return params
}

/**
 * Which effects need their dependency loaded at all, for this config and this visitor.
 *
 * The point of the whole design: a disabled effect should not cost a network request, and a
 * component can ask this before it decides to `import()` anything. Making the effect invisible
 * with CSS while still shipping its library would satisfy the letter of "disabled" and none of
 * the intent.
 *
 * @param {Record<string, any>} config
 * @param {EffectContext} [context]
 * @returns {string[]} effect names that are on somewhere
 */
export function activeEffects(config, context = {}) {
  return Object.keys(EFFECT_REGISTRY).filter((name) => {
    if (!isEffectOn(config, name, undefined, context)) return false
    // On as an effect, but with every target off, is off in practice — and loading a library
    // for it would be paying for nothing.
    const targets = Object.keys(EFFECT_REGISTRY[name].targets)
    return targets.some((target) => isEffectOn(config, name, target, context))
  })
}
