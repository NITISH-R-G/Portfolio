import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { CONNECTORS, connectorGroups } from '../src/connectors/index.js'
import { allCapabilities, capabilitiesFor } from '../src/core/sources/capabilities.js'
import {
  actionFor,
  categories,
  filterConnectors,
  methodLabel,
  searchTextFor,
} from '../src/admin/panels/source-catalogue.js'

/**
 * The connector browser's logic.
 *
 * The reason this is tested away from the components: the interesting claims are all about
 * *honesty*, and they are decidable without rendering anything. A platform with no readable
 * interface must not be able to produce a "Connect" button; a category must not appear unless a
 * connector is behind it; a search for "rss" must find the connectors that actually read feeds.
 *
 * Every assertion runs against the real registry rather than a fixture, so adding a connector
 * exercises these rules rather than bypassing them.
 */

const ALL = allCapabilities()

describe('the catalogue is the registry', () => {
  test('every registered connector is offered', () => {
    assert.equal(ALL.length, CONNECTORS.length)
    assert.deepEqual(
      [...ALL.map((c) => c.id)].sort(),
      [...CONNECTORS.map((c) => c.id)].sort(),
    )
  })

  test('there are more than a handful — the browser is not a featured list', () => {
    // The screen this replaced showed twelve and hid the rest behind "More". The count is
    // asserted so a regression to a curated subset is a failure rather than a design choice.
    assert.ok(ALL.length >= 29, `expected the whole registry, got ${ALL.length}`)
  })
})

describe('categories', () => {
  const CATEGORIES = categories()

  test('are exactly the engine categories that have connectors', () => {
    assert.deepEqual(CATEGORIES.map((c) => c.id), connectorGroups().map((g) => g.category))
  })

  test('none is empty', () => {
    // "Do not display empty categories": an empty tab is a promise the engine cannot keep.
    for (const category of CATEGORIES) {
      assert.ok(category.count > 0, `${category.id} is empty`)
    }
  })

  test('no category is invented — every id is one a connector declares', () => {
    const declared = new Set(CONNECTORS.map((c) => c.category))
    for (const category of CATEGORIES) {
      assert.ok(declared.has(category.id), `${category.id} is not a connector category`)
    }
  })

  test('the counts add up to the whole registry', () => {
    assert.equal(CATEGORIES.reduce((total, c) => total + c.count, 0), CONNECTORS.length)
  })

  test('filtering by a category returns only that category', () => {
    for (const category of CATEGORIES) {
      const shown = filterConnectors(ALL, { category: category.id })
      assert.equal(shown.length, category.count)
      assert.ok(shown.every((c) => c.category === category.id))
    }
  })
})

describe('search', () => {
  const find = (query) => filterConnectors(ALL, { query }).map((c) => c.id)

  test('matches a platform by name, case-insensitively', () => {
    assert.ok(find('github').includes('github'))
    assert.ok(find('GITHUB').includes('github'))
    assert.ok(find('hugging').includes('huggingface'))
  })

  test('matches by what the platform is known as, not only its name', () => {
    // Someone looking for Twitter does not know the connector is called `x`.
    assert.ok(find('twitter').includes('x'))
    assert.ok(find('scholar').includes('googleScholar'))
    assert.ok(find('hackathon').includes('devpost'))
  })

  test('matches by capability, which is what people actually ask for', () => {
    // "I want my writing in" — not "I want Medium".
    const feeds = find('rss')
    assert.ok(feeds.includes('website'), 'the generic feed connector must be findable as rss')
    assert.ok(feeds.length > 1, 'more than one connector reads feeds')

    assert.ok(find('publications').includes('orcid'))
    assert.ok(find('packages').includes('npm'))
  })

  test('matches by category name', () => {
    assert.ok(find('research').includes('orcid'))
    assert.ok(find('competitive').includes('leetcode'))
  })

  test('every term must match, so a second word narrows', () => {
    const wide = find('research')
    const narrow = find('research publications')
    assert.ok(narrow.length <= wide.length)
    assert.ok(narrow.every((id) => wide.includes(id)))
  })

  test('an empty query returns everything, and whitespace is not a query', () => {
    assert.equal(filterConnectors(ALL, { query: '' }).length, ALL.length)
    assert.equal(filterConnectors(ALL, { query: '   ' }).length, ALL.length)
    assert.equal(filterConnectors(ALL, {}).length, ALL.length)
  })

  test('a query that matches nothing returns nothing rather than everything', () => {
    assert.deepEqual(find('zzzzz-not-a-platform'), [])
  })

  test('search and category compose', () => {
    const shown = filterConnectors(ALL, { query: 'a', category: 'research' })
    assert.ok(shown.every((c) => c.category === 'research'))
  })

  test('every connector is findable by its own name', () => {
    // The property that matters at fifty integrations: no connector is unreachable by search.
    for (const capability of ALL) {
      const hits = filterConnectors(ALL, { query: capability.name })
      assert.ok(hits.some((c) => c.id === capability.id), `${capability.name} cannot be found by name`)
    }
  })

  test('the search text never contains undefined from a missing field', () => {
    for (const capability of ALL) {
      assert.doesNotMatch(searchTextFor(capability), /undefined|\[object/, capability.id)
    }
  })
})

describe('the action offered is honest', () => {
  const actionOf = (id) => actionFor(capabilitiesFor(id), false)

  test('an open API offers a real connection', () => {
    for (const id of ['github', 'orcid', 'leetcode', 'npm', 'devto']) {
      assert.equal(actionOf(id).kind, 'connect', id)
    }
  })

  test('a credential-gated API asks for the credential, and offers no connect button', () => {
    const kaggle = actionOf('kaggle')
    assert.equal(kaggle.kind, 'credential')
    assert.equal(kaggle.needs, 'credential')
    assert.match(kaggle.hint, /KAGGLE_USERNAME|KAGGLE_KEY/)
  })

  test('a feed says it reads a feed', () => {
    for (const id of ['medium', 'substack', 'website', 'youtube']) {
      assert.equal(actionOf(id).kind, 'feed', id)
    }
  })

  test('a platform with no readable interface offers a profile URL, never a connection', () => {
    // The load-bearing case, and the one the brief names. LinkedIn has no general profile API,
    // Google Scholar has none at all, ResearchGate publishes nothing readable. None of them may
    // render anything that implies data will be imported.
    for (const id of ['linkedin', 'googleScholar', 'researchgate', 'x']) {
      const action = actionOf(id)
      assert.equal(action.kind, 'url', id)
      assert.doesNotMatch(action.label, /^Connect$/, `${id} must not offer a Connect button`)
      assert.match(action.hint, /nothing that can be read/, id)
    }
  })

  test('no connector anywhere in the registry offers OAuth', () => {
    // OAuth is on the ladder and deliberately unavailable — it needs a registered app and a
    // callback server, which a static site has nowhere to put. Nothing may imply otherwise.
    for (const capability of ALL) {
      assert.notEqual(capability.bestMethod, 'oauth', capability.id)
      assert.notEqual(actionFor(capability, false).kind, 'oauth', capability.id)
    }
  })

  test('no connector offers extraction, which is not implemented', () => {
    for (const capability of ALL) {
      assert.notEqual(capability.bestMethod, 'extraction', capability.id)
    }
  })

  test('a connected source offers no connect action at all', () => {
    for (const capability of ALL) {
      const action = actionFor(capability, true)
      assert.equal(action.kind, 'connected', capability.id)
      assert.equal(action.needs, 'none')
    }
  })

  test('every connector produces an action with a usable label and hint', () => {
    for (const capability of ALL) {
      const action = actionFor(capability, false)
      assert.ok(action.label && action.label.length > 1, capability.id)
      assert.ok(action.hint && action.hint.length > 10, capability.id)
      assert.ok(['value', 'credential', 'none'].includes(action.needs), capability.id)
    }
  })

  test('only a credential action asks for a credential', () => {
    // Which is what stops a secret being typed into a browser field for any other platform.
    const credentialed = ALL.filter((c) => actionFor(c, false).needs === 'credential')
    assert.deepEqual(credentialed.map((c) => c.id), ['kaggle'])
    assert.ok(credentialed.every((c) => c.authentication === 'required'))
  })

  test('the method label is one of the ladder rungs, never invented', () => {
    const rungs = new Set(['Connected', 'Linked', 'Extracted', 'Imported', 'Entered by you'])
    for (const capability of ALL) {
      assert.ok(rungs.has(methodLabel(capability)), `${capability.id}: ${methodLabel(capability)}`)
    }
  })
})
