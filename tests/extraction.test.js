import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { parseHtml, decodeEntities, textOf, linesOf, findAll, find, byTag } from '../src/core/extraction/html.js'
import { readSignals, readJsonLd, readMicrodata, readMeta, readOutline, readLinks } from '../src/core/extraction/signals.js'
import { normalizeSignals, canonicalOrg, titleName } from '../src/core/extraction/normalize.js'
import { builtin } from '../src/core/extraction/providers/builtin.js'

/** Parse, read signals, normalize — the whole built-in path in one call. */
const extract = (html, url = 'https://example.test/') =>
  normalizeSignals(readSignals(parseHtml(html)), { url, sourceId: 'test' })

/* -------------------------------------------------------------------------- */

describe('html parsing', () => {
  test('builds a tree with nesting', () => {
    const root = parseHtml('<div><p>one</p><p>two<span>three</span></p></div>')
    assert.equal(findAll(root, byTag('p')).length, 2)
    assert.equal(findAll(root, byTag('span')).length, 1)
    // Block boundaries become spaces; inline ones do not — `two<span>three</span>` is one
    // word to a reader, and inserting a space there would split words that are not split.
    assert.equal(textOf(root), 'one twothree')
  })

  test('void elements do not swallow their siblings', () => {
    const root = parseHtml('<div><img src="a.png"><br><p>after</p></div>')
    const div = find(root, byTag('div'))
    // Were `img` treated as a container, `p` would nest inside it and the div would have one
    // child instead of three.
    assert.equal(div.children.filter((c) => c.type === 'element').length, 3)
  })

  test('a less-than inside a script does not open an element', () => {
    const root = parseHtml('<script>if (a < b) { x() }</script><p>survives</p>')
    assert.equal(textOf(find(root, byTag('p'))), 'survives')
  })

  test('a greater-than inside a quoted attribute does not end the tag', () => {
    const root = parseHtml('<a href="/x" title="a > b" rel="me">link</a>')
    const a = find(root, byTag('a'))
    assert.equal(a.attrs.rel, 'me', 'attributes after the quoted > are still parsed')
  })

  test('an unclosed list item is closed by the next one', () => {
    const root = parseHtml('<ul><li>one<li>two<li>three</ul>')
    assert.equal(findAll(root, byTag('li')).length, 3)
    assert.equal(textOf(findAll(root, byTag('li'))[0]), 'one')
  })

  test('a mis-nested close tag does not orphan the rest of the document', () => {
    const root = parseHtml('<b><i>x</b><p>still here</p>')
    assert.equal(textOf(find(root, byTag('p'))), 'still here')
  })

  test('bare attributes take their own name as a value, so presence is testable', () => {
    const root = parseHtml('<div itemscope itemtype="https://schema.org/Person"></div>')
    assert.notEqual(find(root, byTag('div')).attrs.itemscope, undefined)
  })

  test('entity decoding is case-sensitive for letters', () => {
    // Ø and ø are different letters. Folding case here would silently respell a name.
    assert.equal(decodeEntities('S&oslash;rensen'), 'Sørensen')
    assert.equal(decodeEntities('&Oslash;stergaard'), 'Østergaard')
    assert.equal(decodeEntities('Jos&eacute; &amp; Ren&eacute;e'), 'José & Renée')
  })

  test('numeric references decode, and undecodable ones are left alone', () => {
    assert.equal(decodeEntities('&#8212;&#x2014;'), '——')
    assert.equal(decodeEntities('&#xD800;'), '&#xD800;', 'a lone surrogate is left as written')
    assert.equal(decodeEntities('&notareal;'), '&notareal;')
  })

  test('script and style content is excluded from text', () => {
    const root = parseHtml('<body><style>.a{color:red}</style><p>visible</p><script>x=1</script></body>')
    assert.equal(textOf(find(root, byTag('body'))), 'visible')
  })

  test('linesOf keeps block structure that textOf collapses', () => {
    const html = '<div><p>one</p><p>two</p></div>'
    assert.equal(textOf(parseHtml(html)), 'one two')
    // Blocks stay separated, which is the structure the résumé reader depends on.
    assert.deepEqual(linesOf(parseHtml(html)).split('\n').filter(Boolean), ['one', 'two'])
  })
})

/* -------------------------------------------------------------------------- */

describe('page signals', () => {
  test('JSON-LD is flattened across arrays and @graph', () => {
    const root = parseHtml(`
      <script type="application/ld+json">[{"@type":"Person","name":"A"}]</script>
      <script type="application/ld+json">{"@graph":[{"@type":"Article","name":"B"}]}</script>
    `)
    const names = readJsonLd(root).map((n) => n.name)
    assert.deepEqual(names.sort(), ['A', 'B'])
  })

  test('one malformed JSON-LD block does not cost the page the others', () => {
    const root = parseHtml(`
      <script type="application/ld+json">{ not json at all,, }</script>
      <script type="application/ld+json">{"@type":"Person","name":"Survivor"}</script>
    `)
    assert.deepEqual(readJsonLd(root).map((n) => n.name), ['Survivor'])
  })

  test('microdata keeps nesting rather than hoisting a child\'s properties', () => {
    const root = parseHtml(`
      <div itemscope itemtype="https://schema.org/Person">
        <span itemprop="name">Outer</span>
        <div itemprop="worksFor" itemscope itemtype="https://schema.org/Organization">
          <span itemprop="name">Inner Corp</span>
        </div>
      </div>
    `)
    const [item] = readMicrodata(root)
    assert.equal(item.type, 'Person')
    assert.deepEqual(item.props.name, ['Outer'], 'the nested name did not leak onto the person')
    assert.equal(item.props.worksFor[0].props.name[0], 'Inner Corp')
  })

  test('a microdata value comes from the attribute its element carries it in', () => {
    const root = parseHtml(`
      <div itemscope itemtype="https://schema.org/Person">
        <a itemprop="url" href="/me">profile</a>
        <meta itemprop="startDate" content="2019-01">
        <time itemprop="birthDate" datetime="1990-04-02">April 1990</time>
      </div>
    `)
    const [item] = readMicrodata(root)
    assert.deepEqual(item.props.url, ['/me'])
    assert.deepEqual(item.props.startDate, ['2019-01'])
    assert.deepEqual(item.props.birthDate, ['1990-04-02'])
  })

  test('the first meta wins, matching what a crawler would take', () => {
    const root = parseHtml('<meta property="og:image" content="first.png"><meta property="og:image" content="second.png">')
    assert.equal(readMeta(root)['og:image'], 'first.png')
  })

  test('the outline gathers content that follows a heading, not only content inside it', () => {
    const root = parseHtml('<body><h2>Experience</h2><ul><li>Engineer, Acme</li></ul><h2>Skills</h2><p>Go</p></body>')
    const outline = readOutline(root)
    assert.deepEqual(outline.map((s) => s.heading), ['Experience', 'Skills'])
    assert.deepEqual(outline[0].items, ['Engineer, Acme'])
    assert.equal(outline[1].text, 'Go')
  })

  test('a list item keeps its internal parts on separate lines', () => {
    // The single highest-value structural signal: role, dates and description are separate
    // elements, and collapsing them fuses a company name into a sentence.
    const root = parseHtml(`
      <h2>Experience</h2>
      <ul><li><strong>Staff Engineer, Kestrel</strong><span>Jun 2021 – Present</span><p>Led the rewrite.</p></li></ul>
    `)
    assert.deepEqual(readOutline(root)[0].items[0].split('\n'), [
      'Staff Engineer, Kestrel',
      'Jun 2021 – Present',
      'Led the rewrite.',
    ])
  })

  test('links are de-duplicated and navigation-only hrefs are dropped', () => {
    const root = parseHtml(`
      <a href="#top">skip</a>
      <a href="javascript:void(0)">menu</a>
      <a href="https://github.com/x">GitHub</a>
      <a href="https://github.com/x">GitHub again</a>
    `)
    assert.deepEqual(readLinks(root).map((l) => l.href), ['https://github.com/x'])
  })

  test('reading signals never throws on rubbish', () => {
    for (const input of ['', '<<<>>>', '<div', '<p>unclosed', '<!-- only a comment -->']) {
      assert.doesNotThrow(() => readSignals(parseHtml(input)))
    }
  })
})

/* -------------------------------------------------------------------------- */

describe('normalization', () => {
  test('JSON-LD outranks OpenGraph for the same field', () => {
    const { profile } = extract(`
      <meta property="og:title" content="Marketing Line About Nobody">
      <meta property="og:description" content="Generic page description.">
      <script type="application/ld+json">
        {"@type":"Person","name":"Real Name","description":"What they actually do."}
      </script>
    `)
    assert.equal(profile.identity.name, 'Real Name')
    assert.equal(profile.identity.summary, 'What they actually do.')
  })

  test('a stronger tier records a higher confidence', () => {
    const strong = extract('<script type="application/ld+json">{"@type":"Person","name":"A B"}</script>')
    const weak = extract('<title>Casey Nolan</title><body><p>hi</p></body>')

    assert.equal(strong.evidence['identity|name'].confidence, 1)
    assert.ok(weak.evidence['identity|name'].confidence < 1)
  })

  test('platform links become socials without this layer knowing any platform', () => {
    const { profile } = extract(`
      <a href="https://github.com/someone">gh</a>
      <a href="https://orcid.org/0000-0002-1825-0097">orcid</a>
      <a href="https://example.com/not-a-platform">blog</a>
    `)
    assert.equal(profile.socials.github, 'https://github.com/someone')
    assert.equal(profile.socials.orcid, 'https://orcid.org/0000-0002-1825-0097')
  })

  test('a relative avatar is resolved against the page it was found on', () => {
    const { profile } = extract(
      '<script type="application/ld+json">{"@type":"Person","name":"A B","image":"/u/a.png"}</script>',
      'https://who.example/profile',
    )
    assert.equal(profile.identity.avatar, 'https://who.example/u/a.png')
  })

  test('og:image is not adopted as an avatar when no person was identified', () => {
    // A studio landing page's link-preview image is a logo, and calling it someone's avatar
    // invents a subject to hang it on.
    const { profile } = extract('<title>Home | Studio Kalpana</title><meta property="og:image" content="/og.png">')
    assert.ok(!profile.identity.name, 'no person was identified')
    assert.ok(!profile.identity.avatar, 'so no avatar was adopted')
  })

  test('a page title only becomes a name when it looks like one', () => {
    assert.equal(titleName('Amara Okonkwo — ML Engineer'), 'Amara Okonkwo')
    assert.equal(titleName('Dr. Hannah Whitfield'), 'Hannah Whitfield', 'an honorific is a title, not a name')
    assert.equal(titleName('Home | Studio Kalpana'), undefined)
    assert.equal(titleName('About Me'), undefined)
    assert.equal(titleName('welcome to my site'), undefined)
  })

  test('records carry a confidence and the page they came from', () => {
    const { profile } = extract(`
      <script type="application/ld+json">
        {"@type":"Person","name":"A B","worksFor":{"@type":"Organization","name":"Acme","startDate":"2022-03"}}
      </script>
    `, 'https://ab.example/')

    const [job] = profile.experience
    assert.equal(job.company, 'Acme')
    assert.equal(job.source.url, 'https://ab.example/')
    assert.ok(job.source.confidence > 0)
  })

  test('dates land as ranges at their true precision', () => {
    const { profile } = extract(`
      <script type="application/ld+json">
        {"@type":"Person","name":"A B","worksFor":{"@type":"Organization","name":"Acme","startDate":"2022-03"}}
      </script>
    `)
    assert.deepEqual(profile.experience[0].dates, {
      start: { iso: '2022-03-01', precision: 'month' },
      current: true,
    })
  })

  test('"Present" is read as ongoing rather than as an end date', () => {
    const { profile } = extract(`
      <h2>Experience</h2>
      <ul><li><strong>Engineer, Acme</strong><span>Jun 2021 – Present</span></li></ul>
    `)
    const [job] = profile.experience
    assert.equal(job.dates.current, true)
    assert.equal(job.dates.end, undefined, 'a current role must not acquire an end date')
  })

  test('one employer written several ways stays one employer', () => {
    for (const [a, b] of [
      ['Google', 'Google LLC'],
      ['Google, Inc.', 'Google'],
      ['Acme Holdings Ltd.', 'Acme'],
      ['Meridian Labs, Inc.', 'Meridian Labs'],
    ]) {
      assert.equal(canonicalOrg(a), canonicalOrg(b), `${a} should match ${b}`)
    }
  })

  test('different employers are not collapsed', () => {
    assert.notEqual(canonicalOrg('Northwind Systems'), canonicalOrg('Northwind Traders'))
    assert.notEqual(canonicalOrg('Acme Robotics'), canonicalOrg('Acme Foods'))
  })

  test('a degree written before its institution is still filed correctly', () => {
    const { profile } = extract(`
      <h2>Education</h2>
      <ul><li><strong>PhD Structural Biology, University of Cambridge</strong><span>2012 – 2016</span></li></ul>
    `)
    const [degree] = profile.education
    assert.equal(degree.institution, 'University of Cambridge')
    assert.equal(degree.degree, 'PhD Structural Biology')
  })

  test('an unrecognised heading does not pour its contents into the section above', () => {
    const { profile } = extract(`
      <h2>Education</h2>
      <ul><li>BSc Physics, Some University</li></ul>
      <h2>Links</h2>
      <ul><li><a href="https://github.com/x">GitHub</a></li></ul>
    `)
    assert.equal(profile.education.length, 1, '"Links" must not become a second university')
  })

  test('extraction returns a fragment, never a whole profile', () => {
    // The boundary the whole design rests on: what comes out of here is evidence to be
    // resolved, not a profile to be published.
    const { profile } = extract('<script type="application/ld+json">{"@type":"Person","name":"A B"}</script>')

    // Collections the page said nothing about stay empty rather than being filled in from
    // somewhere, and nothing generated — stats, scores, `meta.generatedAt` — is invented
    // here. Those belong to the resolver, downstream of the conflict check.
    assert.deepEqual(profile.projects, [])
    assert.deepEqual(profile.experience, [])
    assert.equal(profile.meta?.generatedAt, undefined)
    assert.equal(profile.stats?.entries?.length ?? 0, 0)
  })

  test('a page with nothing on it produces nothing, and says so', () => {
    const { profile, warnings } = extract('<html><body></body></html>')
    assert.ok(!profile.identity.name)
    assert.ok(warnings.some((w) => /no name/i.test(w)))
  })
})

/* -------------------------------------------------------------------------- */

describe('the built-in provider', () => {
  test('declares what it cannot do', () => {
    assert.equal(builtin.capabilities.javascript, false)
    assert.equal(builtin.capabilities.cost, 'free')
    assert.equal(builtin.capabilities.authentication, 'none')
  })

  test('an unreachable page is reported, not thrown', () => {
    // Failure has to be a measurement: one dead URL must not abort a corpus run, and the
    // benchmark's failure-rate metric depends on this shape.
    return builtin
      .fetch('https://nowhere.invalid/', { fetch: async () => { throw new Error('ENOTFOUND') } })
      .then((result) => {
        assert.ok(result.failure)
        assert.equal(result.html, '')
      })
  })

  test('extraction of an empty document yields empty signals rather than an error', async () => {
    const signals = await builtin.extract({ html: '' })
    assert.deepEqual(signals.jsonLd, [])
    assert.deepEqual(signals.links, [])
  })
})
