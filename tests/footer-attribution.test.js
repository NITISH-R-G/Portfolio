import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The upstream attribution lives out of public view.
 *
 * The portfolio owner's public footer must read as their own: the trademark policy the fork
 * ships under says to "ship it as yours, not as mine", so the hard-coded
 * "Built on chanhdai.com (MIT License)" row does not belong on the main portfolio page.
 * The MIT licence still needs its attribution stated in the software, so it is preserved
 * where only an owner looks: the repository LICENSE file and the admin Footer's
 * "Attribution" note.
 *
 * These are source-text assertions in the style of the surrounding suite: the failure they
 * guard is categorical — either the public component names the upstream project or it
 * does not — and rendering the footer requires the full Next application.
 */

const ROOT = join(import.meta.dirname, '..')
const read = (relative) => readFileSync(join(ROOT, relative), 'utf8')

describe('the public footer carries no upstream branding', () => {
  const footer = read('src/components/site-footer.tsx')

  test('it never names the upstream project', () => {
    assert.ok(
      !/chanhdai\.com/i.test(footer),
      'the public footer must not name chanhdai.com',
    )
  })

  test('the "Built on" row is gone', () => {
    assert.ok(!/Built on/.test(footer), 'the "Built on" attribution row was removed')
  })
})

describe('the upstream attribution is preserved out of public view', () => {
  test('the admin Footer panel states it, with the licence link', () => {
    const panel = read('src/admin/panels/FooterPanel.jsx')
    assert.ok(panel.includes('chanhdai.com'), 'names the upstream project')
    assert.ok(panel.includes('MIT'), 'names the licence')
    assert.ok(
      panel.includes('https://github.com/ncdai/chanhdai.com/blob/main/LICENSE'),
      'links the upstream licence text',
    )
  })

  test('the repository LICENSE file carries it too', () => {
    const license = read('LICENSE')
    assert.ok(license.includes('chanhdai.com'), 'names the upstream project')
    assert.ok(license.includes('MIT'), 'names the licence')
    assert.ok(
      license.includes('https://github.com/ncdai/chanhdai.com/blob/main/LICENSE'),
      'links the upstream licence text',
    )
  })
})
