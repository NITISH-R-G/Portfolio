/**
 * The public manifest — the portfolio as a machine reads it.
 *
 * `toDocument()` in `./document.js` serializes *everything* the resolver knows. That is the
 * right shape for `npm run export`, where the file lands on the author's own disk. It is the
 * wrong shape to publish, because it has no notion of what its owner considered private.
 *
 * This module is that missing boundary. It takes the same standard document and applies the
 * author's `privacy` configuration to it, so the file served at a public URL contains only
 * what was intentionally designated public.
 *
 * ## Why this is not just `toDocument()` with a flag
 *
 * The privacy settings were, until this module existed, enforced entirely in the *rendering*
 * layer — `ContactSection` hides an email, `seo.js` keeps it out of JSON-LD. Nothing enforced
 * them in the serializer, because nothing serialized to a public location. Publishing
 * `toDocument()` directly would have quietly defeated `privacy.hideEmail` and
 * `privacy.obfuscateEmail` for every user who had set them: the rendered page would show
 * `nitish [at] example.com` while `/portfolio.json` served the real address in plain text, to
 * anyone, forever, in the single most harvestable format available.
 *
 * A manifest is a security boundary. It gets its own function, and its own tests.
 *
 * @module core/standard/public
 */

import { toDocument, SCHEMA_VERSION, SPEC_URL } from './document.js'

/**
 * Fields that never appear in a published manifest, whatever the configuration says.
 *
 * `phone` is the load-bearing one. It is in `USER_OWNED_PATHS` — no connector can import it,
 * so its presence means a human typed it into their own config for their own page. That is
 * consent to render it on a page they control, not consent to publish it as a machine-readable
 * record for bulk collection. There is no configuration flag to turn this off, because a flag
 * would eventually be set by someone who did not think about it.
 */
const NEVER_PUBLISHED = ['phone']

/**
 * Build the public manifest.
 *
 * @param {import('../schema/types.js').Profile} profile
 * @param {{
 *   config?: Record<string, any>,
 *   canonical?: string,
 *   generatedAt?: string,
 *   capabilities?: Record<string, unknown>,
 * }} [options]
 * @returns {Record<string, any>}
 */
export function toPublicManifest(profile, options = {}) {
  const privacy = options.config?.privacy ?? {}

  // Deliberately *not* `includeEvidence`. That block serializes every claim on a disputed
  // attribute, including the ones that lost — so a résumé the author imported privately and
  // then corrected would have its original wording published as the losing claim. The
  // provenance a reader actually needs ("which source backs the value you published?") is
  // already carried per-record on `source`, and per-skill on `evidence`, both of which
  // describe published values only. Auditability of *rejected* values is a local concern.
  const document = toDocument(profile, {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
  })

  /* Contact ---------------------------------------------------------------- */

  if (document.person?.contact) {
    const contact = { ...document.person.contact }

    for (const field of NEVER_PUBLISHED) delete contact[field]

    // Both settings mean "do not publish a harvestable address", and a JSON manifest is the
    // most harvestable form there is. Emitting the obfuscated string instead would be worse
    // than omitting it: useless to a legitimate agent, and still an advertisement that an
    // address exists. Anyone who wants the address can read the page.
    if (privacy.hideEmail === true || privacy.obfuscateEmail === true) {
      delete contact.email
    }

    if (Object.keys(contact).length) document.person.contact = contact
    else delete document.person.contact
  }

  /* Provenance of the manifest itself --------------------------------------- */

  if (options.canonical) document.url = options.canonical

  document.capabilities = {
    // What a consumer can rely on being here. Stated rather than inferred, so an agent can
    // branch on capability instead of probing for fields and guessing from absence.
    schemaVersion: SCHEMA_VERSION,
    spec: SPEC_URL,
    provenance: true,
    evidence: hasEvidence(profile),
    search: 'client',
    ...(options.capabilities ?? {}),
  }

  return document
}

/**
 * Whether any published value carries evidence a reader could check.
 *
 * @param {import('../schema/types.js').Profile} profile
 */
function hasEvidence(profile) {
  if ((profile.skills ?? []).some((skill) => (skill.evidence ?? []).length)) return true
  return Object.values(profile).some((value) =>
    Array.isArray(value) && value.some((record) => record?.source?.connector))
}

export { NEVER_PUBLISHED }
