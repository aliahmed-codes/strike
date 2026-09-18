/**
 * The Setup Fee commitment-fee schedule math, shared between the backend
 * (authoritative — computes and validates on save) and the frontend (a live
 * preview as the user types, before saving). Kept in one place so the two
 * can never drift apart — see CLAUDE.md's "one implementation per feature"
 * rule. Full approval-reason text generation stays backend-only (it needs
 * the current user/quote context), but the underlying thresholds and the
 * per-concept "Other Fee" defaults below are shared so the frontend can show
 * the same live feedback (and seed its form with the *real* defaults,
 * instead of artificial zeros) without ever risking drift from what the
 * backend will actually compute on save.
 */

export const YEAR1_REVENUE_APPROVAL_THRESHOLD_USD = 75_000
export const TOTAL_CONTRACT_VALUE_APPROVAL_THRESHOLD_USD = 150_000
export const WAIVED_MONTHS_APPROVAL_THRESHOLD = 4
export const MAX_WAIVED_MONTHS = 6

/**
 * The one "Other Fee" concept that's a currency-denominated rate rather than
 * a flat USD amount, so it needs a currency selected — shared so the
 * frontend's required-field indicator and the backend's save-time check can
 * never disagree about which concept(s) this applies to.
 */
export const OTHER_FEE_CONCEPTS_REQUIRING_CURRENCY: readonly string[] = ['treasury_management']

export function otherFeeRequiresCurrency(conceptCode: string): boolean {
  return OTHER_FEE_CONCEPTS_REQUIRING_CURRENCY.includes(conceptCode)
}

/** The old app's real "New Partner" other-fee defaults — every other Opportunity Type resets all 12 to 0. */
export const NEW_PARTNER_OTHER_FEE_DEFAULTS: Record<string, number> = {
  reversal_request: 10,
  proof_of_payment: 10,
  emergency_funding: 0.3,
  treasury_management: 0.1,
  business_hub_platform: 500,
  corridor_no_usage: 200,
  bulk_currency_conversion: 200,
  post_funding_penalty: 0,
  white_glove: 0,
  stablecoin_prefunding: 0,
  digital_asset_icp_setup: 0,
  currencies_for_treasury: 0,
}

export function isNewPartnerOpportunity(opportunityType: string | null): boolean {
  return (opportunityType ?? '').trim().toLowerCase() === 'new partner'
}

export function otherFeeDefault(conceptCode: string, opportunityType: string | null): number {
  return isNewPartnerOpportunity(opportunityType) ? (NEW_PARTNER_OTHER_FEE_DEFAULTS[conceptCode] ?? 0) : 0
}

/** Same 0.01 tolerance the backend's real approval check uses — a rounding-safe equality check, not a strict one. */
export function otherFeeDiffersFromDefault(
  conceptCode: string,
  amount: number,
  opportunityType: string | null
): boolean {
  return Math.abs(amount - otherFeeDefault(conceptCode, opportunityType)) > 0.01
}

/**
 * True when a standard (non-principal) commitment-fee schedule has two or
 * more distinct per-period override amounts — the backend's real approval
 * rule ("Commitment fee ramps up/down across the contract"). Only meaningful
 * when mcfType === 'standard'; callers gate on that themselves, same as the
 * backend does, since a ramp isn't a concept a principal-based schedule has.
 */
export function hasCommitmentFeeRamp(mcfBlockFees: McfBlockFeeMathInput[]): boolean {
  if (mcfBlockFees.length <= 1) return false
  const distinctFees = new Set(mcfBlockFees.map((b) => round(b.commitmentFee, 2)))
  return distinctFees.size > 1
}

export interface McfPrincipalSlotMathInput {
  startMonth: number
  endMonth?: number | null
  monthlyPrincipal: number
  ratePct: number
}

export interface McfBlockFeeMathInput {
  blockKey: string
  commitmentFee: number
}

export interface SetupFeeMathInputs {
  quotedPrice: number
  mcfType: 'standard' | 'principal'
  standardCommitmentFee: number
  commitmentFeeDiscountPct: number
  mcfPrincipalSlots: McfPrincipalSlotMathInput[]
  mcfBlockFees: McfBlockFeeMathInput[]
  waivedMonths: number
  contractLengthYears: number
}

export interface SetupFeeTotals {
  finalCommitmentFee: number
  totalCommitmentFees: number
  year1CommitmentFees: number
  year1CommittedRevenue: number
  totalContractValue: number
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/** Which block a given contract month falls into: year 1 splits into two halves, later years are one block each. */
export function blockKeyForMonth(month: number): string {
  if (month <= 6) return 'y1_h1'
  if (month <= 12) return 'y1_h2'
  const year = Math.ceil(month / 12)
  return `y${year}`
}

export function principalFeeForMonth(slots: McfPrincipalSlotMathInput[], month: number): number {
  const slot = slots.find(
    (s) => month >= s.startMonth && (s.endMonth === undefined || s.endMonth === null || month <= s.endMonth)
  )
  if (!slot) return 0
  return slot.monthlyPrincipal * (slot.ratePct / 100)
}

/** Month-by-month commitment fee (after waived-months zeroing), for months 1..contractLengthYears*12. Shared by computeSetupFeeTotals and commitmentFeesForYearRange so the two can never disagree on what a given month's fee is. */
function monthlyCommitmentFeeSchedule(inputs: SetupFeeMathInputs): {
  fees: number[]
  finalCommitmentFee: number
} {
  const totalMonths = Math.max(1, inputs.contractLengthYears * 12)

  const finalCommitmentFee =
    inputs.mcfType === 'principal'
      ? principalFeeForMonth(inputs.mcfPrincipalSlots, 1)
      : inputs.standardCommitmentFee * (1 - inputs.commitmentFeeDiscountPct / 100)

  const blockFeeByKey = new Map(inputs.mcfBlockFees.map((b) => [b.blockKey, b.commitmentFee]))

  const fees: number[] = []
  for (let month = 1; month <= totalMonths; month += 1) {
    let fee: number
    if (inputs.mcfType === 'principal') {
      fee = principalFeeForMonth(inputs.mcfPrincipalSlots, month)
    } else {
      fee = blockFeeByKey.get(blockKeyForMonth(month)) ?? finalCommitmentFee
    }
    if (month <= inputs.waivedMonths) fee = 0
    fees.push(fee)
  }

  return { fees, finalCommitmentFee }
}

export function computeSetupFeeTotals(inputs: SetupFeeMathInputs): SetupFeeTotals {
  const { fees, finalCommitmentFee } = monthlyCommitmentFeeSchedule(inputs)

  const totalCommitmentFees = fees.reduce((sum, fee) => sum + fee, 0)
  const year1CommitmentFees = fees.slice(0, 12).reduce((sum, fee) => sum + fee, 0)

  const year1CommittedRevenue = inputs.quotedPrice + year1CommitmentFees
  const totalContractValue = inputs.quotedPrice + totalCommitmentFees

  return {
    finalCommitmentFee: round(finalCommitmentFee, 2),
    totalCommitmentFees: round(totalCommitmentFees, 2),
    year1CommitmentFees: round(year1CommitmentFees, 2),
    year1CommittedRevenue: round(year1CommittedRevenue, 2),
    totalContractValue: round(totalContractValue, 2),
  }
}

/**
 * Real, schedule-backed commitment-fee revenue for a specific 1-indexed
 * month range (e.g. months 13-24 for Year 2 of a fixed 3-year P&L
 * projection — see quote_pnl_math.ts). Never extrapolated past the quote's
 * actual contractLengthYears: months beyond the schedule contribute 0,
 * rather than guessing a continued fee the contract doesn't cover.
 */
export function commitmentFeesForYearRange(
  inputs: SetupFeeMathInputs,
  startMonth: number,
  endMonth: number
): number {
  const { fees } = monthlyCommitmentFeeSchedule(inputs)
  let total = 0
  for (let month = startMonth; month <= Math.min(endMonth, fees.length); month += 1) {
    total += fees[month - 1]
  }
  return round(total, 2)
}

export function isYear1RevenueBelowThreshold(year1CommittedRevenue: number): boolean {
  return year1CommittedRevenue < YEAR1_REVENUE_APPROVAL_THRESHOLD_USD
}

export function isTotalContractValueBelowThreshold(totalContractValue: number): boolean {
  return totalContractValue < TOTAL_CONTRACT_VALUE_APPROVAL_THRESHOLD_USD
}
