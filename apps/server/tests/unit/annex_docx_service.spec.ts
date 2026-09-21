import { test } from '@japa/runner'
import JSZip from 'jszip'
import mammoth from 'mammoth'
import { buildAnnexDocx } from '#services/annex_docx_service'

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

async function toHtml(html: string, isApproved = true): Promise<string> {
  const buffer = await buildAnnexDocx(html, { name: 'Annex', isApproved })
  const result = await mammoth.convertToHtml({ buffer })
  return result.value
}

async function documentXml(html: string, isApproved = true): Promise<string> {
  const buffer = await buildAnnexDocx(html, { name: 'Annex', isApproved })
  const zip = await JSZip.loadAsync(buffer)
  return zip.file('word/document.xml')!.async('string')
}

test.group('annex docx: text', () => {
  test('keeps headings, paragraphs and inline formatting', async ({ assert }) => {
    const out = await toHtml(
      '<h1>Fee Annex</h1><p>Plain <strong>bold</strong> <em>italic</em> <u>under</u> text.</p>'
    )
    assert.match(out, /<h1>.*Fee Annex.*<\/h1>/)
    assert.include(out, '<strong>bold</strong>')
    assert.include(out, '<em>italic</em>')
    assert.include(out, 'Plain')
  })

  test('keeps line breaks instead of running the lines together', async ({ assert }) => {
    const out = await toHtml('<div>OTHER FEES:<br>Business Hub: $500<br>White-Glove: $0</div>')
    assert.include(out, 'OTHER FEES:<br />Business Hub: $500<br />White-Glove: $0')
  })

  test('does not flatten a table nested in a wrapper div', async ({ assert }) => {
    const out = await toHtml(
      '<div><h2>Corridors</h2><table><tr><th>Country</th></tr><tr><td>ARG</td></tr></table></div>'
    )
    assert.match(out, /<h2>.*Corridors.*<\/h2>/)
    assert.include(out, '<table>')
    assert.include(out, 'ARG')
  })

  test('drops hidden rows and paragraphs but not visible ones', async ({ assert }) => {
    const out = await toHtml(
      '<p>Visible</p><p data-annex-hidden="1" style="display:none">HIDDEN ONE</p>' +
        '<p style="display:none">HIDDEN TWO</p>' +
        '<table><tr data-annex-hidden="1" style="display:none"><td>HIDDEN ROW</td></tr><tr><td>Shown row</td></tr></table>'
    )
    assert.include(out, 'Visible')
    assert.include(out, 'Shown row')
    for (const text of ['HIDDEN ONE', 'HIDDEN TWO', 'HIDDEN ROW']) assert.notInclude(out, text)
  })

  test('never carries script content into the document', async ({ assert }) => {
    const out = await toHtml('<p>ok</p><script>alert("pwned")</script>')
    assert.notInclude(out, 'pwned')
  })
})

test.group('annex docx: lists, links and images', () => {
  test('keeps bullet and numbered lists, including nested items', async ({ assert }) => {
    const out = await toHtml(
      '<ul><li>One<ul><li>Nested</li></ul></li><li>Two</li></ul><ol><li>First</li><li>Second</li></ol>'
    )
    assert.include(out, '<ul>')
    assert.include(out, '<ol>')
    for (const text of ['One', 'Nested', 'Two', 'First', 'Second']) assert.include(out, text)
  })

  test('keeps http links and drops others to plain text', async ({ assert }) => {
    const out = await toHtml(
      '<p><a href="https://example.com/terms">Terms</a> and <a href="javascript:alert(1)">bad</a></p>'
    )
    assert.include(out, 'href="https://example.com/terms"')
    assert.notInclude(out, 'javascript')
  })

  test('embeds a data-URI image', async ({ assert }) => {
    const out = await toHtml(`<p>Logo</p><img src="${PNG}" alt="logo">`)
    assert.include(out, 'src="data:image/png;base64,')
  })
})

test.group('annex docx: tables', () => {
  test('keeps colspan and rowspan and marks header rows', async ({ assert }) => {
    const xml = await documentXml(
      '<table><thead><tr><th colspan="2">Fees</th></tr></thead>' +
        '<tbody><tr><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr></tbody></table>'
    )
    assert.include(xml, 'w:gridSpan')
    assert.include(xml, 'w:vMerge')
    assert.include(xml, 'w:tblHeader')
  })

  test('sizes columns from a real grid, never as percentages per cell', async ({ assert }) => {
    const xml = await documentXml(
      '<table><tr><th>A</th><th>B</th><th>C</th></tr><tr><td>1</td><td>2</td><td>3</td></tr></table>'
    )
    assert.include(xml, '<w:tblGrid>')
    assert.notMatch(xml, /w:w="\d{4}%"/)
    assert.notMatch(xml, /3000%/)
  })

  test('applies header fill and colour from inline styles', async ({ assert }) => {
    const xml = await documentXml(
      '<table><tr><th style="background-color:#1e3a5f;color:#ffffff">Country</th></tr></table>'
    )
    assert.include(xml, '1E3A5F')
    assert.include(xml, 'FFFFFF')
  })

  test('uses percentage column widths from the first row when they are given', async ({
    assert,
  }) => {
    const xml = await documentXml(
      '<table><tr><td width="30%">a</td><td width="70%">b</td></tr></table>'
    )
    // 10206 twips of content width: 30% = 3061, 70% = 7144.
    assert.include(xml, 'w:w="3061"')
    assert.include(xml, 'w:w="7144"')
  })
})

test.group('annex docx: page and draft marker', () => {
  test('is A4 with the same margins as the PDF', async ({ assert }) => {
    const xml = await documentXml('<p>x</p>')
    assert.include(xml, 'w:w="11906"')
    assert.include(xml, 'w:h="16838"')
    assert.include(xml, 'w:left="850"')
    assert.include(xml, 'w:top="1134"')
  })

  test('shows the DRAFT banner until the quote is approved', async ({ assert }) => {
    assert.include(await toHtml('<p>x</p>', false), 'DRAFT')
    assert.notInclude(await toHtml('<p>x</p>', true), 'DRAFT')
  })

  test('an empty document still produces a valid file', async ({ assert }) => {
    const buffer = await buildAnnexDocx('', { name: 'Annex', isApproved: true })
    assert.isAbove(buffer.length, 1000)
  })
})
