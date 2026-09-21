import { test } from '@japa/runner'
import { escapeHtml, sanitizeAnnexHtml, sanitizeAnnexName } from '#services/annex_html_sanitizer'

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

test.group('annex html sanitizer: script and markup', () => {
  test('drops script, style, link, meta, base, iframe, form, svg and their contents', ({
    assert,
  }) => {
    const html = sanitizeAnnexHtml(
      '<p>keep</p><script>alert(1)</script><style>body{background:url(http://x)}</style>' +
        '<link rel="stylesheet" href="http://x/a.css"><meta http-equiv="refresh" content="0;url=http://x">' +
        '<base href="http://x/"><iframe src="http://x"></iframe><form action="http://x"><input name="a"></form>' +
        '<svg><script>alert(1)</script><image href="http://x"/></svg><object data="x"></object>'
    )
    assert.equal(html, '<p>keep</p>')
  })

  test('removes event handler attributes, ids and contenteditable', ({ assert }) => {
    const html = sanitizeAnnexHtml(
      `<p id="a" onclick="alert(1)" contenteditable="true" onmouseover="x()">hi</p><img src="${PNG}" onerror="alert(1)">`
    )
    assert.notInclude(html, 'onclick')
    assert.notInclude(html, 'onerror')
    assert.notInclude(html, 'onmouseover')
    assert.notInclude(html, 'contenteditable')
    assert.notInclude(html, 'id=')
  })

  test('keeps ordinary Word-style content', ({ assert }) => {
    const html = sanitizeAnnexHtml(
      '<h1>Fee Annex</h1><p><strong>Bold</strong> and <em>italic</em></p><ul><li>a</li></ul>' +
        '<table><thead><tr><th>Country</th></tr></thead><tbody><tr><td colspan="2">x</td></tr></tbody></table>'
    )
    assert.include(html, '<h1>Fee Annex</h1>')
    assert.include(html, '<strong>Bold</strong>')
    assert.include(html, '<td colspan="2">x</td>')
  })
})

test.group('annex html sanitizer: urls', () => {
  const dangerousHrefs = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\nscript:alert(1)',
    'java\tscript:alert(1)',
    '\u0001javascript:alert(1)',
    ' \u0000javascript:alert(1)',
    '&#106;avascript:alert(1)',
    '&#x6A;avascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    '//evil.example/x',
  ]

  for (const href of dangerousHrefs) {
    test(`strips the href ${JSON.stringify(href)}`, ({ assert }) => {
      const html = sanitizeAnnexHtml(`<a href="${href}">x</a>`)
      assert.notMatch(html, /href=/i)
    })
  }

  test('keeps http, https, mailto and tel links and forces rel', ({ assert }) => {
    for (const href of ['https://a.example/x', 'http://a.example', 'mailto:a@b.co', 'tel:+123']) {
      const html = sanitizeAnnexHtml(`<a href="${href}" target="_blank" onclick="x()">x</a>`)
      assert.include(html, `href="${href}"`)
      assert.include(html, 'rel="noopener noreferrer"')
      assert.notInclude(html, 'target=')
    }
  })
})

test.group('annex html sanitizer: images', () => {
  test('keeps a base64 raster data image', ({ assert }) => {
    assert.include(sanitizeAnnexHtml(`<img src="${PNG}" alt="logo">`), PNG)
  })

  const rejected = [
    'http://evil.example/x.png',
    'https://169.254.169.254/latest/meta-data',
    '//evil.example/x.png',
    'file:///C:/secret.png',
    'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+',
    'data:image/png,not-base64',
    'data:text/html;base64,PGgxPng8L2gxPg==',
    'javascript:alert(1)',
  ]
  for (const src of rejected) {
    test(`removes the image ${src.slice(0, 40)}`, ({ assert }) => {
      assert.equal(sanitizeAnnexHtml(`<p>a<img src="${src}">b</p>`), '<p>ab</p>')
    })
  }

  test('removes an oversized data image', ({ assert }) => {
    const big = `data:image/png;base64,${'A'.repeat(2_100_000)}`
    assert.equal(sanitizeAnnexHtml(`<img src="${big}">`), '')
  })
})

test.group('annex html sanitizer: styles and classes', () => {
  test('keeps allowed style properties and display:none', ({ assert }) => {
    const html = sanitizeAnnexHtml(
      '<p style="color:#123456; font-weight:bold; text-align:center; display:none">x</p>'
    )
    assert.include(html, 'color:#123456')
    assert.include(html, 'font-weight:bold')
    assert.include(html, 'display:none')
  })

  const badStyles = [
    'background:url(http://evil.example/x.png)',
    'background-color:red; background-image:url(x)',
    'width:expression(alert(1))',
    'color:red;behavior:url(x.htc)',
    '-moz-binding:url(x)',
    'background:image-set("http://x/a.png" 1x)',
    'position:fixed; top:0; left:0',
    'display:flex',
    'color:\\72 ed',
    'font-family:var(--x)',
  ]
  for (const style of badStyles) {
    test(`drops the dangerous declaration in ${JSON.stringify(style)}`, ({ assert }) => {
      const html = sanitizeAnnexHtml(`<p style="${style}">x</p>`)
      for (const bad of [
        'url',
        'expression',
        'binding',
        'behavior',
        'image-set',
        'fixed',
        'flex',
        '\\',
        'var(',
      ]) {
        assert.notInclude(html, bad)
      }
    })
  }

  test('keeps only the annex-locked class', ({ assert }) => {
    const html = sanitizeAnnexHtml('<p class="annex-locked evil mso-normal">x</p>')
    assert.include(html, 'class="annex-locked"')
    assert.notInclude(html, 'evil')
    assert.notInclude(html, 'mso-normal')
  })

  test('keeps a valid field marker and drops an invalid one', ({ assert }) => {
    assert.include(
      sanitizeAnnexHtml('<span data-annex-field="setup_fee">$1</span>'),
      'data-annex-field="setup_fee"'
    )
    assert.notInclude(
      sanitizeAnnexHtml('<span data-annex-field="x&quot; onmouseover=&quot;y">$1</span>'),
      'data-annex-field'
    )
    assert.notInclude(
      sanitizeAnnexHtml('<span data-annex-field="a b">$1</span>'),
      'data-annex-field'
    )
  })

  test('clamps colspan/rowspan and drops non-numeric ones', ({ assert }) => {
    const html = sanitizeAnnexHtml(
      '<table><tr><td colspan="9999" rowspan="abc">x</td></tr></table>'
    )
    assert.include(html, 'colspan="50"')
    assert.notInclude(html, 'rowspan')
  })
})

test.group('annex name and escaping', () => {
  test('a name can never carry markup', ({ assert }) => {
    const name = sanitizeAnnexName('</title><script src=//evil.example/x.js></script> Acme')
    assert.notInclude(name, '<')
    assert.notInclude(name, '>')
    assert.include(name, 'Acme')
  })

  test('collapses whitespace and control characters and caps the length', ({ assert }) => {
    assert.equal(sanitizeAnnexName('  A\u0000\n\tB  '), 'A B')
    assert.lengthOf(sanitizeAnnexName('x'.repeat(400)), 255)
  })

  test('escapeHtml escapes the five HTML metacharacters', ({ assert }) => {
    assert.equal(
      escapeHtml(`<a href="x">'&'</a>`),
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;'
    )
  })
})
