/**
 * The normalized portfolio schema.
 *
 * This is the single source of truth for the shape of portfolio data. Connectors map
 * platform-specific responses *into* these types; the UI, the exporters and the admin all
 * read *out of* them. Nothing downstream of a connector should ever need to know which
 * platform a piece of data came from.
 *
 * Types are expressed as JSDoc so that plain `.js` files work unchanged in Node (import
 * scripts, tests) and in Vite (the site) with no compile step, while `npm run typecheck`
 * still enforces them through `tsc --checkJs`.
 *
 * Every field is optional unless marked otherwise. Missing data is normal — a section whose
 * data is absent disappears rather than rendering empty.
 *
 * @module core/schema/types
 */

/**
 * Where a piece of data came from. Attached to imported records so the UI can attribute
 * facts and so `npm run import` can replace a source's records without touching others.
 *
 * Where a record came from.
 *
 * `connector` is the source id — a connector key like `"github"`, or a document id like
 * `"resume-2026-08"`. The name is historical; it identifies whichever source produced the
 * record, and every source type converges on this one shape rather than each inventing its
 * own.
 *
 * Two fields carry the load for honesty:
 *
 * - **`fetchedAt`** is present only when a source genuinely called an API. Its absence is
 *   what distinguishes a reported figure from one a person typed, and it drives the
 *   "reported" / "self-reported" labels on the page.
 * - **`confidence`** is present only when the extraction mechanism can genuinely produce
 *   one. Text pulled out of a PDF is a probabilistic guess and may carry it; a number the
 *   GitHub API returned is not a guess and must never carry it, because a confidence score
 *   on exact data manufactures precision that does not exist.
 *
 * @typedef {object} Provenance
 * @property {string} connector   Source id — a connector key or a document id.
 * @property {string} [url]       Public URL the record was derived from.
 * @property {string} [fetchedAt] ISO 8601 timestamp of the fetch. API sources only.
 * @property {DocumentEvidence} [document]
 *   Present only for document-derived records: which document, and where in it.
 * @property {ExtractionProvenance} [extraction]
 *   Present only for extracted records: by what mechanism the value was read.
 * @property {number} [confidence]
 *   0–1, and only from a mechanism that can genuinely produce one. See above.
 */

/**
 * How a value came to be read, as distinct from who asserted it.
 *
 * `connector` says a value came from the web; this says a browser rendered the page and the
 * value was found in a JSON-LD block. The distinction matters because the mechanisms are not
 * equally checkable — a value declared in structured data can be verified by looking, and one
 * inferred from prose cannot — and a conflict screen that cannot tell them apart is asking a
 * person to choose between two identical-looking options.
 *
 * @typedef {object} ExtractionProvenance
 * @property {string} [provider]  Which provider fetched the page: `builtin`, `playwright`.
 * @property {string} [method]    Which signal supplied it: `JSON-LD`, `microdata`,
 *                                `link URL`, `meta description`, `headings and lists`.
 * @property {boolean} [rendered] Whether the page's scripts ran before it was read.
 * @property {boolean} [inferred]
 *   Whether the value was **concluded** rather than **located**.
 *
 *   The most consequential bit in this object, and the reason it is explicit rather than
 *   derived from the presence of `model`. A located value can be checked by looking at the
 *   page: the text is there, and either it says what we claim or it does not. A concluded one
 *   cannot — "worked with Google's API" read as employment at Google is not a value that
 *   appears anywhere on the page, and no amount of quoting the span settles it.
 *
 *   Everything shipped today sets this to `false`. Nothing here reasons about meaning; it
 *   reads JSON-LD fields, hrefs, headings and list items. When something does reason, this is
 *   what has to distinguish its output — in the conflict UI, in the export, and in whatever
 *   metric decides whether that reasoning earned its place.
 * @property {string} [model]     For model-assisted extraction. Absent everywhere else.
 */

/**
 * Where in a document a value was found.
 *
 * Enough for the UI to say "Source: Resume, page 1" and for a person to check whether the
 * extractor read their résumé correctly — which matters because, unlike an API response,
 * extraction can be wrong in ways only the author would notice.
 *
 * Every field beyond `id` is optional: a Markdown résumé has headings but no pages, a plain
 * text file has neither, and an extractor should record what it actually knows rather than
 * inventing a page number.
 *
 * @typedef {object} DocumentEvidence
 * @property {string} id            The document's stable id, e.g. `"resume"`.
 * @property {string} [versionId]   Which import of it — a content hash. A value can be
 *                                  traced to the exact file it was read from, while the
 *                                  `id` stays stable so decisions survive a new version.
 * @property {string} [filename]
 * @property {number} [page]        1-indexed.
 * @property {string} [section]     The heading this value was found under.
 * @property {string} [heading}     The specific sub-heading, where distinct from `section`.
 * @property {string} [text]        The span the value was read from, for inspection.
 * @property {number} [line]        1-indexed, for line-oriented formats.
 */

/**
 * A date that may legitimately be imprecise. Portfolios contain "2023", "Mar 2024" and
 * "2024-03-15" side by side; storing the precision lets us sort correctly and render at the
 * granularity the user actually knows.
 *
 * @typedef {object} PortfolioDate
 * @property {string} iso                              ISO 8601, padded to the first valid
 *                                                     instant (`"2024"` → `"2024-01-01"`).
 * @property {'year'|'month'|'day'} precision          How much of `iso` is meaningful.
 * @property {string} [display]                        Pre-formatted override for rendering.
 */

/**
 * A date range. `end` absent with `current: true` means "to present".
 *
 * @typedef {object} DateRange
 * @property {PortfolioDate} [start]
 * @property {PortfolioDate} [end]
 * @property {boolean} [current]
 */

/**
 * A labelled outbound link.
 *
 * @typedef {object} Link
 * @property {string} label
 * @property {string} url
 * @property {string} [rel]  Semantic role, e.g. `"repository"`, `"live"`, `"paper"`.
 */

/**
 * A single quantitative claim. `value` is kept as a string so "1,250+", "#73" and "0.78"
 * all round-trip losslessly; `numeric` carries the sortable form when one exists.
 *
 * @typedef {object} Metric
 * @property {string} label
 * @property {string} value
 * @property {number} [numeric]
 * @property {string} [note]
 * @property {Provenance} [source]
 */

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * @typedef {object} Identity
 * @property {string} name             Required. The only field with no sensible default.
 * @property {string} [headline]       Short role line, e.g. "ML Engineer".
 * @property {string} [summary]        A paragraph. Rendered as the About section.
 * @property {string} [location]
 * @property {string} [avatar]         URL or path relative to the site base.
 * @property {string} [pronouns]
 * @property {Availability} [availability]
 * @property {Contact} [contact]
 */

/**
 * @typedef {object} Availability
 * @property {'open'|'selective'|'closed'} [status]
 * @property {string} [label]
 * @property {string[]} [interests]
 * @property {string[]} [preferredRoles]
 * @property {string[]} [preferredLocations]
 * @property {string} [responseTime]
 * @property {string} [currentAffiliation]
 */

/**
 * @typedef {object} Contact
 * @property {string} [email]
 * @property {string} [phone]     Never imported; manual only.
 * @property {string} [website]
 * @property {Link[]} [links]
 */

/* -------------------------------------------------------------------------- */
/* Record types                                                                */
/* -------------------------------------------------------------------------- */

/**
 * @typedef {object} EducationItem
 * @property {string} [id]
 * @property {string} institution
 * @property {string} [degree]
 * @property {string} [field]
 * @property {string} [location]
 * @property {DateRange} [dates]
 * @property {string} [grade]
 * @property {string} [description]
 * @property {string[]} [courses]
 * @property {string[]} [achievements]
 * @property {Link[]} [links]
 * @property {Provenance} [source]
 */

/**
 * @typedef {object} ExperienceItem
 * @property {string} [id]
 * @property {string} company
 * @property {string} [role]
 * @property {string} [location]
 * @property {'full-time'|'part-time'|'internship'|'contract'|'freelance'|'volunteer'} [employmentType]
 * @property {DateRange} [dates]
 * @property {string} [description]
 * @property {string[]} [highlights]
 * @property {string[]} [technologies]
 * @property {Metric[]} [metrics]
 * @property {Link[]} [links]
 * @property {Provenance} [source]
 */

/**
 * @typedef {object} ProjectItem
 * @property {string} [id]
 * @property {string} name
 * @property {string} [description]
 * @property {string[]} [technologies]
 * @property {string} [repository]
 * @property {string} [liveUrl]
 * @property {string} [image]
 * @property {string} [imageAlt]
 * @property {number} [stars]
 * @property {number} [forks]
 * @property {number} [watchers]
 * @property {string} [primaryLanguage]
 * @property {string[]} [topics]
 * @property {boolean} [featured]      Set by the user. `featureScore` is what the generator
 *                                     computes; an explicit `featured` always wins.
 * @property {number} [featureScore]   0–100, assigned by `core/generate/scoring.js`.
 * @property {PortfolioDate} [date]
 * @property {PortfolioDate} [updatedAt]
 * @property {'active'|'completed'|'archived'|'wip'} [status]
 * @property {boolean} [isFork]
 * @property {string} [role]
 * @property {string} [context]
 * @property {string} [problem]
 * @property {string} [approach]
 * @property {string} [impact]
 * @property {string} [responsibilities]
 * @property {string} [constraints]
 * @property {string} [lessons]
 * @property {Metric[]} [metrics]
 * @property {Link[]} [links]
 * @property {Provenance} [source]
 */

/**
 * A skill with the evidence that backs it. `evidence` is what makes the portfolio
 * verifiable rather than asserted — see `core/generate/skills.js`.
 *
 * @typedef {object} SkillItem
 * @property {string} name
 * @property {string} [category]
 * @property {number} [proficiency]     1–5. Manual only; never inferred from activity.
 * @property {SkillEvidence[]} [evidence]
 * @property {number} [weight]          Derived relevance, 0–100.
 * @property {Provenance} [source]
 */

/**
 * @typedef {object} SkillEvidence
 * @property {string} label     Human-readable, e.g. "24 public repositories".
 * @property {number} [count]
 * @property {string} [connector]
 * @property {string} [url]
 */

/**
 * @typedef {object} AchievementItem
 * @property {string} [id]
 * @property {string} title
 * @property {string} [organization]
 * @property {string} [rank]
 * @property {PortfolioDate} [date]
 * @property {string} [description]
 * @property {string} [url]
 * @property {Metric[]} [metrics]
 * @property {Provenance} [source]
 */

/**
 * @typedef {object} CertificationItem
 * @property {string} [id]
 * @property {string} name
 * @property {string} [issuer]
 * @property {PortfolioDate} [date]
 * @property {PortfolioDate} [expires]
 * @property {string} [credentialId]
 * @property {string} [credentialUrl]
 * @property {string} [image]
 * @property {string} [imageAlt]
 * @property {string} [description]
 * @property {Provenance} [source]
 */

/**
 * @typedef {object} PublicationItem
 * @property {string} [id]
 * @property {string} title
 * @property {string[]} [authors]
 * @property {string} [venue]
 * @property {'journal'|'conference'|'preprint'|'thesis'|'chapter'|'other'} [type]
 * @property {PortfolioDate} [date]
 * @property {string} [abstract]
 * @property {string} [doi]
 * @property {string} [url]
 * @property {number} [citations]
 * @property {Provenance} [source]
 */

/**
 * @typedef {object} PostItem   Blog posts, articles, newsletter issues.
 * @property {string} [id]
 * @property {string} title
 * @property {string} [url]
 * @property {PortfolioDate} [date]
 * @property {string} [excerpt]
 * @property {string[]} [tags]
 * @property {number} [reactions]
 * @property {number} [comments]
 * @property {string} [publication]
 * @property {Provenance} [source]
 */

/**
 * @typedef {object} PackageItem   Published packages: npm, PyPI, crates, Docker images.
 * @property {string} [id]
 * @property {string} name
 * @property {string} registry
 * @property {string} [description]
 * @property {string} [version]
 * @property {string} [url]
 * @property {string} [repository]
 * @property {number} [downloads]
 * @property {string} [downloadsPeriod]  e.g. `"last-month"`.
 * @property {string[]} [keywords]
 * @property {PortfolioDate} [updatedAt]
 * @property {Provenance} [source]
 */

/**
 * @typedef {object} VideoItem
 * @property {string} [id]
 * @property {string} title
 * @property {string} [url]
 * @property {string} [thumbnail]
 * @property {PortfolioDate} [date]
 * @property {string} [description]
 * @property {number} [views]
 * @property {Provenance} [source]
 */

/**
 * A ranked profile on a competitive-programming or data-science platform.
 *
 * @typedef {object} CompetitiveProfile
 * @property {string} platform          Display name, e.g. "Codeforces".
 * @property {string} [connector]       Connector id that produced it.
 * @property {string} [username]
 * @property {string} [url]
 * @property {number} [rating]
 * @property {number} [maxRating]
 * @property {string} [rank]            Platform's own title, e.g. "expert", "5 star".
 * @property {string} [maxRank]
 * @property {number} [problemsSolved]
 * @property {number} [contests]
 * @property {number} [globalRank]
 * @property {Record<string, number>} [breakdown]  e.g. `{ easy: 200, medium: 90 }`.
 * @property {Metric[]} [metrics]
 * @property {Provenance} [source]
 */

/**
 * @typedef {object} ModelItem   Hugging Face models, datasets and Spaces.
 * @property {string} [id]
 * @property {string} name
 * @property {'model'|'dataset'|'space'} kind
 * @property {string} [url]
 * @property {string} [description]
 * @property {number} [likes]
 * @property {number} [downloads]
 * @property {string[]} [tags]
 * @property {PortfolioDate} [updatedAt]
 * @property {Provenance} [source]
 */

/**
 * @typedef {object} HackathonItem
 * @property {string} [id]
 * @property {string} name
 * @property {string} [event]
 * @property {string} [result]
 * @property {string} [role]
 * @property {PortfolioDate} [date]
 * @property {string} [description]
 * @property {string[]} [technologies]
 * @property {Metric[]} [metrics]
 * @property {Link[]} [links]
 * @property {Provenance} [source]
 */

/**
 * @typedef {object} TalkItem
 * @property {string} [id]
 * @property {string} title
 * @property {string} [event]
 * @property {string} [venue]
 * @property {string} [audience]
 * @property {string} [format]
 * @property {PortfolioDate} [date]
 * @property {string} [description]
 * @property {Link[]} [links]
 * @property {Provenance} [source]
 */

/**
 * A free-form record for sections the schema does not model explicitly. Rendered by the
 * generic section renderer, so a user can add "Volunteering" or "Patents" from config alone.
 *
 * @typedef {object} CustomItem
 * @property {string} [id]
 * @property {string} title
 * @property {string} [subtitle]
 * @property {PortfolioDate} [date]
 * @property {string} [description]
 * @property {string[]} [tags]
 * @property {Metric[]} [metrics]
 * @property {Link[]} [links]
 * @property {Provenance} [source]
 */

/* -------------------------------------------------------------------------- */
/* Aggregates                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Cross-platform totals. Every entry is derived by `core/generate/stats.js` from records
 * that were actually imported — nothing here is ever typed in by hand or estimated.
 *
 * @typedef {object} Stats
 * @property {StatEntry[]} entries
 */

/**
 * @typedef {object} StatEntry
 * @property {string} id
 * @property {string} label
 * @property {number} value
 * @property {string} [display]
 * @property {string} [note]
 * @property {'fetched'|'derived'|'stated'} kind
 *   Where the number comes from, which the UI shows so a reader can weigh it:
 *   `fetched` — a platform's API reported it verbatim.
 *   `derived` — this project counted it from records that are on the page.
 *   `stated`  — the portfolio's owner typed it, because the platform publishes no API.
 *   The distinction is load-bearing: a self-reported figure is a claim, and labelling it
 *   as though a platform had confirmed it would be exactly the fabrication this project
 *   refuses to do.
 * @property {string[]} [connectors]      Which sources contributed.
 */

/**
 * Public profile URLs. Keys are connector ids; this is intentionally an open map so a
 * community connector can add its own key without a schema change.
 *
 * @typedef {Record<string, string>} Socials
 */

/* -------------------------------------------------------------------------- */
/* The profile                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The complete normalized portfolio. This is what `src/data/generated/portfolio.json`
 * contains and what every renderer and exporter consumes.
 *
 * @typedef {object} Profile
 * @property {Identity} identity
 * @property {EducationItem[]} education
 * @property {ExperienceItem[]} experience
 * @property {ProjectItem[]} projects
 * @property {SkillItem[]} skills
 * @property {AchievementItem[]} achievements
 * @property {CertificationItem[]} certifications
 * @property {PublicationItem[]} publications
 * @property {PostItem[]} posts
 * @property {PackageItem[]} packages
 * @property {VideoItem[]} videos
 * @property {ModelItem[]} models
 * @property {HackathonItem[]} hackathons
 * @property {TalkItem[]} talks
 * @property {CompetitiveProfile[]} competitive
 * @property {LanguageItem[]} languages
 * @property {Record<string, CustomItem[]>} custom
 * @property {Socials} socials
 * @property {Stats} stats
 * @property {ProfileMeta} meta
 */

/**
 * @typedef {object} LanguageItem   Spoken languages.
 * @property {string} name
 * @property {number} [level]        1–5.
 * @property {string} [label]        e.g. "Native", "Professional".
 */

/**
 * @typedef {object} ProfileMeta
 * @property {string} [generatedAt]        ISO timestamp of the last `npm run import`.
 * @property {string[]} [connectors]       Connector ids that contributed data.
 * @property {Record<string, string>} [sourceStatus]  connector id → outcome.
 */

/**
 * The list of array-valued collections on a `Profile`. Used by the merge layer, the
 * validator and the importer to iterate collections generically instead of naming each one.
 *
 * @type {readonly (keyof Profile)[]}
 */
export const COLLECTIONS = /** @type {const} */ ([
  'education',
  'experience',
  'projects',
  'skills',
  'achievements',
  'certifications',
  'publications',
  'posts',
  'packages',
  'videos',
  'models',
  'hackathons',
  'talks',
  'competitive',
  'languages',
])

/**
 * Fields that must never be written by a connector, only by the user. Guards against a
 * connector overwriting hand-authored identity or contact details on refresh.
 *
 * @type {readonly string[]}
 */
export const USER_OWNED_PATHS = ['identity.contact.phone', 'identity.pronouns']
