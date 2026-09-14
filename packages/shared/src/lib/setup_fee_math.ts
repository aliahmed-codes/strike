/**
 * The Setup Fee commitment-fee schedule math, shared between the backend
 * (authoritative — computes and validates on save) and the frontend (a live
 * preview as the user types, before saving). Kept in one place so the two
 * can never drift apart — see CLAUDE.md's "one implementation per feature"
 * rule. Approval-reason text and the "which fees changed from default" check
 * stay backend-only (they need the current user/opportunity-type context),
 * but the two headline thresholds below are simple enough to share so the
 * frontend can show the same "Below $75k minimum" style feedback live,
 * matching the old app's real-time cards.
 */

export const YEAR1_REVENUE_APPROVAL_THRESHOLD_USD = 75_000
export const TOTAL_CONTRACT_VALUE_APPROVAL_THRESHOLD_USD = 150_000
export const WAIVED_MONTHS_APPROVAL_THRESHOLD = 4
export const MAX_WAIVED_MONTHS = 6

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

export function computeSetupFeeTotals(inputs: SetupFeeMathInputs): SetupFeeTotals {
  const totalMonths = Math.max(1, inputs.contractLengthYears * 12)

  const finalCommitmentFee =
    inputs.mcfType === 'principal'
      ? principalFeeForMonth(inputs.mcfPrincipalSlots, 1)
      : inputs.standardCommitmentFee * (1 - inputs.commitmentFeeDiscountPct / 100)

  const blockFeeByKey = new Map(inputs.mcfBlockFees.map((b) => [b.blockKey, b.commitmentFee]))

  let totalCommitmentFees = 0
  let year1CommitmentFees = 0
  for (let month = 1; month <= totalMonths; month += 1) {
    let fee: number
    if (inputs.mcfType === 'principal') {
      fee = principalFeeForMonth(inputs.mcfPrincipalSlots, month)
    } else {
      fee = blockFeeByKey.get(blockKeyForMonth(month)) ?? finalCommitmentFee
    }
    if (month <= inputs.waivedMonths) fee = 0

    totalCommitmentFees += fee
    if (month <= 12) year1CommitmentFees += fee
  }

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

export function isYear1RevenueBelowThreshold(year1CommittedRevenue: number): boolean {
  return year1CommittedRevenue < YEAR1_REVENUE_APPROVAL_THRESHOLD_USD
}

export function isTotalContractValueBelowThreshold(totalContractValue: number): boolean {
  return totalContractValue < TOTAL_CONTRACT_VALUE_APPROVAL_THRESHOLD_USD
}
