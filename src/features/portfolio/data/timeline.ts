/**
 * Content for this portfolio comes from the engine, not from a hand-written file.
 *
 * Upstream (chanhdai.com) this module held his personal timeline as a literal — 130 lines of
 * one person's biography, from his birth year to the company he founded. Here it is a
 * re-export from `./adapter`, which derives milestones from the dated records the owner
 * actually imported, or from `timeline.milestones` in config for someone who would rather
 * write their own. His component imports from this path unchanged.
 *
 * Edit the portfolio through the admin, or re-run `npm run import`. Do not hand-edit this file.
 */

export { TIMELINE_BIRTH_YEAR, TIMELINE_MILESTONES } from './adapter'
