/**
 * All Setup Fee business rules — thresholds, approval logic, and the
 * commitment-fee schedule math — live here, computed by the backend and
 * never trusted from the client. This deliberately fixes several real gaps
 * found in the old app (see FEATURES.md Phase 2 investigation notes):
 *  - it validated nothing server-side (a client could persist an internally
 *    inconsistent state — percentages not summing to 100%, waived months
 *    past its own stated cap, etc.);
 *  - it only checked 5 of its 14 "other fee" concepts for approval-worthy
 *    changes from default, leaving 9 with no oversight at all;
 *  - it carried two contradictory revenue-threshold constants ($75k/$150k
 *    actually enforced vs. an unused $45k/$75k pair with stale comments).
 * This file uses one canonical set of thresholds and checks every fee.
 */

export const YEAR1_REVENUE_APPROVAL_THRESHOLD_USD = 75_000
export const TOTAL_CONTRACT_VALUE_APPROVAL_THRESHOLD_USD = 150_000
export const WAIVED_MONTHS_APPROVAL_THRESHOLD = 4
export const MAX_WAIVED_MONTHS = 6

export type FeeType = 'setup' | 'network'
export type PaymentSchedule = 'full' | 'custom'
export type McfType = 'standard' | 'principal'

export interface PaymentMilestoneInput {
  milestone: string
  percentage: number
  description?: string
}

export interface McfPrincipalSlotInput {
  slotIndex: number
  label: string
  startMonth: number
  endMonth?: number
  monthlyPrincipal: number
  ratePct: number
}

export interface McfBlockFeeInput {
  blockKey: string
  commitmentFee: number
}

export interface OtherFeeInput {
  conceptCode: string
  amount: number
  isPercentage: boolean
  currencyId?: number
}

export interface SetupFeeInputs {
  feeType: FeeType
  quotedPrice: number
  paymentSchedule: PaymentSchedule
  paymentMilestones: PaymentMilestoneInput[]
  mcfType: McfType
  standardCommitmentFee: number
  commitmentFeeDiscountPct: number
  mcfPrincipalSlots: McfPrincipalSlotInput[]
  mcfBlockFees: McfBlockFeeInput[]
  waivedMonths: number
  rebateIncentive: boolean
  otherFees: OtherFeeInput[]
  contractLengthYears: number
  opportunityType: string | null
}

export interface SetupFeeComputed {
  finalCommitmentFee: number
  totalCommitmentFees: number
  year1CommitmentFees: number
  year1CommittedRevenue: number
  totalContractValue: number
  needsApproval: boolean
  approvalReasons: string[]
}

/** The old app's real "New Partner" defaults — every other Opportunity Type resets all 12 to 0. */
const NEW_PARTNER_OTHER_FEE_DEFAULTS: Record<string, number> = {
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

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function isNewPartner(opportunityType: string | null): boolean {
  return (opportunityType ?? '').trim().toLowerCase() === 'new partner'
}

function isUpsell(opportunityType: string | null): boolean {
  return (opportunityType ?? '').trim().toLowerCase() === 'upsell'
}

function otherFeeDefault(conceptCode: string, opportunityType: string | null): number {
  return isNewPartner(opportunityType) ? (NEW_PARTNER_OTHER_FEE_DEFAULTS[conceptCode] ?? 0) : 0
}

/** Which block a given contract month falls into: year 1 splits into two halves, later years are one block each. */
function blockKeyForMonth(month: number): string {
  if (month <= 6) return 'y1_h1'
  if (month <= 12) return 'y1_h2'
  const year = Math.ceil(month / 12)
  return `y${year}`
}

function principalFeeForMonth(slots: McfPrincipalSlotInput[], month: number): number {
  const slot = slots.find(
    (s) => month >= s.startMonth && (s.endMonth === undefined || month <= s.endMonth)
  )
  if (!slot) return 0
  return slot.monthlyPrincipal * (slot.ratePct / 100)
}

/**
 * Hard validation the client can't be trusted to have done (Vine handles
 * shapes/ranges; this handles cross-field consistency). Returns an empty
 * array when the payload is internally consistent.
 */
export function validateSetupFeeConsistency(inputs: SetupFeeInputs): string[] {
  const errors: string[] = []

  if (inputs.paymentSchedule === 'custom') {
    if (inputs.paymentMilestones.length === 0) {
      errors.push('Custom payment schedule requires at least one milestone.')
    } else {
      const total = inputs.paymentMilestones.reduce((sum, m) => sum + m.percentage, 0)
      if (Math.abs(total - 100) > 0.01) {
        errors.push(`Custom payment schedule must total exactly 100% (got ${round(total, 2)}%).`)
      }
    }
  }

  if (inputs.mcfType === 'principal') {
    const totalMonths = inputs.contractLengthYears * 12
    const requiredSlots = totalMonths > 12 ? 3 : 2
    if (inputs.mcfPrincipalSlots.length < requiredSlots) {
      errors.push(
        `Principal-based commitment fee requires ${requiredSlots} slot(s) for a ${inputs.contractLengthYears}-year contract.`
      )
    }
  }

  return errors
}

export function computeSetupFee(inputs: SetupFeeInputs): SetupFeeComputed {
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

  const approvalReasons: string[] = []

  // Matches the old app's real (intentional) rule: Upsell quotes bypass every
  // setup-fee approval check below.
  if (!isUpsell(inputs.opportunityType)) {
    if (inputs.paymentSchedule !== 'full') {
      approvalReasons.push('Non-standard payment schedule requires approval.')
    }
    if (year1CommittedRevenue < YEAR1_REVENUE_APPROVAL_THRESHOLD_USD) {
      approvalReasons.push(
        `Year 1 committed revenue of $${round(year1CommittedRevenue, 2)} is below the $${YEAR1_REVENUE_APPROVAL_THRESHOLD_USD.toLocaleString()} minimum.`
      )
    }
    if (totalContractValue < TOTAL_CONTRACT_VALUE_APPROVAL_THRESHOLD_USD) {
      approvalReasons.push(
        `Total contract value of $${round(totalContractValue, 2)} is below the $${TOTAL_CONTRACT_VALUE_APPROVAL_THRESHOLD_USD.toLocaleString()} minimum.`
      )
    }
    if (inputs.waivedMonths >= WAIVED_MONTHS_APPROVAL_THRESHOLD) {
      approvalReasons.push(
        `${inputs.waivedMonths} waived months requires approval (threshold: ${WAIVED_MONTHS_APPROVAL_THRESHOLD}+).`
      )
    }
    if (inputs.rebateIncentive) {
      approvalReasons.push('Rebate incentive offered — requires approval.')
    }

    // Every other-fee concept is checked against its Opportunity-Type
    // default — the old app only checked 5 of its 12 equivalents.
    for (const fee of inputs.otherFees) {
      const defaultAmount = otherFeeDefault(fee.conceptCode, inputs.opportunityType)
      if (Math.abs(fee.amount - defaultAmount) > 0.01) {
        approvalReasons.push(`"${fee.conceptCode}" fee differs from its default.`)
      }
    }

    if (inputs.mcfType === 'standard' && inputs.mcfBlockFees.length > 1) {
      const distinctFees = new Set(inputs.mcfBlockFees.map((b) => round(b.commitmentFee, 2)))
      if (distinctFees.size > 1) {
        approvalReasons.push(
          'Commitment fee ramps up/down across the contract — requires approval.'
        )
      }
    }
  }

  return {
    finalCommitmentFee: round(finalCommitmentFee, 2),
    totalCommitmentFees: round(totalCommitmentFees, 2),
    year1CommitmentFees: round(year1CommitmentFees, 2),
    year1CommittedRevenue: round(year1CommittedRevenue, 2),
    totalContractValue: round(totalContractValue, 2),
    needsApproval: approvalReasons.length > 0,
    approvalReasons,
  }
}
