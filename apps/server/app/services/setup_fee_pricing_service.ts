import {
  MAX_WAIVED_MONTHS,
  TOTAL_CONTRACT_VALUE_APPROVAL_THRESHOLD_USD,
  WAIVED_MONTHS_APPROVAL_THRESHOLD,
  YEAR1_REVENUE_APPROVAL_THRESHOLD_USD,
  computeSetupFeeTotals,
  hasCommitmentFeeRamp,
  otherFeeDefault,
  otherFeeDiffersFromDefault,
  otherFeeRequiresCurrency,
} from '@strike/shared'

/**
 * All Setup Fee business rules — thresholds, approval logic, and the
 * commitment-fee schedule math — computed by the backend and never trusted
 * from the client. This deliberately fixes several real gaps found in the
 * old app (see FEATURES.md Phase 2 investigation notes):
 *  - it validated nothing server-side (a client could persist an internally
 *    inconsistent state — percentages not summing to 100%, waived months
 *    past its own stated cap, etc.);
 *  - it only checked 5 of its 14 "other fee" concepts for approval-worthy
 *    changes from default, leaving 9 with no oversight at all;
 *  - it carried two contradictory revenue-threshold constants ($75k/$150k
 *    actually enforced vs. an unused $45k/$75k pair with stale comments).
 * This file uses one canonical set of thresholds and checks every fee.
 *
 * The actual commitment-fee schedule math lives in `@strike/shared` (not
 * duplicated here) so the frontend can show the exact same live preview
 * numbers before saving, without the two ever drifting apart.
 */

export {
  MAX_WAIVED_MONTHS,
  TOTAL_CONTRACT_VALUE_APPROVAL_THRESHOLD_USD,
  WAIVED_MONTHS_APPROVAL_THRESHOLD,
  YEAR1_REVENUE_APPROVAL_THRESHOLD_USD,
  hasCommitmentFeeRamp,
  otherFeeDefault,
  otherFeeDiffersFromDefault,
}

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
  rebateType?: string | null
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

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function isUpsell(opportunityType: string | null): boolean {
  return (opportunityType ?? '').trim().toLowerCase() === 'upsell'
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

  if (inputs.rebateIncentive && !inputs.rebateType) {
    errors.push('Rebate Type is required when Rebate Incentive is enabled.')
  }

  for (const fee of inputs.otherFees) {
    if (otherFeeRequiresCurrency(fee.conceptCode) && !fee.currencyId) {
      errors.push(`"${fee.conceptCode}" fee requires a currency.`)
    }
  }

  return errors
}

export function computeSetupFee(inputs: SetupFeeInputs): SetupFeeComputed {
  const {
    finalCommitmentFee,
    totalCommitmentFees,
    year1CommitmentFees,
    year1CommittedRevenue,
    totalContractValue,
  } = computeSetupFeeTotals({
    quotedPrice: inputs.quotedPrice,
    mcfType: inputs.mcfType,
    standardCommitmentFee: inputs.standardCommitmentFee,
    commitmentFeeDiscountPct: inputs.commitmentFeeDiscountPct,
    mcfPrincipalSlots: inputs.mcfPrincipalSlots,
    mcfBlockFees: inputs.mcfBlockFees,
    waivedMonths: inputs.waivedMonths,
    contractLengthYears: inputs.contractLengthYears,
  })

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
      if (otherFeeDiffersFromDefault(fee.conceptCode, fee.amount, inputs.opportunityType)) {
        approvalReasons.push(`"${fee.conceptCode}" fee differs from its default.`)
      }
    }

    if (inputs.mcfType === 'standard' && hasCommitmentFeeRamp(inputs.mcfBlockFees)) {
      approvalReasons.push('Commitment fee ramps up/down across the contract — requires approval.')
    }
  }

  return {
    finalCommitmentFee,
    totalCommitmentFees,
    year1CommitmentFees,
    year1CommittedRevenue,
    totalContractValue,
    needsApproval: approvalReasons.length > 0,
    approvalReasons,
  }
}
