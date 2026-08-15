/**
 * The providers this project ships, registered in escalation order.
 *
 * Importing this module is what populates the registry. It lives here rather than in the
 * benchmark because registration is a property of the system, not of one consumer — a
 * registry that is only populated when the benchmark happens to run would give different
 * answers to `candidatesFor()` depending on who asked.
 *
 * Order is policy: cheapest first. The built-in provider costs nothing and finishes in
 * milliseconds, so it is asked before one that starts a browser.
 *
 * Importing this does **not** start anything. The Playwright provider only loads the
 * `playwright` package inside `setup()` and `health()`, so a project that never renders a
 * page never pays for the dependency.
 *
 * @module core/extraction/providers
 */

import { register } from '../registry.js'
import { builtin } from './builtin.js'
import { playwright } from './playwright.js'

export const PROVIDERS = [builtin, playwright].map(register)

export { builtin, playwright }
export { providers, providerById, candidatesFor, connectorFor } from '../registry.js'
