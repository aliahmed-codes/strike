import sanitizeHtml from 'sanitize-html'

export const MAX_ANNEX_HTML_LENGTH = 8_000_000
export const MAX_ANNEX_IMAGE_LENGTH = 2_000_000
export const ANNEX_LOCKED_CLASS = 'annex-locked'

const ALLOWED_TAGS = [
  'p',
  'br',
  'hr',
  'span',
  'div',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'strike',
  'sub',
  'sup',
  'small',
  'mark',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'a',
  'img',
  'figure',
  'figcaption',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'caption',
  'colgroup',
  'col',
]

// Tags whose contents must vanish with the tag, not be kept as text.
const DROP_WITH_CONTENT = [
  'script',
  'style',
  'textarea',
  'option',
  'noscript',
  'svg',
  'math',
  'iframe',
  'object',
  'embed',
  'template',
  'title',
  'head',
  'form',
  'select',
  'button',
  'applet',
]

const DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|bmp);base64,[A-Za-z0-9+/]+={0,2}$/i

// One value pattern per style property: a small charset (no backslash, quotes are
// fine) with a lookahead that rejects anything that can fetch or run something.
const SAFE_STYLE_VALUE =
  /^(?!.*(?:url|image-set|expression|import|javascript|behavior|binding|var\())[#a-z0-9\s.,%()\-+/'"]*$/i
const STYLE_PROPERTIES = [
  'color',
  'background-color',
  'background',
  'font-weight',
  'font-style',
  'font-size',
  'font-family',
  'text-decoration',
  'text-align',
  'vertical-align',
  'width',
  'height',
  'min-width',
  'max-width',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-collapse',
  'border-color',
  'border-style',
  'border-width',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'line-height',
  'white-space',
]

const allowedStyles: Record<string, Record<string, RegExp[]>> = {
  '*': {
    ...Object.fromEntries(STYLE_PROPERTIES.map((property) => [property, [SAFE_STYLE_VALUE]])),
    // Hidden fee rows stay in the document (never deleted) so they can come back.
    display: [/^(?:none|block)$/i],
  },
}

const FIELD_NAME = /^[a-z0-9_-]{1,60}$/

function clampSpan(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n >= 1 ? String(Math.min(n, 50)) : undefined
}

/**
 * Allow-list sanitizer for annex HTML. It is applied when a document is saved,
 * when a template is imported, and again just before rendering to PDF/DOCX, so
 * nothing stored earlier can reach Chromium or a browser unchecked.
 */
export function sanitizeAnnexHtml(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      '*': ['class', 'style', 'data-annex-field', 'data-annex-hidden'],
      'a': ['href', 'title', 'rel'],
      'img': ['src', 'alt', 'title', 'width', 'height'],
      'td': ['colspan', 'rowspan', 'align', 'width'],
      'th': ['colspan', 'rowspan', 'align', 'width'],
      'col': ['span', 'width'],
      'table': ['width'],
    },
    allowedClasses: { '*': [ANNEX_LOCKED_CLASS] },
    allowedStyles,
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['data'] },
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    allowProtocolRelative: false,
    nonTextTags: DROP_WITH_CONTENT,
    transformTags: {
      '*': (tagName, attribs) => {
        const next = { ...attribs }
        if (next['data-annex-field'] !== undefined && !FIELD_NAME.test(next['data-annex-field'])) {
          delete next['data-annex-field']
        }
        if (next['data-annex-hidden'] !== undefined && next['data-annex-hidden'] !== '1') {
          delete next['data-annex-hidden']
        }
        if (tagName === 'a') next.rel = 'noopener noreferrer'
        if (tagName === 'td' || tagName === 'th') {
          for (const key of ['colspan', 'rowspan'] as const) {
            const clamped = clampSpan(next[key])
            if (clamped === undefined) delete next[key]
            else next[key] = clamped
          }
        }
        return { tagName, attribs: next }
      },
    },
    exclusiveFilter: (frame) =>
      frame.tag === 'img' &&
      !(
        DATA_IMAGE.test(frame.attribs.src ?? '') &&
        (frame.attribs.src ?? '').length <= MAX_ANNEX_IMAGE_LENGTH
      ),
  })
}

/** Annex names are plain text: no markup at all, so they can never reach a document as HTML. */
export function sanitizeAnnexName(input: string): string {
  return Array.from(input, (char) => {
    const code = char.charCodeAt(0)
    return code < 32 || code === 127 || char === '<' || char === '>' ? ' ' : char
  })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 255)
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
