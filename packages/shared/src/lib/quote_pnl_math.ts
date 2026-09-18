/**
 * The P&L tab's math, shared between the backend (authoritative — computes
 * and validates on save) and the frontend (a live growth preview before
 * saving). Kept in one place so the two can never drift apart — see
 * CLAUDE.md's "one implementation per feature" rule.
 *
 * Formulas were reverse-engineered from the old app's real, active
 * calculation path (`PLTab.tsx`) — see
 * docs/old-app-reference/remaining-quote-tabs.md section 3 for the
 * investigation and the Step 0 decisions (D1-D4) this function implements.
 *
 * Deliberate departures from the old app, all decided in Step 0:
 * - No positive-margin fallback: a corridor aggregate's real total margin is
 *   used even when zero or negative (old app substituted `F + X + MF` when
 *   `M <= 0`, which could hide a loss).
 * - No speculative "Other Monthly Fees" guess: the old app annualized 2 of
 *   its 12 "Other Fee" concepts with an assumed `* 12` occurrence count. NEW
 *   omits this entirely for now (documented gap, not a guess).
 * - Year 2/3 growth scales every corridor-aggregate component by the same
 *   compounding factor directly, rather than the old app's
 *   subtract-fees-then-regrow chain (that chain only existed to route around
 *   the old app's own fallback/O-mixing bugs; with real margins and no O
 *   term, direct proportional scaling is equivalent and much simpler).
 * - Commitment-fee (MCF) revenue for Year 2/3 comes from the real MCF
 *   month-by-month schedule (`commitmentFeesForYearRange`), never an
 *   estimate.
 */

import {
  commitmentFeesForYearRange,
  type McfBlockFeeMathInput,
  type McfPrincipalSlotMathInput,
} from './setup_fee_math.js'

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0
}

/** Old app's real per-opportunity-type gross-margin floor for the *aggregate* P&L view (`approval-guidelines-for-pl.ts`) — a different old-app file, with different numbers, than the corridor-level thresholds in corridor_pricing_math.ts. Both are real and intentionally distinct checks. */
export const PNL_GROSS_MARGIN_THRESHOLD_BY_OPPORTUNITY: Record<string, number> = {
  'new partner': 60,
  'upsell': 45,
}

/** Old app's real aggregate margin-percent floor (Year 1 total margin ÷ Year 1 principal), split by whether any B2B corridor is present on the quote. */
export const PNL_MARGIN_PCT_THRESHOLD_B2B = 0.25
export const PNL_MARGIN_PCT_THRESHOLD_NON_B2B = 0.4

/** Sane bounds for the two user-editable growth inputs — not from the old app (which had none), chosen in Step 0 as a reasonable default pending review. */
export const PNL_GROWTH_PCT_LIMITS = { min: -100, max: 500 } as const

/** Mirrors validateCorridorField in corridor_field_limits.ts, so the P&L tab's inline bounds message can never drift from what the backend validator actually enforces. */
export function validatePnlGrowthField(value: number): string | null {
  if (Number.isNaN(value)) return 'Enter a number'
  if (value < PNL_GROWTH_PCT_LIMITS.min) return `Must be at least ${PNL_GROWTH_PCT_LIMITS.min}`
  if (value > PNL_GROWTH_PCT_LIMITS.max) return `Must not be greater than ${PNL_GROWTH_PCT_LIMITS.max}`
  return null
}

/**
 * The old app's real per-cell approval thresholds, reverse-engineered from
 * its live P&L table (`PLTab.tsx`) and `approval-guidelines-for-pl.ts`. Kept
 * here as the single implementation — the old app hand-copied these same
 * numbers (and their rounding rules) in three separate places, which is
 * exactly the kind of drift this shared-math convention exists to prevent.
 *
 * `grossMarginPct` compares the fully raw ratio — the old app's real check
 * never rounds it, even though it *displays* a rounded whole number, so a
 * true 59.6% correctly fails even where the cell shows "60%". `marginPct`
 * is the opposite: the old app rounds to 2 decimals before comparing.
 */
export function isGrossMarginBelowThreshold(
  rawGrossMarginPct: number,
  opportunityType: string | null
): boolean {
  const threshold = PNL_GROSS_MARGIN_THRESHOLD_BY_OPPORTUNITY[(opportunityType ?? '').trim().toLowerCase()]
  return threshold !== undefined ? rawGrossMarginPct < threshold : rawGrossMarginPct < 0
}

export function isMarginPctBelowThreshold(marginPct: number, hasB2BCorridor: boolean): boolean {
  const threshold = hasB2BCorridor ? PNL_MARGIN_PCT_THRESHOLD_B2B : PNL_MARGIN_PCT_THRESHOLD_NON_B2B
  return round(marginPct, 2) < threshold
}

export function isFxMarginNegative(fxMargin: number): boolean {
  return fxMargin < 0
}

export function isFxMarginPctNegative(fxMarginPct: number): boolean {
  return fxMarginPct < 0
}

/** Only the fields computeQuotePnl needs from a saved corridor's already-computed pricing result. */
export interface PnlPricedCorridor {
  yearlyVolumeUsd: number
  yearlyTransactions: number
  revenueFee: number
  fxMargin: number
  marginFee: number
  totalMargin: number
}

export interface PnlSetupFeeInputs {
  /** The one-off Setup or Network Joining Fee — Year 1 revenue only. Mutually exclusive by construction (feeType chooses which one this represents). */
  quotedPrice: number
  mcfType: 'standard' | 'principal'
  standardCommitmentFee: number
  commitmentFeeDiscountPct: number
  mcfPrincipalSlots: McfPrincipalSlotMathInput[]
  mcfBlockFees: McfBlockFeeMathInput[]
  waivedMonths: number
  contractLengthYears: number
}

export interface QuotePnlYear {
  principal: number
  transactions: number
  atvUsd: number
  feeRevenue: number
  fxMargin: number
  oneOffFee: number
  commitmentFeeRevenue: number
  totalRevenue: number
  marginFee: number
  totalMargin: number
  takeRatePct: number
  marginPct: number
  fxMarginPct: number
  grossMarginPct: number
}

export interface QuotePnlInputs {
  /** Already saved, non-deleted, positive-volume corridors — membership (D1/D2) is the caller's responsibility, not this function's. */
  corridors: PnlPricedCorridor[]
  setupFee: PnlSetupFeeInputs | null
  year2GrowthPct: number
  year3GrowthPct: number
}

export interface QuotePnlResult {
  year1: QuotePnlYear
  year2: QuotePnlYear
  year3: QuotePnlYear
}

function buildYear(
  principal: number,
  transactions: number,
  feeRevenue: number,
  fxMargin: number,
  marginFee: number,
  totalMargin: number,
  oneOffFee: number,
  commitmentFeeRevenue: number
): QuotePnlYear {
  const totalRevenue = feeRevenue + fxMargin + oneOffFee + commitmentFeeRevenue
  const yearTotalMargin = totalMargin + oneOffFee + commitmentFeeRevenue

  return {
    principal: round(principal, 2),
    transactions: Math.round(transactions),
    atvUsd: transactions > 0 ? round(principal / transactions, 2) : 0,
    feeRevenue: round(feeRevenue, 2),
    fxMargin: round(fxMargin, 2),
    oneOffFee: round(oneOffFee, 2),
    commitmentFeeRevenue: round(commitmentFeeRevenue, 2),
    totalRevenue: round(totalRevenue, 2),
    marginFee: round(marginFee, 2),
    totalMargin: round(yearTotalMargin, 2),
    takeRatePct: round(ratio(totalRevenue, principal), 2),
    marginPct: round(ratio(yearTotalMargin, principal), 2),
    fxMarginPct: round(ratio(fxMargin, principal), 2),
    // 2-decimal precision, matching marginPct/fxMarginPct — the old app's
    // real GM% approval check compares the fully raw ratio, so rounding to
    // a whole number here (as the UI displays it) would let a true 59.6%
    // wrongly show "60%" and pass. Display-only rounding happens in PnlTab.
    grossMarginPct: round(ratio(yearTotalMargin, totalRevenue), 2),
  }
}

export function computeQuotePnl(inputs: QuotePnlInputs): QuotePnlResult {
  const { corridors, setupFee, year2GrowthPct, year3GrowthPct } = inputs

  const y1Principal = corridors.reduce((sum, c) => sum + c.yearlyVolumeUsd, 0)
  const y1Transactions = corridors.reduce((sum, c) => sum + c.yearlyTransactions, 0)
  const y1FeeRevenue = corridors.reduce((sum, c) => sum + c.revenueFee, 0)
  const y1FxMargin = corridors.reduce((sum, c) => sum + c.fxMargin, 0)
  const y1MarginFee = corridors.reduce((sum, c) => sum + c.marginFee, 0)
  const y1TotalMargin = corridors.reduce((sum, c) => sum + c.totalMargin, 0)

  const oneOffFee = setupFee?.quotedPrice ?? 0
  const y1CommitmentFeeRevenue = setupFee ? commitmentFeesForYearRange(setupFee, 1, 12) : 0
  const y2CommitmentFeeRevenue = setupFee ? commitmentFeesForYearRange(setupFee, 13, 24) : 0
  const y3CommitmentFeeRevenue = setupFee ? commitmentFeesForYearRange(setupFee, 25, 36) : 0

  const year1 = buildYear(
    y1Principal,
    y1Transactions,
    y1FeeRevenue,
    y1FxMargin,
    y1MarginFee,
    y1TotalMargin,
    oneOffFee,
    y1CommitmentFeeRevenue
  )

  const g12 = 1 + year2GrowthPct / 100
  const g23 = 1 + year3GrowthPct / 100

  const year2 = buildYear(
    y1Principal * g12,
    y1Transactions * g12,
    y1FeeRevenue * g12,
    y1FxMargin * g12,
    y1MarginFee * g12,
    y1TotalMargin * g12,
    0,
    y2CommitmentFeeRevenue
  )

  const year3 = buildYear(
    y1Principal * g12 * g23,
    y1Transactions * g12 * g23,
    y1FeeRevenue * g12 * g23,
    y1FxMargin * g12 * g23,
    y1MarginFee * g12 * g23,
    y1TotalMargin * g12 * g23,
    0,
    y3CommitmentFeeRevenue
  )

  return { year1, year2, year3 }
}
