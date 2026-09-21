import ExcelJS from 'exceljs'
import type { QuoteLegalData } from '@strike/shared'

const GREEN = 'FFB8E08C'
const FEE_GREEN = 'FFA9DA74'
const BLUE = 'FF4F81BD'
const WHITE = 'FFFFFFFF'
const COLUMN_WIDTHS = [
  24.5, 21.67, 19.83, 17.17, 43.42, 18.42, 8.58, 18.42, 8.83, 18.42, 14.58, 18.42, 6.33, 34.83,
  11.42, 8.25,
]
const MONEY_FORMAT = '#,##0.##'
const YEARS_PER_BAND = 4
const BAND_ROWS = 15

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: BLUE } },
  left: { style: 'thin', color: { argb: BLUE } },
  bottom: { style: 'thin', color: { argb: BLUE } },
  right: { style: 'thin', color: { argb: BLUE } },
}

function fill(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

function labelCell(cell: ExcelJS.Cell, text: string) {
  cell.value = text
  fill(cell, GREEN)
  cell.font = { name: 'Calibri', size: 12, bold: true }
  cell.border = thinBorder
  cell.alignment = { vertical: 'middle' }
}

function valueCell(cell: ExcelJS.Cell, value: string | number, numFmt?: string) {
  cell.value = value
  cell.font = { name: 'Calibri', size: 12 }
  cell.border = thinBorder
  cell.alignment = { vertical: 'middle', horizontal: 'left' }
  if (numFmt) cell.numFmt = numFmt
}

function principalText(principal: number, ratePct: number) {
  return `${principal.toLocaleString('en-US')} at ${ratePct}%`
}

/** Filename like the old app: "Legal Contract - <PR> - <name>.xlsx", with unsafe characters replaced. */
export function legalContractFileName(data: Pick<QuoteLegalData, 'prCode' | 'quoteName'>): string {
  const parts = ['Legal Contract', data.prCode ?? '', data.quoteName]
    .map((part) =>
      part
        .replace(/[\\/:*?"<>|]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter((part) => part.length > 0)
  return `${parts.join(' - ')}.xlsx`
}

/**
 * Renders the Legal Contract workbook from the canonical legal data only —
 * nothing is re-derived here, so it can't disagree with the Legal tab. Assumes
 * the data has no blockers (the caller checks).
 */
export async function buildLegalContractWorkbook(data: QuoteLegalData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Quotation', { views: [{ showGridLines: false }] })
  COLUMN_WIDTHS.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width
  })

  sheet.mergeCells('A1:P2')
  const title = sheet.getCell('A1')
  title.value = 'Legal Summary'
  fill(title, GREEN)
  title.font = { name: 'Calibri', size: 17, bold: true }
  title.alignment = { vertical: 'middle', horizontal: 'center' }

  if (!data.isApproved) {
    sheet.mergeCells('A3:P3')
    const draft = sheet.getCell('A3')
    draft.value = 'DRAFT — this quote has not been approved'
    draft.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFC00000' } }
    draft.alignment = { horizontal: 'center' }
  }

  // Left summary block: label in B, value in C, one row every second row.
  let row = 6
  const addTerm = (label: string, value: string | number, numFmt?: string) => {
    labelCell(sheet.getCell(row, 2), label)
    valueCell(sheet.getCell(row, 3), value, numFmt)
    row += 2
  }

  addTerm('Pricing Model', data.pricingModel ?? '')
  addTerm('FX Model', data.fxModel ?? '')
  addTerm('Fee Currency', data.feeCurrency ?? '')
  addTerm('Funding Currency', data.fundingCurrencies.join(', '))
  addTerm('Source Currency', data.sourceCurrencies.join(', '))
  addTerm('Fee Settlement Balance', data.fundingCurrencies.join(', '))
  addTerm('Contract Duration (years)', data.contractYears ?? 0, '0.##')

  if (data.oneOffFee && data.oneOffFee.amount !== 0) {
    addTerm(
      data.oneOffFee.feeType === 'network' ? 'Network Joining Fee' : 'Set-Up Fee',
      data.oneOffFee.amount,
      MONEY_FORMAT
    )
  }

  const commitment = data.commitment
  if (commitment) {
    addTerm('Commitment Fee Type', commitment.typeLabel)
    const isPrincipal = commitment.type === 'principal'
    if (commitment.uniform) {
      const block = commitment.blocks[0]
      if (isPrincipal) {
        addTerm(
          'Committed Principal / Variable Fee',
          principalText(block.monthlyPrincipal ?? 0, block.ratePct ?? 0)
        )
      } else {
        addTerm('Minimum Monthly Commitment Fee', block.commitmentFee ?? 0, MONEY_FORMAT)
      }
    } else {
      for (const block of commitment.blocks) {
        if (isPrincipal) {
          addTerm(block.label, principalText(block.monthlyPrincipal ?? 0, block.ratePct ?? 0))
        } else {
          addTerm(block.label, block.commitmentFee ?? 0, MONEY_FORMAT)
        }
      }
    }
  }

  const payment = data.payment
  if (payment) {
    addTerm('Payment Schedule', payment.scheduleLabel)
    if (payment.milestones.length > 0) {
      addTerm(
        'Payment Milestones',
        payment.milestones.map((m) => `${m.milestone}: ${m.percentage}%`).join('; ')
      )
    }
    if (payment.joiningFeeBillingLabel) {
      addTerm('Joining Fee Billing Type', payment.joiningFeeBillingLabel)
    }
    addTerm('MCF Billing Start', payment.mcfBillingStartLabel)
    if (payment.rebateEnabled) {
      addTerm('Rebate Incentive', 'Yes')
      if (payment.rebateTypeLabel) addTerm('Rebate Type', payment.rebateTypeLabel)
    }
  }
  let lastUsedRow = row - 2

  // Month-by-month commitment fees: four contract years per band across E..L,
  // further bands stacked below so no contract year is ever left out.
  if (commitment) {
    const totalMonths = commitment.monthlyFees.length
    const years = Math.ceil(totalMonths / 12)
    for (let year = 0; year < years; year += 1) {
      const band = Math.floor(year / YEARS_PER_BAND)
      const startColumn = 5 + (year % YEARS_PER_BAND) * 2
      const top = 6 + band * BAND_ROWS

      sheet.mergeCells(top, startColumn, top, startColumn + 1)
      const header = sheet.getCell(top, startColumn)
      header.value = `Year ${year + 1}`
      fill(header, GREEN)
      header.font = { name: 'Calibri', size: 12, bold: true }
      header.alignment = { horizontal: 'center', vertical: 'middle' }
      labelCell(sheet.getCell(top + 1, startColumn), 'Month')
      labelCell(sheet.getCell(top + 1, startColumn + 1), 'Commitment Fee')

      for (let m = 0; m < 12; m += 1) {
        const month = year * 12 + m + 1
        const monthCell = sheet.getCell(top + 2 + m, startColumn)
        const feeCell = sheet.getCell(top + 2 + m, startColumn + 1)
        fill(feeCell, FEE_GREEN)
        feeCell.font = { name: 'Calibri', size: 12 }
        feeCell.alignment = { horizontal: 'right' }
        if (month > totalMonths) continue
        monthCell.value = month
        monthCell.numFmt = '0'
        monthCell.font = { name: 'Calibri', size: 12 }
        monthCell.alignment = { horizontal: 'center' }
        if (month <= commitment.waivedMonths) {
          feeCell.value = '-'
        } else {
          feeCell.value = commitment.monthlyFees[month - 1]
          feeCell.numFmt = MONEY_FORMAT
        }
      }
      lastUsedRow = Math.max(lastUsedRow, top + 13)
    }
  }

  // Other pricing line items in N/O.
  const other = data.otherLineItems
  labelCell(sheet.getCell(7, 14), 'Other pricing line items')
  labelCell(sheet.getCell(7, 15), 'Price (USD)')
  other.forEach((item, index) => {
    const r = 8 + index
    valueCell(sheet.getCell(r, 14), item.label)
    if (item.kind === 'text') {
      valueCell(sheet.getCell(r, 15), item.text ?? '')
    } else if (item.kind === 'percentage') {
      valueCell(sheet.getCell(r, 15), (item.amount ?? 0) / 100, '0.##%')
    } else {
      valueCell(sheet.getCell(r, 15), item.amount ?? 0, MONEY_FORMAT)
    }
  })
  lastUsedRow = Math.max(lastUsedRow, 7 + other.length)

  // Corridor table, sorted by country upstream; optional columns only when they apply.
  const columns: {
    header: string
    write: (r: QuoteLegalData['corridorRows'][number]) => [string | number, string?]
  }[] = [
    { header: 'Country', write: (r) => [r.country] },
    { header: 'Service', write: (r) => [r.service] },
    { header: 'Vertical', write: (r) => [r.transactionType] },
    { header: 'Payout Currency', write: (r) => [r.payoutCurrency] },
    { header: 'Payer', write: (r) => [r.payer] },
  ]
  if (data.hasMultipleFundingCurrencies) {
    columns.push({ header: 'Funding Currency', write: (r) => [r.fundingCurrency ?? ''] })
  }
  if (data.hasTiers) {
    columns.push({ header: 'Tier', write: (r) => [r.tier === null ? '' : `Tier ${r.tier}`] })
  }
  columns.push(
    { header: 'Fee currency', write: (r) => [r.feeCurrency] },
    { header: 'Fixed Fee', write: (r) => [r.fixedFee, '#,##0.00'] },
    { header: 'Variable Fee', write: (r) => [r.variableFeePct / 100, '0.00%'] }
  )
  if (data.hasFeeDiscount) {
    columns.push({ header: 'Fee Discount', write: (r) => [r.feeDiscountPct / 100, '0.00%'] })
  }
  if (data.showFxSpread) {
    columns.push({ header: 'FX Spread', write: (r) => [(r.fxSpreadPct ?? 0) / 100, '0.00%'] })
  }
  if (data.showFxSource) {
    columns.push({ header: 'Fx Source', write: (r) => [r.fxSource || 'NA'] })
  }

  const headerRow = lastUsedRow + 4
  columns.forEach((column, index) => labelCell(sheet.getCell(headerRow, index + 1), column.header))
  data.corridorRows.forEach((corridorRow, rowIndex) => {
    columns.forEach((column, index) => {
      const [value, numFmt] = column.write(corridorRow)
      valueCell(sheet.getCell(headerRow + 1 + rowIndex, index + 1), value, numFmt)
    })
  })

  // White background under the whole used area, like the old sheet.
  const lastRow = headerRow + data.corridorRows.length + 6
  for (let r = 1; r <= lastRow; r += 1) {
    for (let c = 1; c <= COLUMN_WIDTHS.length; c += 1) {
      const cell = sheet.getCell(r, c)
      if (!cell.fill || cell.fill.type !== 'pattern') fill(cell, WHITE)
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer())
}
