export type FeeType = 'setup' | 'network'
export type PaymentSchedule = 'full' | 'custom'
export type JoiningFeeBillingType = 'at_signing' | 'non_standard'
export type McfType = 'standard' | 'principal'
export type McfBillingStart = 'at_signing' | 'at_go_live' | 'non_standard'
export type RebateType = 'volume' | 'revenue' | 'transaction_count' | 'other'

/** The old app's real 12 "Other Fees" line items — see FEATURES.md Phase 2 investigation notes. */
export const OTHER_FEE_CONCEPTS = [
  'reversal_request',
  'proof_of_payment',
  'emergency_funding',
  'treasury_management',
  'business_hub_platform',
  'post_funding_penalty',
  'corridor_no_usage',
  'white_glove',
  'stablecoin_prefunding',
  'digital_asset_icp_setup',
  'bulk_currency_conversion',
  'currencies_for_treasury',
] as const

export type OtherFeeConcept = (typeof OTHER_FEE_CONCEPTS)[number]

export interface PaymentMilestone {
  id?: number
  milestone: string
  percentage: number
  description?: string | null
}

export interface McfPrincipalSlot {
  id?: number
  slotIndex: number
  label: string
  startMonth: number
  endMonth?: number | null
  monthlyPrincipal: number
  ratePct: number
}

export interface McfBlockFee {
  id?: number
  blockKey: string
  commitmentFee: number
}

export interface OtherFee {
  id?: number
  conceptCode: OtherFeeConcept
  amount: number
  isPercentage: boolean
  currencyId?: number | null
}

/** The full create/update payload — everything the Setup Fee tab can set. */
export interface SetupFeeFields {
  feeType: FeeType
  quotedPrice: number
  paymentSchedule: PaymentSchedule
  paymentMilestones?: PaymentMilestone[]
  joiningFeeBillingType: JoiningFeeBillingType
  mcfType: McfType
  mcfBillingStart: McfBillingStart
  standardCommitmentFee?: number
  commitmentFeeDiscountPct?: number
  mcfPrincipalSlots?: McfPrincipalSlot[]
  mcfBlockFees?: McfBlockFee[]
  waivedMonths: number
  rebateIncentive: boolean
  rebateType?: RebateType | null
  otherFees?: OtherFee[]
}

export interface SetupFee extends SetupFeeFields {
  id: number
  quoteId: number
  needsApproval: boolean
  approvalReasons: string[]
  computedAt: string | null
  createdAt: string
  updatedAt: string
  // Backend-computed, present after any successful save.
  finalCommitmentFee?: number
  totalCommitmentFees?: number
  year1CommitmentFees?: number
  year1CommittedRevenue?: number
  totalContractValue?: number
}

export interface SetupFeeResponse {
  setupFee: SetupFee | null
}
