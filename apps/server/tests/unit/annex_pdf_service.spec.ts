import { test } from '@japa/runner'
import env from '#start/env'
import { buildAnnexPdfHtml, createChromeAnnexPdfRenderer } from '#services/annex_pdf_service'

test.group('annex pdf page', () => {
  test('escapes the title so a name can never inject markup', ({ assert }) => {
    const html = buildAnnexPdfHtml('<p>x</p>', {
      name: '</title><script src="//evil.example/x.js"></script>',
      isApproved: true,
    })
    assert.include(html, '<title>&lt;/title&gt;&lt;script')
    assert.notInclude(html, '<script')
  })

  test('forbids every fetch except data images with a content security policy', ({ assert }) => {
    const html = buildAnnexPdfHtml('<p>x</p>', { name: 'a', isApproved: true })
    assert.include(html, "default-src 'none'; img-src data:; style-src 'unsafe-inline'")
  })

  test('sanitizes the content again and removes hidden rows', ({ assert }) => {
    const html = buildAnnexPdfHtml(
      '<p onclick="x()">Keep</p><img src="http://169.254.169.254/x.png"><p data-annex-hidden="1" style="display:none">Gone</p><style>p{background:url(http://x)}</style>',
      { name: 'a', isApproved: true }
    )
    assert.include(html, 'Keep')
    assert.notInclude(html, 'onclick')
    assert.notInclude(html, '169.254.169.254')
    assert.notInclude(html, 'Gone')
    assert.notInclude(html, 'url(http')
  })

  test('adds the DRAFT banner only for an unapproved quote', ({ assert }) => {
    assert.include(buildAnnexPdfHtml('<p>x</p>', { name: 'a', isApproved: false }), 'DRAFT')
    assert.notInclude(buildAnnexPdfHtml('<p>x</p>', { name: 'a', isApproved: true }), 'DRAFT')
  })

  test('fixes the old stylesheet problems: list indent and image width', ({ assert }) => {
    const html = buildAnnexPdfHtml('<ul><li>a</li></ul>', { name: 'a', isApproved: true })
    assert.include(html, 'ul, ol { margin: 0 0 10px; padding-left: 24px; }')
    assert.include(html, 'img { max-width: 100%; height: auto; }')
  })
})

test.group('annex pdf: real browser', () => {
  test('renders a real PDF when CHROME_PATH points at Chrome or Chromium', async ({ assert }) => {
    const renderer = createChromeAnnexPdfRenderer()
    const pdf = await renderer.render(
      buildAnnexPdfHtml('<h1>Fee Annex</h1><table><tr><th>A</th></tr><tr><td>1</td></tr></table>', {
        name: 'Smoke',
        isApproved: false,
      })
    )
    assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-')
    assert.isAbove(pdf.length, 1000)
  }).skip(!env.get('CHROME_PATH'), 'CHROME_PATH is not set')

  test('reports a clear error when no browser is configured', async ({ assert }) => {
    let message = ''
    try {
      await createChromeAnnexPdfRenderer().render('<p>x</p>')
    } catch (error) {
      message = (error as Error).message
    }
    assert.include(message, 'PDF download is not configured')
  }).skip(Boolean(env.get('CHROME_PATH')), 'CHROME_PATH is set')
})
