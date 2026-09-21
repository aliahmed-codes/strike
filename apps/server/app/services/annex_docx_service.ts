import * as cheerio from 'cheerio'
import type { CheerioAPI } from 'cheerio'
import type { AnyNode, Element, Text } from 'domhandler'
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx'
import type { FileChild, ParagraphChild } from 'docx'
import { sanitizeAnnexHtml } from '#services/annex_html_sanitizer'

// A4 with the same margins the PDF uses (20 mm top/bottom, 15 mm left/right).
const PAGE = { width: 11906, height: 16838 }
const MARGIN = { top: 1134, bottom: 1134, left: 850, right: 850 }
const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right
const FONT = 'Arial'

interface RunStyle {
  bold?: boolean
  italics?: boolean
  underline?: boolean
  strike?: boolean
  superScript?: boolean
  subScript?: boolean
  color?: string
  size?: number
  highlight?: boolean
}

interface Ctx {
  $: CheerioAPI
  style: RunStyle
  nextListInstance: () => number
}

type InlinePiece =
  | { kind: 'text'; text: string; style: RunStyle }
  | { kind: 'break' }
  | { kind: 'image'; run: ImageRun }
  | { kind: 'link'; href: string; text: string; style: RunStyle }

const INLINE_TAGS = new Set([
  'span',
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
  'a',
  'code',
  'img',
  'br',
])

const HEADINGS: Record<string, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  h1: HeadingLevel.HEADING_1,
  h2: HeadingLevel.HEADING_2,
  h3: HeadingLevel.HEADING_3,
  h4: HeadingLevel.HEADING_4,
  h5: HeadingLevel.HEADING_5,
  h6: HeadingLevel.HEADING_6,
}

function isText(node: AnyNode): node is Text {
  return (node as { type: string }).type === 'text'
}

function isElement(node: AnyNode): node is Element {
  const type = (node as { type: string }).type
  return type === 'tag' || type === 'script' || type === 'style'
}

function parseStyle(element: Element): Record<string, string> {
  const result: Record<string, string> = {}
  for (const part of (element.attribs.style ?? '').split(';')) {
    const index = part.indexOf(':')
    if (index < 0) continue
    result[part.slice(0, index).trim().toLowerCase()] = part.slice(index + 1).trim()
  }
  return result
}

function toHex(value: string | undefined): string | undefined {
  if (!value) return undefined
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
  if (hex) {
    const digits = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1]
    return digits.toUpperCase()
  }
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(value.trim())
  if (rgb) {
    return [rgb[1], rgb[2], rgb[3]]
      .map((part) => Math.min(255, Number(part)).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  }
  return undefined
}

function fontSizeToHalfPoints(value: string | undefined): number | undefined {
  const match = /^([\d.]+)(pt|px)$/i.exec(value?.trim() ?? '')
  if (!match) return undefined
  const points = match[2].toLowerCase() === 'pt' ? Number(match[1]) : Number(match[1]) * 0.75
  return Math.round(points * 2)
}

function styleFor(element: Element, inherited: RunStyle): RunStyle {
  const next: RunStyle = { ...inherited }
  const tag = element.tagName
  if (tag === 'b' || tag === 'strong' || tag in HEADINGS) next.bold = true
  if (tag === 'i' || tag === 'em') next.italics = true
  if (tag === 'u') next.underline = true
  if (tag === 's' || tag === 'strike') next.strike = true
  if (tag === 'sup') next.superScript = true
  if (tag === 'sub') next.subScript = true
  if (tag === 'mark') next.highlight = true
  const css = parseStyle(element)
  const weight = css['font-weight']
  if (weight === 'bold' || Number(weight) >= 600) next.bold = true
  if (css['font-style'] === 'italic') next.italics = true
  const decoration = css['text-decoration'] ?? ''
  if (decoration.includes('underline')) next.underline = true
  if (decoration.includes('line-through')) next.strike = true
  next.color = toHex(css.color) ?? next.color
  next.size = fontSizeToHalfPoints(css['font-size']) ?? next.size
  return next
}

function isHidden(element: Element): boolean {
  return /display\s*:\s*none/i.test(element.attribs.style ?? '')
}

/** Image dimensions read from the bytes, so a picture keeps its proportions in Word. */
function imageSize(buffer: Buffer, type: string): { width: number; height: number } | null {
  try {
    if (type === 'png' && buffer.length > 24) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
    }
    if (type === 'gif' && buffer.length > 10) {
      return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) }
    }
    if (type === 'bmp' && buffer.length > 26) {
      return { width: buffer.readInt32LE(18), height: Math.abs(buffer.readInt32LE(22)) }
    }
    if (type === 'jpg') {
      let offset = 2
      while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) return null
        const marker = buffer[offset + 1]
        const length = buffer.readUInt16BE(offset + 2)
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) }
        }
        offset += 2 + length
      }
    }
  } catch {
    return null
  }
  return null
}

function imageRun(element: Element): ImageRun | null {
  const match = /^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i.exec(element.attribs.src ?? '')
  if (!match) return null
  const type = match[1].toLowerCase().replace('jpeg', 'jpg') as 'png' | 'jpg' | 'gif' | 'bmp'
  const data = Buffer.from(match[2], 'base64')
  const natural = imageSize(data, type) ?? { width: 300, height: 150 }
  const width = Number(element.attribs.width) || natural.width
  const height = Number(element.attribs.height) || (natural.height * width) / natural.width
  const scale = Math.min(1, 620 / width)
  return new ImageRun({
    type,
    data,
    transformation: {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    },
    altText: {
      title: element.attribs.title ?? '',
      description: element.attribs.alt ?? '',
      name: 'image',
    },
  })
}

function collectInline(nodes: AnyNode[], style: RunStyle, out: InlinePiece[]) {
  for (const node of nodes) {
    if (isText(node)) {
      const text = node.data.replace(/[ \t\r\n]+/g, ' ')
      if (text !== '') out.push({ kind: 'text', text, style })
      continue
    }
    if (!isElement(node) || isHidden(node)) continue
    if (node.tagName === 'br') {
      out.push({ kind: 'break' })
    } else if (node.tagName === 'img') {
      const run = imageRun(node)
      if (run) out.push({ kind: 'image', run })
    } else if (node.tagName === 'a' && /^(https?:|mailto:|tel:)/i.test(node.attribs.href ?? '')) {
      const label: InlinePiece[] = []
      collectInline(node.children, styleFor(node, style), label)
      const text = label.map((piece) => (piece.kind === 'text' ? piece.text : '')).join('')
      out.push({ kind: 'link', href: node.attribs.href, text: text || node.attribs.href, style })
    } else {
      collectInline(node.children, styleFor(node, style), out)
    }
  }
}

function toRun(text: string, style: RunStyle): TextRun {
  return new TextRun({
    text,
    font: FONT,
    bold: style.bold,
    italics: style.italics,
    underline: style.underline ? {} : undefined,
    strike: style.strike,
    superScript: style.superScript,
    subScript: style.subScript,
    color: style.color,
    size: style.size,
    highlight: style.highlight ? 'yellow' : undefined,
  })
}

function inlineChildren(pieces: InlinePiece[]): ParagraphChild[] {
  // Collapse the whitespace HTML would collapse at the edges of a block.
  const first = pieces.findIndex((p) => p.kind === 'text')
  if (first >= 0) {
    const piece = pieces[first]
    if (piece.kind === 'text') pieces[first] = { ...piece, text: piece.text.trimStart() }
  }
  for (let i = pieces.length - 1; i >= 0; i -= 1) {
    const piece = pieces[i]
    if (piece.kind === 'text') {
      pieces[i] = { ...piece, text: piece.text.trimEnd() }
      break
    }
  }
  return pieces.flatMap((piece): ParagraphChild[] => {
    if (piece.kind === 'break') return [new TextRun({ break: 1 })]
    if (piece.kind === 'image') return [piece.run]
    if (piece.kind === 'link') {
      return [
        new ExternalHyperlink({
          link: piece.href,
          children: [toRun(piece.text, { ...piece.style, underline: true, color: '0563C1' })],
        }),
      ]
    }
    return piece.text === '' ? [] : [toRun(piece.text, piece.style)]
  })
}

function alignmentOf(
  element: Element | null
): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
  const value = (
    element ? (parseStyle(element)['text-align'] ?? element.attribs.align) : undefined
  )?.toLowerCase()
  if (value === 'center') return AlignmentType.CENTER
  if (value === 'right') return AlignmentType.RIGHT
  if (value === 'justify') return AlignmentType.JUSTIFIED
  return undefined
}

function paragraphOf(
  nodes: AnyNode[],
  ctx: Ctx,
  options: {
    element?: Element
    heading?: string
    numbering?: { reference: string; level: number; instance: number }
  } = {}
): Paragraph | null {
  const pieces: InlinePiece[] = []
  collectInline(nodes, ctx.style, pieces)
  const children = inlineChildren(pieces)
  if (children.length === 0 && !options.heading) return null
  return new Paragraph({
    children,
    heading: options.heading ? HEADINGS[options.heading] : undefined,
    alignment: alignmentOf(options.element ?? null),
    numbering: options.numbering,
    spacing: options.numbering ? { after: 60 } : { after: 120 },
  })
}

function listBlocks(list: Element, ctx: Ctx, level: number): Paragraph[] {
  const ordered = list.tagName === 'ol'
  const instance = ctx.nextListInstance()
  const out: Paragraph[] = []
  for (const item of list.children) {
    if (!isElement(item) || item.tagName !== 'li' || isHidden(item)) continue
    const own = item.children.filter(
      (child) => !(isElement(child) && (child.tagName === 'ul' || child.tagName === 'ol'))
    )
    const paragraph = paragraphOf(
      own,
      { ...ctx, style: styleFor(item, ctx.style) },
      {
        numbering: {
          reference: ordered ? 'numbers' : 'bullets',
          level: Math.min(level, 3),
          instance,
        },
      }
    )
    if (paragraph) out.push(paragraph)
    for (const child of item.children) {
      if (isElement(child) && (child.tagName === 'ul' || child.tagName === 'ol')) {
        out.push(...listBlocks(child, ctx, level + 1))
      }
    }
  }
  return out
}

function tableRows(table: Element): Element[] {
  const rows: Element[] = []
  for (const child of table.children) {
    if (!isElement(child) || isHidden(child)) continue
    if (child.tagName === 'tr') rows.push(child)
    else if (['thead', 'tbody', 'tfoot'].includes(child.tagName)) {
      for (const inner of child.children) {
        if (isElement(inner) && inner.tagName === 'tr' && !isHidden(inner)) rows.push(inner)
      }
    }
  }
  return rows
}

function cellElements(row: Element): Element[] {
  return row.children.filter(
    (child): child is Element =>
      isElement(child) && (child.tagName === 'td' || child.tagName === 'th')
  )
}

function columnWidths(rows: Element[], columns: number): number[] {
  const equal = Math.floor(CONTENT_WIDTH / columns)
  const first = rows[0] ? cellElements(rows[0]) : []
  const percents = first.map((cell) => {
    const value = cell.attribs.width ?? parseStyle(cell).width ?? ''
    const match = /^([\d.]+)%$/.exec(value.trim())
    return match ? Number(match[1]) : null
  })
  const usable =
    first.length === columns &&
    first.every((cell) => Number(cell.attribs.colspan ?? 1) === 1) &&
    percents.every((p): p is number => p !== null) &&
    percents.reduce((a, b) => a + b, 0) <= 100.5
  return usable
    ? (percents as number[]).map((p) => Math.floor((CONTENT_WIDTH * p) / 100))
    : Array.from({ length: columns }, () => equal)
}

function tableBlock(table: Element, ctx: Ctx): Table | null {
  const rows = tableRows(table)
  if (rows.length === 0) return null
  const columns = Math.max(
    1,
    ...rows.map((row) =>
      cellElements(row).reduce(
        (sum, cell) => sum + (Number.parseInt(cell.attribs.colspan ?? '1', 10) || 1),
        0
      )
    )
  )
  const widths = columnWidths(rows, columns)
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' }

  const docxRows = rows.map((row) => {
    let column = 0
    const cells = cellElements(row).map((cell) => {
      const span = Number.parseInt(cell.attribs.colspan ?? '1', 10) || 1
      const rowSpan = Number.parseInt(cell.attribs.rowspan ?? '1', 10) || 1
      const width = widths.slice(column, column + span).reduce((a, b) => a + b, 0)
      column += span
      const css = parseStyle(cell)
      const base = styleFor(cell, cell.tagName === 'th' ? { ...ctx.style, bold: true } : ctx.style)
      const fill = toHex(css['background-color'] ?? css.background)
      const inner = blocks(cell.children, { ...ctx, style: base })
      return new TableCell({
        children: inner.length > 0 ? inner : [new Paragraph('')],
        columnSpan: span > 1 ? span : undefined,
        rowSpan: rowSpan > 1 ? rowSpan : undefined,
        width: { size: width, type: WidthType.DXA },
        verticalAlign: VerticalAlign.TOP,
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
        shading: fill ? { type: ShadingType.CLEAR, fill, color: 'auto' } : undefined,
        borders: { top: border, bottom: border, left: border, right: border },
      })
    })
    return new TableRow({
      children: cells,
      cantSplit: true,
      tableHeader: cellElements(row).every((c) => c.tagName === 'th'),
    })
  })

  return new Table({
    rows: docxRows,
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
  })
}

function blocks(nodes: AnyNode[], ctx: Ctx): FileChild[] {
  const out: FileChild[] = []
  let inline: AnyNode[] = []
  const flush = () => {
    if (inline.length === 0) return
    const paragraph = paragraphOf(inline, ctx)
    if (paragraph) out.push(paragraph)
    inline = []
  }

  for (const node of nodes) {
    if (isText(node)) {
      inline.push(node)
      continue
    }
    if (!isElement(node) || isHidden(node)) continue
    const tag = node.tagName
    if (INLINE_TAGS.has(tag)) {
      inline.push(node)
      continue
    }
    flush()
    const style = styleFor(node, ctx.style)
    if (tag in HEADINGS) {
      const paragraph = paragraphOf(
        node.children,
        { ...ctx, style },
        { element: node, heading: tag }
      )
      if (paragraph) out.push(paragraph)
    } else if (tag === 'ul' || tag === 'ol') {
      out.push(...listBlocks(node, { ...ctx, style }, 0))
    } else if (tag === 'table') {
      const table = tableBlock(node, { ...ctx, style })
      if (table) {
        out.push(table, new Paragraph({ spacing: { after: 120 } }))
      }
    } else if (tag === 'hr') {
      out.push(
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 1 } },
          spacing: { after: 120 },
        })
      )
    } else {
      const hasBlockChild = node.children.some(
        (child) => isElement(child) && !INLINE_TAGS.has(child.tagName)
      )
      if (hasBlockChild) {
        out.push(...blocks(node.children, { ...ctx, style }))
      } else {
        const paragraph = paragraphOf(node.children, { ...ctx, style }, { element: node })
        if (paragraph) out.push(paragraph)
      }
    }
  }
  flush()
  return out
}

function levels(format: (typeof LevelFormat)[keyof typeof LevelFormat], texts: string[]) {
  return texts.map((text, level) => ({
    level,
    format,
    text,
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 720 + level * 360, hanging: 360 } } },
  }))
}

/**
 * Converts saved annex HTML into a Word document. Structure is kept (headings,
 * inline formatting, line breaks, nested lists, tables with spans and widths,
 * data-URI images); hidden rows are left out. The document is sanitized again
 * first, so nothing stored earlier reaches the converter unchecked.
 */
export async function buildAnnexDocx(
  html: string,
  options: { name: string; isApproved: boolean }
): Promise<Buffer> {
  const $ = cheerio.load(sanitizeAnnexHtml(html), {}, false)
  $('[data-annex-hidden]').remove()

  let listInstance = 0
  const ctx: Ctx = { $, style: {}, nextListInstance: () => (listInstance += 1) }
  const children: FileChild[] = []

  if (!options.isApproved) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: 'DRAFT — quote not approved',
            bold: true,
            color: 'C00000',
            font: FONT,
          }),
        ],
      })
    )
  }
  children.push(...blocks($.root().contents().toArray(), ctx))
  if (children.length === 0) children.push(new Paragraph(''))

  const document = new Document({
    title: options.name,
    creator: 'STRIKE',
    styles: {
      default: {
        document: { run: { font: FONT, size: 22 } },
        heading1: {
          run: { font: FONT, size: 36, bold: true },
          paragraph: { spacing: { before: 240, after: 120 } },
        },
        heading2: {
          run: { font: FONT, size: 32, bold: true },
          paragraph: { spacing: { before: 200, after: 100 } },
        },
        heading3: {
          run: { font: FONT, size: 28, bold: true },
          paragraph: { spacing: { before: 160, after: 80 } },
        },
        heading4: {
          run: { font: FONT, size: 24, bold: true },
          paragraph: { spacing: { before: 120, after: 60 } },
        },
      },
    },
    numbering: {
      config: [
        { reference: 'bullets', levels: levels(LevelFormat.BULLET, ['•', '◦', '▪', '•']) },
        { reference: 'numbers', levels: levels(LevelFormat.DECIMAL, ['%1.', '%2.', '%3.', '%4.']) },
      ],
    },
    sections: [{ properties: { page: { size: PAGE, margin: MARGIN } }, children }],
  })

  return Packer.toBuffer(document)
}
