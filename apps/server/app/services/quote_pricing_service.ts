/**
 * The backend is the only source of truth for these numbers — the client
 * never computes or submits revenue/margin/take-rate directly, it only
 * submits the raw inputs below. This is a deliberate departure from the old
 * project, which computed everything in the browser (as JS floats, with no
 * backend source of truth at all) and stored the result as an opaque JSON
 * blob (see CLAUDE.md §6 / FEATURES.md item #4).
 *
 * Formulas below were reverse-engineered from the old app's real, active
 * calculation path (`client/src/features/quotes/lib/pricing-calculations.ts`
 * and `PricingTab.tsx` — its "server" does none of this math) — see
 * FEATURES.md Phase 1b for the investigation notes. Two things are
 * deliberately NOT replicated because no corresponding data exists in our
 * schema (documented here rather than guessed at):
 *  - The old app's Cost-Plus-with-partner-revenue-share FX margin branch
 *    (depends on a Market-Based-Pricing "partner share" input we don't have).
 *  - The EUR→XAF / EUR→XOF zero-FX-margin special case when spread is 0
 *    (a currency-pair-specific quirk with no documented business reason).
 *  - The old app's "applied FX spread below minimum spread" approval check
 *    (the old app's own code never actually populates a per-corridor
 *    "minimum spread" value from real data either — it's a dead code path).
 */

export interface CorridorMasterData {
  fxSource: string | null
  treasuryFxCostSpread: number | null
  costFixedUsd: number | null
  costVariablePct: number | null
  networkNeedApprovalRaw: string | null
  internalRaw: string | null
  centralBankRaw: string | null
}

export interface CorridorPricingInputs {
  yearlyVolumeUsd: number
  yearlyTransactions: number
  fixedFeeUsd: number
  variableFeePct: number
  appliedFxSpread: number
  feeDiscountPct: number
  transactionTypeCode: string
  fundingCurrencyId: number | null
  payoutCurrencyId: number
  opportunityType: string | null
  corridor: CorridorMasterData
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
  needsFinancialApproval: boolean
  financialApprovalReasons: string[]
  needsNetworkApproval: boolean
  networkApprovalReasons: string[]
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

/** A discount this large needs a human to sign off on it — matches the old app's real threshold. */
const FEE_DISCOUNT_APPROVAL_THRESHOLD_PCT = 35

/** Old app's real per-opportunity-type gross-margin floor (`GM_THRESHOLDS` in approval-guidelines.ts). Any other opportunity type only flags on a *negative* gross margin. */
const GROSS_MARGIN_THRESHOLD_BY_OPPORTUNITY: Record<string, number> = {
  'new partner': 60,
  'upsell': 45,
}

/** Old app's real margin-percent floor (totalMargin / yearlyVolume), split by transaction type. */
const MARGIN_PCT_THRESHOLD_B2B = 0.25
const MARGIN_PCT_THRESHOLD_NON_B2B = 0.35

/** Old app's real floor on the variable fee for Like-for-Like B2B corridors. */
const LIKE_FOR_LIKE_B2B_MIN_VARIABLE_FEE_PCT = 0.1

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function computeFxMargin(inputs: CorridorPricingInputs): number {
  const { corridor, appliedFxSpread, yearlyVolumeUsd, fundingCurrencyId, payoutCurrencyId } = inputs
  const spreadFraction = appliedFxSpread / 100
  const costFraction = corridor.treasuryFxCostSpread ?? 0

  if (corridor.fxSource === 'Cost Plus') {
    return yearlyVolumeUsd * spreadFraction
  }
  if (fundingCurrencyId !== null && fundingCurrencyId === payoutCurrencyId) {
    return 0
  }
  return yearlyVolumeUsd * (spreadFraction - costFraction)
}

function computeMarginFee(inputs: CorridorPricingInputs, revenueFee: number): number {
  const { corridor, yearlyTransactions, yearlyVolumeUsd } = inputs
  const fixedCost = (corridor.costFixedUsd ?? 0) * yearlyTransactions
  const variableCost = (corridor.costVariablePct ?? 0) * yearlyVolumeUsd
  return Math.round(revenueFee) - Math.round(fixedCost + variableCost)
}

/**
 * Financial approval — pricing/margin rules only. Matches the old app's
 * active `checkCorridorApproval` checks that have a real data source in our
 * schema (see file header for what's deliberately omitted).
 */
function checkFinancialApproval(
  inputs: CorridorPricingInputs,
  totalMargin: number,
  grossMarginPct: number
): string[] {
  const reasons: string[] = []
  const opportunityType = (inputs.opportunityType ?? '').trim().toLowerCase()
  const gmThreshold = GROSS_MARGIN_THRESHOLD_BY_OPPORTUNITY[opportunityType]

  if (gmThreshold !== undefined) {
    if (grossMarginPct < gmThreshold) {
      reasons.push(
        `Gross margin of ${round(grossMarginPct, 1)}% is below the ${gmThreshold}% threshold`
      )
    }
  } else if (grossMarginPct < 0) {
    reasons.push(`Gross margin of ${round(grossMarginPct, 1)}% is negative`)
  }

  if (inputs.feeDiscountPct > FEE_DISCOUNT_APPROVAL_THRESHOLD_PCT) {
    reasons.push(
      `Fee discount of ${inputs.feeDiscountPct}% exceeds the ${FEE_DISCOUNT_APPROVAL_THRESHOLD_PCT}% threshold`
    )
  }

  const isB2B = inputs.transactionTypeCode === 'B2B'
  if (isB2B) {
    reasons.push('B2B transaction type requires approval')
  }

  if (inputs.corridor.fxSource === 'Like for Like' && isB2B) {
    if (inputs.variableFeePct < LIKE_FOR_LIKE_B2B_MIN_VARIABLE_FEE_PCT) {
      reasons.push(
        `Like-for-Like B2B variable fee of ${inputs.variableFeePct}% is below the ${LIKE_FOR_LIKE_B2B_MIN_VARIABLE_FEE_PCT}% minimum`
      )
    }
  }

  const marginPctOfVolume =
    inputs.yearlyVolumeUsd > 0 ? (totalMargin / inputs.yearlyVolumeUsd) * 100 : 0
  const marginPctThreshold = isB2B ? MARGIN_PCT_THRESHOLD_B2B : MARGIN_PCT_THRESHOLD_NON_B2B
  if (marginPctOfVolume < marginPctThreshold) {
    reasons.push(
      `Margin of ${round(marginPctOfVolume, 2)}% of volume is below the ${marginPctThreshold}% minimum`
    )
  }

  return reasons
}

/**
 * Network approval — a pure lookup on the corridor's own master data, not a
 * pricing calculation. Matches the old app's real rule exactly: a corridor
 * is clear only if Need Approval = "No" AND Internal = "None" AND Central
 * Bank = "None"; anything else needs network-team sign-off.
 */
function checkNetworkApproval(corridor: CorridorMasterData): string[] {
  const { networkNeedApprovalRaw, internalRaw, centralBankRaw } = corridor

  if (networkNeedApprovalRaw === null && internalRaw === null && centralBankRaw === null) {
    return [
      'Network approval data is not available for this corridor — verify manually with the network team',
    ]
  }

  const reasons: string[] = []
  if (networkNeedApprovalRaw !== 'No') {
    reasons.push(`Corridor catalog flags "Need Approval: ${networkNeedApprovalRaw ?? 'unknown'}"`)
  }
  if (internalRaw !== null && internalRaw !== 'None') {
    reasons.push(`Internal restriction: ${internalRaw}`)
  }
  if (centralBankRaw !== null && centralBankRaw !== 'None') {
    reasons.push(`Central Bank restriction: ${centralBankRaw}`)
  }
  return reasons
}

export function computeCorridorPricing(inputs: CorridorPricingInputs): CorridorPricingResult {
  const variableRevenue = inputs.yearlyVolumeUsd * (inputs.variableFeePct / 100)
  const fixedRevenue = inputs.yearlyTransactions * inputs.fixedFeeUsd
  const grossFeeRevenue = variableRevenue + fixedRevenue
  const revenueFee = grossFeeRevenue * (1 - inputs.feeDiscountPct / 100)

  const fxMargin = computeFxMargin(inputs)
  const marginFee = computeMarginFee(inputs, revenueFee)

  const totalRevenue = fxMargin > 0 ? revenueFee + fxMargin : revenueFee
  const totalMargin = fxMargin > 0 ? fxMargin + marginFee : marginFee

  const fxMarginPct = totalRevenue > 0 ? (fxMargin / totalRevenue) * 100 : 0
  const marginPct = inputs.yearlyVolumeUsd > 0 ? (marginFee / inputs.yearlyVolumeUsd) * 100 : 0
  const grossMarginPct = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0
  const takeRatePct = inputs.yearlyVolumeUsd > 0 ? (totalRevenue / inputs.yearlyVolumeUsd) * 100 : 0

  const financialApprovalReasons = checkFinancialApproval(inputs, totalMargin, grossMarginPct)
  const networkApprovalReasons = checkNetworkApproval(inputs.corridor)
  const approvalReasons = [...financialApprovalReasons, ...networkApprovalReasons]

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
    needsFinancialApproval: financialApprovalReasons.length > 0,
    financialApprovalReasons,
    needsNetworkApproval: networkApprovalReasons.length > 0,
    networkApprovalReasons,
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
