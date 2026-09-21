import * as cheerio from 'cheerio'
import puppeteer from 'puppeteer-core'
import env from '#start/env'
import { escapeHtml, sanitizeAnnexHtml } from '#services/annex_html_sanitizer'

export class AnnexPdfUnavailableError extends Error {}

export interface AnnexPdfRenderer {
  render(html: string): Promise<Buffer>
}

const CSS = `
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, "Liberation Sans", sans-serif; font-size: 11pt; line-height: 1.5; color: #333; margin: 0; }
  h1, h2, h3, h4, h5, h6 { font-weight: bold; margin: 16px 0 8px; line-height: 1.25; }
  h1 { font-size: 18pt; } h2 { font-size: 16pt; } h3 { font-size: 14pt; } h4 { font-size: 12pt; } h5, h6 { font-size: 11pt; }
  p { margin: 0 0 10px; }
  ul, ol { margin: 0 0 10px; padding-left: 24px; }
  img { max-width: 100%; height: auto; }
  blockquote { margin: 0 0 10px; padding-left: 12px; border-left: 3px solid #ccc; }
  pre { white-space: pre-wrap; font-size: 10pt; }
  hr { border: 0; border-top: 1px solid #ccc; margin: 12px 0; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th, td { padding: 6px 8px; border: 1px solid #ccc; text-align: left; vertical-align: top; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  table[data-annex-field="corridor_table"] tbody tr:nth-child(even) { background-color: #f9f9f9; }
  .draft-banner { text-align: center; font-weight: bold; color: #c00000; margin: 0 0 12px; }
`

/**
 * The full HTML page handed to Chromium. The content is sanitized again here and
 * hidden rows are removed, the title is escaped, and a CSP forbids everything
 * except inline styles and data: images, so no stored document can make the
 * server fetch anything.
 */
export function buildAnnexPdfHtml(
  content: string,
  options: { name: string; isApproved: boolean }
): string {
  const $ = cheerio.load(sanitizeAnnexHtml(content), {}, false)
  $('[data-annex-hidden]').remove()
  const banner = options.isApproved ? '' : '<p class="draft-banner">DRAFT — quote not approved</p>'
  return (
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">` +
    `<title>${escapeHtml(options.name)}</title><style>${CSS}</style></head>` +
    `<body>${banner}${$.html()}</body></html>`
  )
}

const MAX_CONCURRENT_RENDERS = 2
const RENDER_TIMEOUT_MS = 45_000

/** Headless Chrome/Chromium: JavaScript off and every request except data: URLs aborted. */
class ChromeAnnexPdfRenderer implements AnnexPdfRenderer {
  private active = 0
  private waiting: Array<() => void> = []

  private async acquire() {
    if (this.active >= MAX_CONCURRENT_RENDERS) {
      await new Promise<void>((resolve) => this.waiting.push(resolve))
    }
    this.active += 1
  }

  private release() {
    this.active -= 1
    this.waiting.shift()?.()
  }

  async render(html: string): Promise<Buffer> {
    const executablePath = env.get('CHROME_PATH')
    if (!executablePath) {
      throw new AnnexPdfUnavailableError(
        'PDF download is not configured on this server. Ask an administrator to set CHROME_PATH.'
      )
    }

    await this.acquire()
    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined
    try {
      // A root container cannot start Chrome's sandbox; the page is locked down
      // instead (sanitized HTML, no JavaScript, no network).
      const args = ['--disable-dev-shm-usage', '--disable-gpu', '--no-first-run']
      if (process.platform !== 'win32' && process.getuid?.() === 0) {
        args.push('--no-sandbox', '--disable-setuid-sandbox')
      }
      browser = await puppeteer.launch({ executablePath, headless: true, args, timeout: 30_000 })
      const page = await browser.newPage()
      await page.setJavaScriptEnabled(false)
      await page.setRequestInterception(true)
      page.on('request', (request) => {
        const url = request.url()
        if (url.startsWith('data:') || url === 'about:blank') void request.continue()
        else void request.abort()
      })

      const work = (async () => {
        await page.setContent(html, { waitUntil: 'load', timeout: 20_000 })
        return page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
        })
      })()
      let timer: NodeJS.Timeout | undefined
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('PDF rendering timed out')), RENDER_TIMEOUT_MS)
      })
      // If the timeout wins, the render is abandoned: closing the browser makes it fail quietly.
      work.catch(() => undefined)
      try {
        return Buffer.from(await Promise.race([work, timeout]))
      } finally {
        clearTimeout(timer)
      }
    } finally {
      await browser?.close().catch(() => undefined)
      this.release()
    }
  }
}

let renderer: AnnexPdfRenderer = new ChromeAnnexPdfRenderer()

/** Tests swap the renderer so the suite needs no browser; production always uses Chrome. */
export function useAnnexPdfRenderer(next: AnnexPdfRenderer): AnnexPdfRenderer {
  const previous = renderer
  renderer = next
  return previous
}

export function createChromeAnnexPdfRenderer(): AnnexPdfRenderer {
  return new ChromeAnnexPdfRenderer()
}

export async function buildAnnexPdf(
  content: string,
  options: { name: string; isApproved: boolean }
): Promise<Buffer> {
  return renderer.render(buildAnnexPdfHtml(content, options))
}
