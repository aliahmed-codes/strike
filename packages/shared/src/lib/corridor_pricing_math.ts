/**
 * The Pricing-tab per-corridor math, shared between the backend (authoritative
 * — computes and validates on save) and the frontend (a live preview as the
 * user types, before saving). Kept in one place so the two can never drift
 * apart — see CLAUDE.md's "one implementation per feature" rule.
 *
 * Formulas were reverse-engineered from the old app's real, active
 * calculation path — see FEATURES.md Phase 1b for the investigation notes
 * and for what's deliberately NOT replicated (documented there, not here,
 * since that reasoning is about the old app, not this math).
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
  /**
   * Per-quote-corridor overrides of the corridor catalog's own master data —
   * `null`/`undefined` means "use the catalog value". These are the old
   * app's real "T.E FX Cost Spread %", "Fixed Cost in USD", "Variable Cost
   * %", and "Fx Source" editable cells. Every formula below reads through
   * `effectiveFxSource`/`effectiveTreasuryFxCostSpread`/etc. rather than the
   * raw `corridor.*` field, so an edit here is guaranteed to affect every
   * dependent number consistently — see this file's header comment for why
   * that wasn't true in the old app.
   */
  fxSourceOverride?: string | null
  treasuryFxCostSpreadOverride?: number | null
  costFixedUsdOverride?: number | null
  costVariablePctOverride?: number | null
}

/** The old app's real default ATV when a corridor has no historical data and the user hasn't entered one. */
export const DEFAULT_ATV_USD = 450

/**
 * Yearly transactions is never a free-typed field — it's always derived from
 * volume and ATV, exactly like the old app's real (non-editable) "Yearly
 * transactions" column: `ROUNDUP(volume / ATV, 0)`, falling back to the
 * default ATV when none is set.
 */
export function computeYearlyTransactions(yearlyVolumeUsd: number, atvUsd: number): number {
  if (yearlyVolumeUsd <= 0) return 0
  const workingAtv = atvUsd > 0 ? atvUsd : DEFAULT_ATV_USD
  return Math.ceil(yearlyVolumeUsd / workingAtv)
}

export function effectiveFxSource(inputs: CorridorPricingInputs): string | null {
  return inputs.fxSourceOverride ?? inputs.corridor.fxSource
}

export function effectiveTreasuryFxCostSpread(inputs: CorridorPricingInputs): number | null {
  return inputs.treasuryFxCostSpreadOverride ?? inputs.corridor.treasuryFxCostSpread
}

export function effectiveCostFixedUsd(inputs: CorridorPricingInputs): number | null {
  return inputs.costFixedUsdOverride ?? inputs.corridor.costFixedUsd
}

export function effectiveCostVariablePct(inputs: CorridorPricingInputs): number | null {
  return inputs.costVariablePctOverride ?? inputs.corridor.costVariablePct
}

export interface CorridorPricingResult {
  revenueFee: number
  fxMargin: number
  fxMarginPct: number
  marginFee: number
  /** Margin Fee ÷ yearly volume — the fee-only margin, excluding FX margin. */
  marginFeePct: number
  totalRevenue: number
  totalMargin: number
  /** Total Margin ÷ yearly volume — includes FX margin when positive, unlike marginFeePct. A distinct old-app metric, not a duplicate. */
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

/** A discount this large needs a human to sign off on it — matches the old app's real threshold. */
export const FEE_DISCOUNT_APPROVAL_THRESHOLD_PCT = 35

/** Old app's real per-opportunity-type gross-margin floor (`GM_THRESHOLDS` in approval-guidelines.ts). Any other opportunity type only flags on a *negative* gross margin. */
export const GROSS_MARGIN_THRESHOLD_BY_OPPORTUNITY: Record<string, number> = {
  'new partner': 60,
  'upsell': 45,
}

/** Old app's real margin-percent floor (totalMargin / yearlyVolume), split by transaction type. */
export const MARGIN_PCT_THRESHOLD_B2B = 0.25
export const MARGIN_PCT_THRESHOLD_NON_B2B = 0.35

/** Old app's real floor on the variable fee for Like-for-Like B2B corridors. */
export const LIKE_FOR_LIKE_B2B_MIN_VARIABLE_FEE_PCT = 0.1

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function computeFxMargin(inputs: CorridorPricingInputs): number {
  const { appliedFxSpread, yearlyVolumeUsd, fundingCurrencyId, payoutCurrencyId } = inputs
  const spreadFraction = appliedFxSpread / 100
  const costFraction = effectiveTreasuryFxCostSpread(inputs) ?? 0

  if (effectiveFxSource(inputs) === 'Cost Plus') {
    return yearlyVolumeUsd * spreadFraction
  }
  if (fundingCurrencyId !== null && fundingCurrencyId === payoutCurrencyId) {
    return 0
  }
  return yearlyVolumeUsd * (spreadFraction - costFraction)
}

function computeMarginFee(inputs: CorridorPricingInputs, revenueFee: number): number {
  const { yearlyTransactions, yearlyVolumeUsd } = inputs
  const fixedCost = (effectiveCostFixedUsd(inputs) ?? 0) * yearlyTransactions
  const variableCost = (effectiveCostVariablePct(inputs) ?? 0) * yearlyVolumeUsd
  return Math.round(revenueFee) - Math.round(fixedCost + variableCost)
}

/**
 * Financial approval — pricing/margin rules only. Matches the old app's
 * active `checkCorridorApproval` checks that have a real data source in our
 * schema.
 */
function checkFinancialApproval(
  inputs: CorridorPricingInputs,
  marginPct: number,
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

  if (effectiveFxSource(inputs) === 'Like for Like' && isB2B) {
    if (inputs.variableFeePct < LIKE_FOR_LIKE_B2B_MIN_VARIABLE_FEE_PCT) {
      reasons.push(
        `Like-for-Like B2B variable fee of ${inputs.variableFeePct}% is below the ${LIKE_FOR_LIKE_B2B_MIN_VARIABLE_FEE_PCT}% minimum`
      )
    }
  }

  const marginPctThreshold = isB2B ? MARGIN_PCT_THRESHOLD_B2B : MARGIN_PCT_THRESHOLD_NON_B2B
  if (marginPct < marginPctThreshold) {
    reasons.push(`Margin of ${round(marginPct, 2)}% of volume is below the ${marginPctThreshold}% minimum`)
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
  const marginFeePct = inputs.yearlyVolumeUsd > 0 ? (marginFee / inputs.yearlyVolumeUsd) * 100 : 0
  const marginPct = inputs.yearlyVolumeUsd > 0 ? (totalMargin / inputs.yearlyVolumeUsd) * 100 : 0
  const grossMarginPct = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0
  const takeRatePct = inputs.yearlyVolumeUsd > 0 ? (totalRevenue / inputs.yearlyVolumeUsd) * 100 : 0

  const financialApprovalReasons = checkFinancialApproval(inputs, marginPct, grossMarginPct)
  const networkApprovalReasons = checkNetworkApproval(inputs.corridor)
  const approvalReasons = [...financialApprovalReasons, ...networkApprovalReasons]

  return {
    revenueFee: round(revenueFee, 2),
    fxMargin: round(fxMargin, 2),
    fxMarginPct: round(fxMarginPct, 4),
    marginFee: round(marginFee, 2),
    marginFeePct: round(marginFeePct, 4),
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
