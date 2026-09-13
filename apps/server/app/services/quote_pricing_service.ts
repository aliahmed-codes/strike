/**
 * The backend is the only source of truth for these numbers — the client
 * never computes or submits revenue/margin/take-rate directly, it only
 * submits the raw inputs below. This is a deliberate departure from the old
 * project, which computed everything in the browser and stored the result
 * as an opaque JSON blob (see CLAUDE.md §6 / FEATURES.md item #4).
 *
 * Formulas here are a first pass, not yet confirmed against real finance/
 * business rules — they are intentionally centralized in this one file so
 * they're easy to audit and adjust later without touching any controller,
 * model, or frontend code.
 */

export interface CorridorPricingInputs {
  yearlyVolumeUsd: number
  yearlyTransactions: number
  fixedFeeUsd: number
  variableFeePct: number
  appliedFxSpread: number
  feeDiscountPct: number
}

export interface CorridorPricingResult {
  revenueFee: number
  fxMargin: number
  fxMarginPct: number
  marginFee: number
  totalRevenue: number
  totalMargin: number
  marginPct: number
  grossMarginPct: number
  takeRatePct: number
  needsApproval: boolean
  approvalReasons: string[]
}

/** Only the fields computeQuoteTotals actually needs — decoupled from the Lucid model so it's trivial to unit test. */
export interface PricedCorridor {
  totalRevenue: number | null
  totalMargin: number | null
  yearlyVolumeUsd: number
  yearlyTransactions: number
  needsApproval: boolean
}

export interface QuoteTotals {
  totalRevenue: number
  totalMargin: number
  totalVolumeUsd: number
  totalTransactions: number
  averageTakeRatePct: number
  weightedGrossMarginPct: number
  corridorCount: number
  corridorsNeedingApproval: number
}

/** A discount this large needs a human to sign off on it. */
const FEE_DISCOUNT_APPROVAL_THRESHOLD_PCT = 35

/** A corridor this thin needs a human to sign off on it. */
const GROSS_MARGIN_APPROVAL_THRESHOLD_PCT = 20

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export function computeCorridorPricing(inputs: CorridorPricingInputs): CorridorPricingResult {
  const variableRevenue = inputs.yearlyVolumeUsd * (inputs.variableFeePct / 100)
  const fixedRevenue = inputs.yearlyTransactions * inputs.fixedFeeUsd
  const grossFeeRevenue = variableRevenue + fixedRevenue
  const revenueFee = grossFeeRevenue * (1 - inputs.feeDiscountPct / 100)

  const fxMargin = inputs.yearlyVolumeUsd * (inputs.appliedFxSpread / 100)
  const totalRevenue = revenueFee + fxMargin

  // No cost/expense data is modeled yet — margin equals revenue until a
  // real cost input is added (see FEATURES.md item #4 notes).
  const totalMargin = totalRevenue
  const marginFee = revenueFee

  const fxMarginPct = totalRevenue > 0 ? (fxMargin / totalRevenue) * 100 : 0
  const marginPct = inputs.yearlyVolumeUsd > 0 ? (totalMargin / inputs.yearlyVolumeUsd) * 100 : 0
  const grossMarginPct = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0
  const takeRatePct = inputs.yearlyVolumeUsd > 0 ? (totalRevenue / inputs.yearlyVolumeUsd) * 100 : 0

  const approvalReasons: string[] = []
  if (inputs.feeDiscountPct > FEE_DISCOUNT_APPROVAL_THRESHOLD_PCT) {
    approvalReasons.push(
      `Fee discount of ${inputs.feeDiscountPct}% exceeds the ${FEE_DISCOUNT_APPROVAL_THRESHOLD_PCT}% threshold`
    )
  }
  if (grossMarginPct < GROSS_MARGIN_APPROVAL_THRESHOLD_PCT) {
    approvalReasons.push(
      `Gross margin of ${grossMarginPct.toFixed(2)}% is below the ${GROSS_MARGIN_APPROVAL_THRESHOLD_PCT}% threshold`
    )
  }

  return {
    revenueFee: round(revenueFee, 2),
    fxMargin: round(fxMargin, 2),
    fxMarginPct: round(fxMarginPct, 4),
    marginFee: round(marginFee, 2),
    totalRevenue: round(totalRevenue, 2),
    totalMargin: round(totalMargin, 2),
    marginPct: round(marginPct, 4),
    grossMarginPct: round(grossMarginPct, 4),
    takeRatePct: round(takeRatePct, 4),
    needsApproval: approvalReasons.length > 0,
    approvalReasons,
  }
}

export function computeQuoteTotals(corridors: PricedCorridor[]): QuoteTotals {
  const priced = corridors.filter((c) => c.totalRevenue !== null)

  const totalRevenue = priced.reduce((sum, c) => sum + Number(c.totalRevenue), 0)
  const totalMargin = priced.reduce((sum, c) => sum + Number(c.totalMargin), 0)
  const totalVolumeUsd = priced.reduce((sum, c) => sum + Number(c.yearlyVolumeUsd), 0)
  const totalTransactions = priced.reduce((sum, c) => sum + Number(c.yearlyTransactions), 0)

  const averageTakeRatePct = totalVolumeUsd > 0 ? (totalRevenue / totalVolumeUsd) * 100 : 0
  const weightedGrossMarginPct = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0

  return {
    totalRevenue: round(totalRevenue, 2),
    totalMargin: round(totalMargin, 2),
    totalVolumeUsd: round(totalVolumeUsd, 2),
    totalTransactions,
    averageTakeRatePct: round(averageTakeRatePct, 4),
    weightedGrossMarginPct: round(weightedGrossMarginPct, 4),
    corridorCount: corridors.length,
    corridorsNeedingApproval: corridors.filter((c) => c.needsApproval).length,
  }
}
