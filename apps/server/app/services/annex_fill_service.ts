import * as cheerio from 'cheerio'
import type { Cheerio, CheerioAPI } from 'cheerio'
import type { AnyNode, Element, Text } from 'domhandler'
import { OTHER_FEE_META } from '@strike/shared'
import type {
  LegalCommitmentBlock,
  LegalCorridorRow,
  OtherFeeConcept,
  QuoteLegalData,
} from '@strike/shared'
import { ANNEX_LOCKED_CLASS, escapeHtml, sanitizeAnnexHtml } from '#services/annex_html_sanitizer'

export interface AnnexFillResult {
  html: string
  warnings: string[]
}

const PLACEHOLDER = 'to be included by pricing'

const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
const percentage = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 4 })}%`
const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Text patterns whose containing paragraph or table is locked, as in the old annex. */
const LOCKED_SECTION_PATTERNS = [
  '[Thunes Connection Table]',
  'POST PAID',
  'THUNES BUSINESS HUB MONTHLY FEE',
  'REVERSAL FEE (payable by Customer',
  'PROOF OF PAYMENT FEE (payable by Customer',
  'NETWORK JOINING FEE:',
  'SET-UP FEE:',
  'MINIMUM MONTHLY COMMITMENT:',
  'TREASURY MANAGEMENT FEE:',
  '[PRICING TO INCLUDE ANY ADDITIONAL PER TRANSACTION FEES',
  'Thunes will be under no obligation to provide any Service until',
]

function isText(node: AnyNode): node is Text {
  return (node as { type: string }).type === 'text'
}

function textNodes($: CheerioAPI): Text[] {
  const found: Text[] = []
  const walk = (nodes: AnyNode[]) => {
    for (const node of nodes) {
      if (isText(node)) found.push(node)
      else if ('children' in node) walk(node.children)
    }
  }
  walk($.root().contents().toArray())
  return found
}

function setStyleDisplay($el: Cheerio<Element>, hidden: boolean) {
  const rest = ($el.attr('style') ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part && !/^display\s*:/i.test(part))
  if (hidden) {
    $el.attr('style', [...rest, 'display:none'].join('; '))
    $el.attr('data-annex-hidden', '1')
  } else {
    if (rest.length > 0) $el.attr('style', rest.join('; '))
    else $el.removeAttr('style')
    $el.removeAttr('data-annex-hidden')
  }
}

function hide($el: Cheerio<Element>) {
  setStyleDisplay($el, true)
}

function marker(field: string, text: string): string {
  return `<span data-annex-field="${field}" class="${ANNEX_LOCKED_CLASS}">${escapeHtml(text)}</span>`
}

/** Updates every marker already carrying this field; false when the template has none yet. */
function updateMarkers($: CheerioAPI, field: string, text: string): boolean {
  const found = $(`[data-annex-field="${field}"]`)
  if (found.length === 0) return false
  found.text(text)
  return true
}

function setCell($cell: Cheerio<Element>, field: string, text: string) {
  $cell.html(marker(field, text))
}

/** The nearest paragraph-like ancestor, refusing table cells and wrappers that hold a whole section. */
function paragraphOf($: CheerioAPI, node: Text): Cheerio<Element> | null {
  if (!node.parent) return null
  const container = $(node.parent as Element).closest('p, li, td, th, div')
  if (container.length === 0) return null
  const tag = (container.get(0) as Element | undefined)?.tagName
  if (tag === 'td' || tag === 'th') return null
  return container.text().length <= 800 ? (container as Cheerio<Element>) : null
}

interface Ctx {
  $: CheerioAPI
  data: QuoteLegalData
  warnings: string[]
  selected: 'setup' | 'network'
  oneOffAmount: number
}

function otherFee(ctx: Ctx, concept: OtherFeeConcept) {
  return ctx.data.otherFees[concept] ?? { amount: 0, isPercentage: false, currencyCode: null }
}

function feeText(ctx: Ctx, concept: OtherFeeConcept): string {
  const fee = otherFee(ctx, concept)
  const base = fee.isPercentage ? percentage(fee.amount) : money(fee.amount)
  if (concept === 'corridor_no_usage') return `${base} per month per corridor`
  if (concept === 'bulk_currency_conversion') return `${base} per month`
  return base
}

/** Fee rows in the big-table template, matched on the squashed label like the old annex. */
const FEE_ROWS: { concept: OtherFeeConcept; matches: (key: string) => boolean }[] = [
  { concept: 'treasury_management', matches: (k) => k.includes('treasurymanagementfee') },
  { concept: 'reversal_request', matches: (k) => k.includes('reversalfee') },
  { concept: 'proof_of_payment', matches: (k) => k.includes('proofofpaymentfee') },
  { concept: 'business_hub_platform', matches: (k) => k.includes('businesshub') },
  { concept: 'emergency_funding', matches: (k) => k.includes('emergencyfundingfee') },
  { concept: 'corridor_no_usage', matches: (k) => k.includes('corridornousagefee') },
  { concept: 'bulk_currency_conversion', matches: (k) => k.includes('bulkcurrencyconversion') },
  { concept: 'white_glove', matches: (k) => k.includes('whiteglove') },
  { concept: 'post_funding_penalty', matches: (k) => k.includes('postfundingline') },
  {
    concept: 'stablecoin_prefunding',
    matches: (k) => k.includes('stablecoin') && k.includes('setupfee'),
  },
  {
    concept: 'digital_asset_icp_setup',
    matches: (k) => k.includes('digitalasset') && k.includes('setupfee'),
  },
]

const PERIOD_KEYS = ['month1to6', 'month7to12', 'month13']
const PERIOD_STARTS = [1, 7, 13]

function blockAt(blocks: LegalCommitmentBlock[], month: number): LegalCommitmentBlock | undefined {
  return blocks.find(
    (block) => month >= block.startMonth && (block.endMonth === null || month <= block.endMonth)
  )
}

function fillTableRows(ctx: Ctx) {
  const { $, data } = ctx
  const commitment = data.commitment
  const totalMonths = commitment?.monthlyFees.length ?? 0

  $('tr').each((_, row) => {
    const $row = $(row)
    const cells = $row.children('td, th').toArray()
    if (cells.length < 2) return
    const keys = cells.map((cell) => squash($(cell).text()))
    const valueCellAfter = (labelIndex: number) =>
      $(cells[labelIndex + 1 < cells.length ? labelIndex + 1 : cells.length - 1])

    // Initial Term: keep the legal wording around the period.
    const termIndex = keys.findIndex((key) => key === 'initialterm')
    if (termIndex >= 0) {
      const years = data.contractYears
      if (years === null || years <= 0) {
        ctx.warnings.push('Contract length is not set, so the Initial Term was left as it is.')
      } else {
        const term = `${years} year${years === 1 ? '' : 's'}`
        const $value = valueCellAfter(termIndex)
        const current = $value.text()
        const next = /\[[^\]]*\]/.test(current)
          ? current.replace(/\[[^\]]*\]/, term)
          : current.trim() === ''
            ? term
            : current.replace(/^\s*\d+(?:\.\d+)?\s+years?/i, term)
        if (next !== current) $value.text(next)
      }
      return
    }

    // One-off fee rows: exact label so "Stablecoin Set-up Fee" is never caught.
    const firstLabel = keys.findIndex((key) => key !== '')
    if (
      firstLabel >= 0 &&
      (keys[firstLabel] === 'networkjoiningfee' || keys[firstLabel] === 'setupfee')
    ) {
      const type = keys[firstLabel] === 'networkjoiningfee' ? 'network' : 'setup'
      if (type === ctx.selected) {
        setCell(valueCellAfter(firstLabel), `one_off_${type}`, money(ctx.oneOffAmount))
      } else {
        hide($row)
      }
      return
    }

    // Waiver period.
    const waiverIndex = keys.findIndex(
      (key) =>
        key.includes('mmcwaiverperiod') || (key.includes('waiverperiod') && key.includes('month'))
    )
    if (waiverIndex >= 0) {
      if (commitment) {
        setCell(valueCellAfter(waiverIndex), 'mmc_waiver_months', String(commitment.waivedMonths))
      } else {
        ctx.warnings.push(
          'No commitment terms could be built, so the MMC waiver period was left as it is.'
        )
      }
      return
    }

    // Commitment period rows.
    if (commitment) {
      for (let i = 0; i < cells.length; i += 1) {
        const key = keys[i]
        const period = PERIOD_KEYS.findIndex((periodKey) => key.includes(periodKey))
        if (period < 0) continue
        let kind: 'standard' | 'principalRate' | 'principalAmount' | null = null
        if (key.includes('monthlyprincipal') && key.includes('volumecommitment')) {
          kind = 'principalAmount'
        } else if (key.includes('minimummonthlycommitmentfee')) {
          kind = key.includes('principalbased') ? 'principalRate' : 'standard'
        }
        if (!kind) continue
        const isPrincipal = commitment.type === 'principal'
        const belongs = isPrincipal ? kind !== 'standard' : kind === 'standard'
        const applies = PERIOD_STARTS[period] <= totalMonths
        if (!belongs || !applies) {
          hide($row)
          return
        }
        const block = blockAt(commitment.blocks, PERIOD_STARTS[period])
        if (block) {
          const text =
            kind === 'standard'
              ? money(block.commitmentFee ?? 0)
              : kind === 'principalRate'
                ? percentage(block.ratePct ?? 0)
                : money(block.monthlyPrincipal ?? 0)
          setCell(valueCellAfter(i), `mcf_${period + 1}_${kind}`, text)
        }
        return
      }
    }

    // Other fee rows.
    for (let i = 0; i < cells.length; i += 1) {
      const feeRow = FEE_ROWS.find((candidate) => candidate.matches(keys[i]))
      if (!feeRow) continue
      setCell(valueCellAfter(i), `fee_${feeRow.concept}`, feeText(ctx, feeRow.concept))
      return
    }
  })
}

/** Replaces `LABEL: [to be included by pricing]` with a marker, or refreshes the marker already there. */
function fillPlaceholder(
  ctx: Ctx,
  spec: { label: string; field: string; value: string; labelField?: string; labelText?: string }
) {
  const { $ } = ctx
  if (updateMarkers($, spec.field, spec.value)) {
    if (spec.labelField && spec.labelText) updateMarkers($, spec.labelField, spec.labelText)
    return
  }
  const pattern = new RegExp(`(${spec.label})\\s*\\[[^\\]]*${PLACEHOLDER}[^\\]]*\\]`, 'i')
  for (const node of textNodes($)) {
    const match = pattern.exec(node.data)
    // The label must open the text, so "Stablecoin Pre-funding Set-up Fee" is never taken for "Set-up Fee".
    if (!match || node.data.slice(0, match.index).trim() !== '') continue
    const after = node.data.slice(match.index + match[0].length)
    const label = spec.labelField
      ? marker(spec.labelField, spec.labelText ?? match[1])
      : escapeHtml(match[1])
    $(node).replaceWith(`${label} ${marker(spec.field, spec.value)}${escapeHtml(after)}`)
    return
  }
}

function principalString(blocks: LegalCommitmentBlock[]): string {
  return blocks
    .map(
      (block) => `${block.label}: ${money(block.monthlyPrincipal ?? 0)} at ${block.ratePct ?? 0}%`
    )
    .join('; ')
}

function fillPlaceholders(ctx: Ctx) {
  const { data } = ctx
  const treasury = otherFee(ctx, 'treasury_management')

  fillPlaceholder(ctx, {
    label: 'SET[\\s-]*UP\\s+FEE\\s*:',
    field: 'set_up_fee',
    value: money(ctx.selected === 'setup' ? ctx.oneOffAmount : 0),
  })
  fillPlaceholder(ctx, {
    label: 'NETWORK\\s+JOINING\\s+FEE\\s*:',
    field: 'network_joining_fee',
    value: money(ctx.selected === 'network' ? ctx.oneOffAmount : 0),
  })

  if (data.commitment) {
    const isPrincipal = data.commitment.type === 'principal'
    fillPlaceholder(ctx, {
      label: 'MINIMUM\\s+MONTHLY\\s+COMMITMENT\\s*:',
      field: 'minimum_monthly_commitment',
      labelField: 'mmc_label',
      labelText: isPrincipal
        ? 'MONTHLY COMMITTED PRINCIPAL / VARIABLE COMMITMENT FEE -'
        : 'MINIMUM MONTHLY COMMITMENT:',
      value: isPrincipal
        ? principalString(data.commitment.blocks)
        : money(data.commitment.blocks[0]?.commitmentFee ?? 0),
    })
  }

  fillPlaceholder(ctx, {
    label: 'TREASURY\\s+MANAGEMENT\\s+FEE\\s*:',
    field: 'treasury_management_fee',
    value: treasury.isPercentage ? percentage(treasury.amount) : money(treasury.amount),
  })
  fillPlaceholder(ctx, {
    label: 'REVERSAL\\s+FEE\\s*\\([^)]*\\)\\s*:',
    field: 'reversal_fee',
    value: money(otherFee(ctx, 'reversal_request').amount),
  })
  fillPlaceholder(ctx, {
    label: 'PROOF\\s+OF\\s+PAYMENT\\s+FEE\\s*\\([^)]*\\)\\s*:',
    field: 'proof_of_payment_fee',
    value: money(otherFee(ctx, 'proof_of_payment').amount),
  })
}

/** "EMERGENCY FUNDING FEE: 0.3%" — the value after the colon is a live marker. */
function fillEmergencyFunding(ctx: Ctx) {
  const { $ } = ctx
  const value = feeText(ctx, 'emergency_funding')
  if (updateMarkers($, 'emergency_funding_fee', value)) return
  const pattern = /(emergency\s+funding\s+fee\s*:)\s*[\d.,]*\s*%?/i
  for (const node of textNodes($)) {
    const match = pattern.exec(node.data)
    if (!match) continue
    const before = node.data.slice(0, match.index)
    const after = node.data.slice(match.index + match[0].length)
    $(node).replaceWith(
      `${escapeHtml(before)}${escapeHtml(match[1])} ${marker('emergency_funding_fee', value)}${escapeHtml(after)}`
    )
    return
  }
}

const OTHER_FEE_LINES: OtherFeeConcept[] = [
  'business_hub_platform',
  'post_funding_penalty',
  'corridor_no_usage',
  'white_glove',
  'stablecoin_prefunding',
  'digital_asset_icp_setup',
  'bulk_currency_conversion',
]

function otherFeesBlock(ctx: Ctx): string {
  const lines = OTHER_FEE_LINES.flatMap((concept) => {
    const fee = otherFee(ctx, concept)
    // A zero penalty would read as a penalty that applies, so it is left out.
    if (concept === 'post_funding_penalty' && fee.amount <= 0) return []
    return [`${escapeHtml(OTHER_FEE_META[concept].label)}: ${escapeHtml(feeText(ctx, concept))}`]
  })
  return `OTHER FEES:<br>${lines.join('<br>')}`
}

/** The OTHER FEES paragraph block that follows the Network Joining Fee paragraph in paragraph-style templates. */
function fillOtherFees(ctx: Ctx) {
  const { $ } = ctx
  const html = otherFeesBlock(ctx)
  const existing = $('[data-annex-field="other_fees"]')
  if (existing.length > 0) {
    existing.html(html)
  } else {
    for (const node of textNodes($)) {
      if (!/network\s*joining\s*fee\s*:/i.test(node.data)) continue
      const container = paragraphOf($, node)
      if (!container) return
      container.after(
        `<div data-annex-field="other_fees" class="${ANNEX_LOCKED_CLASS}">${html}</div>`
      )
      break
    }
  }

  // The generic "additional per transaction fees" paragraph is replaced by that block.
  if ($('[data-annex-field="other_fees"]').length > 0) {
    for (const node of textNodes($)) {
      if (
        /^\s*\[?\s*pricing\s+to\s+include\s+any\s+additional\s+per\s+transaction\s+fees/i.test(
          node.data
        )
      ) {
        const container = paragraphOf($, node)
        if (container) hide(container)
      }
    }
  }
}

function fillFeeChoiceSentence(ctx: Ctx) {
  const { $ } = ctx
  const choice = ctx.selected === 'network' ? 'Network Joining' : 'Set-Up'
  if (updateMarkers($, 'fee_choice', choice)) return
  const pair =
    /\[\s*(?:network\s*joining|set[\s-]*up)\s*\]\s*[/\\]?\s*\[\s*(?:network\s*joining|set[\s-]*up)\s*\]/i
  for (const node of textNodes($)) {
    if (!/no obligation to provide any Service/i.test(node.data)) continue
    const match = pair.exec(node.data)
    if (!match) continue
    $(node).replaceWith(
      `${escapeHtml(node.data.slice(0, match.index))}${marker('fee_choice', choice)}${escapeHtml(
        node.data.slice(match.index + match[0].length)
      )}`
    )
    return
  }
}

function corridorColumns(data: QuoteLegalData) {
  const columns: { header: string; value: (row: LegalCorridorRow) => string }[] = [
    { header: 'Country', value: (r) => r.countryCode },
    { header: 'Service', value: (r) => r.service },
    { header: 'Vertical', value: (r) => r.transactionType },
    { header: 'Payout CCY', value: (r) => r.payoutCurrency },
  ]
  if (data.hasMultipleFundingCurrencies) {
    columns.push({ header: 'Funding CCY', value: (r) => r.fundingCurrency ?? '' })
  }
  if (data.hasTiers)
    columns.push({ header: 'Tier', value: (r) => (r.tier === null ? '' : `Tier ${r.tier}`) })
  columns.push(
    { header: 'Fee CCY', value: (r) => r.feeCurrency },
    { header: 'Fixed Fee', value: (r) => r.fixedFee.toFixed(2) },
    { header: 'Var Fee', value: (r) => `${r.variableFeePct.toFixed(2)}%` }
  )
  if (data.showFxSpread) {
    columns.push({ header: 'FX Spread', value: (r) => `${(r.fxSpreadPct ?? 0).toFixed(2)}%` })
  }
  if (data.showFxSource) columns.push({ header: 'FX Source', value: (r) => r.fxSource || '—' })
  columns.push({
    header: 'Volumes',
    value: (r) => Math.round(r.yearlyVolumeUsd).toLocaleString('en-US'),
  })
  return columns
}

function corridorTableHtml(data: QuoteLegalData): string {
  const columns = corridorColumns(data)
  const head = columns
    .map(
      (c) =>
        `<th style="padding:8px; border:1px solid #cccccc; text-align:left; font-weight:bold; background-color:#1e3a5f; color:#ffffff">${escapeHtml(c.header)}</th>`
    )
    .join('')
  const body = data.corridorRows
    .map(
      (row) =>
        `<tr>${columns
          .map(
            (c) =>
              `<td style="padding:8px; border:1px solid #cccccc">${escapeHtml(c.value(row))}</td>`
          )
          .join('')}</tr>`
    )
    .join('')
  return (
    `<table data-annex-field="corridor_table" class="${ANNEX_LOCKED_CLASS}" ` +
    `style="width:100%; border-collapse:collapse; margin:10px 0"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
  )
}

const CORRIDOR_HEADER_WORDS = ['country', 'service', 'vertical', 'payout', 'fx']

function fillCorridorTable(ctx: Ctx) {
  const { $, data } = ctx
  const existing = $('table[data-annex-field="corridor_table"]').first()
  let target = existing
  if (target.length === 0) {
    $('table').each((_, table) => {
      if (target.length > 0) return
      const $table = $(table)
      const headerCells = $table.find('thead th, thead td')
      const cells =
        headerCells.length > 0 ? headerCells : $table.find('tr').first().children('th, td')
      const headerText = cells
        .toArray()
        .map((cell) => $(cell).text().toLowerCase())
        .join(' ')
      const score = CORRIDOR_HEADER_WORDS.filter((word) => headerText.includes(word)).length
      if (score >= 3) target = $table
    })
  }
  if (target.length === 0) {
    ctx.warnings.push(
      'No corridor table was found in the annex (its header row needs Country, Service, Vertical, Payout or FX), so no corridors were added.'
    )
    return
  }
  if (data.corridorRows.length === 0) {
    ctx.warnings.push('There are no priced corridors yet, so the corridor table is empty.')
  }
  target.replaceWith(corridorTableHtml(data))
}

function nearestRow($: CheerioAPI, node: Text): Cheerio<Element> {
  return $(node.parent as Element).closest('tr') as Cheerio<Element>
}

function hideUnselectedFeeType(ctx: Ctx) {
  const { $ } = ctx
  const unselected =
    ctx.selected === 'setup' ? /network[\s-]*joining[\s-]*fee/i : /set[\s-]*up[\s-]*fee/i
  const anchored = new RegExp(`^\\s*(?:the\\s+)?(?:${unselected.source})`, 'i')
  const exactLabel = ctx.selected === 'setup' ? 'networkjoiningfee' : 'setupfee'

  for (const node of textNodes($)) {
    if (!unselected.test(node.data) || !anchored.test(node.data)) continue
    const row = nearestRow($, node)
    if (row.length > 0) {
      const table = row.closest('table')
      if (table.find('tr').length > 2) {
        const first = row
          .children('td, th')
          .toArray()
          .map((cell) => squash($(cell).text()))
          .find((key) => key !== '')
        if (first === exactLabel) hide(row)
      } else {
        hide(table as Cheerio<Element>)
      }
      continue
    }
    const paragraph = paragraphOf($, node)
    if (!paragraph) continue
    hide(paragraph)
    const next = paragraph.next()
    if (next.get(0)?.tagName === 'table') hide(next as Cheerio<Element>)
  }

  // Payment-schedule tables that belong to the unselected fee.
  $('table').each((_, table) => {
    const $table = $(table)
    if ($table.find('tr').length > 6) return
    const headerText = (
      $table.find('thead').length > 0 ? $table.find('thead') : $table.find('tr').first()
    )
      .text()
      .toLowerCase()
    if (!/payment|schedule/.test(headerText)) return
    if (unselected.test($table.text())) {
      hide($table as Cheerio<Element>)
      const previous = $table.prev()
      if (unselected.test(previous.text())) hide(previous as Cheerio<Element>)
    }
  })
}

function hideOptionalParagraphs(ctx: Ctx) {
  const { $ } = ctx
  const treasuryZero = otherFee(ctx, 'treasury_management').amount === 0

  for (const node of textNodes($)) {
    if (treasuryZero && node.data.includes('TREASURY MANAGEMENT FEE:')) {
      const paragraph = paragraphOf($, node)
      if (paragraph) hide(paragraph)
    }
    if (/thunes\s+business\s+hub\s+monthly\s+fee/i.test(node.data)) {
      const row = nearestRow($, node)
      const target = row.length > 0 ? row : paragraphOf($, node)
      if (target) hide(target)
    }
  }
}

function lockSections(ctx: Ctx) {
  const { $ } = ctx
  for (const node of textNodes($)) {
    if (!LOCKED_SECTION_PATTERNS.some((pattern) => node.data.includes(pattern))) continue
    if (!node.parent) continue
    const container = $(node.parent as Element).closest('p, div, td, th, li')
    if (container.length > 0 && container.text().length <= 800)
      container.addClass(ANNEX_LOCKED_CLASS)
  }
  $('table').each((_, table) => {
    const text = $(table).text()
    if (LOCKED_SECTION_PATTERNS.some((pattern) => text.includes(pattern))) {
      $(table).addClass(ANNEX_LOCKED_CLASS)
    }
  })
  $('[data-annex-field]').addClass(ANNEX_LOCKED_CLASS)
}

/** Attribute order depends on the order things were set in, so it is fixed to keep output stable and comparable. */
function sortAttributes($: CheerioAPI) {
  $('*').each((_, node) => {
    const element = node as Element
    element.attribs = Object.fromEntries(
      Object.entries(element.attribs).sort(([a], [b]) => a.localeCompare(b))
    )
  })
}

export function canonicalAnnexHtml(html: string): string {
  const $ = cheerio.load(html, {}, false)
  sortAttributes($)
  return $.html()
}

/**
 * Fills a sanitized annex document from the canonical legal data. It is a pure
 * function of (document, data) and idempotent: every filled value sits in a
 * marker span and every hidden element keeps `display:none` plus a marker, so
 * running it again (after a price, fee type or contract-length change) refreshes
 * everything and can bring hidden rows back. Nothing is invented — a missing
 * input leaves the template text alone and adds a warning.
 */
export function fillAnnexHtml(html: string, data: QuoteLegalData): AnnexFillResult {
  const $ = cheerio.load(html, {}, false)
  const warnings: string[] = []

  // Hidden state is recomputed from the current data, so lift last time's hiding first.
  $('[data-annex-hidden]').each((_, el) => setStyleDisplay($(el) as Cheerio<Element>, false))

  if (!data.oneOffFee) {
    warnings.push('No Setup Fee has been saved yet, so the fee sections were left as they are.')
    return { html: $.html(), warnings }
  }

  const ctx: Ctx = {
    $,
    data,
    warnings,
    selected: data.oneOffFee.feeType,
    oneOffAmount: data.oneOffFee.amount,
  }

  fillTableRows(ctx)
  fillPlaceholders(ctx)
  fillEmergencyFunding(ctx)
  fillOtherFees(ctx)
  fillCorridorTable(ctx)
  hideOptionalParagraphs(ctx)
  hideUnselectedFeeType(ctx)
  fillFeeChoiceSentence(ctx)
  lockSections(ctx)
  sortAttributes($)

  return { html: $.html(), warnings }
}

/** True when the saved annex no longer matches what filling it from the current quote data would produce. */
export function isAnnexStale(saved: string, data: QuoteLegalData): boolean {
  const normalized = canonicalAnnexHtml(sanitizeAnnexHtml(saved))
  const refreshed = canonicalAnnexHtml(sanitizeAnnexHtml(fillAnnexHtml(normalized, data).html))
  return normalized !== refreshed
}
