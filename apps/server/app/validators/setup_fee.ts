import vine from '@vinejs/vine'

export const FEE_TYPES = ['setup', 'network'] as const
export const PAYMENT_SCHEDULES = ['full', 'custom'] as const
export const JOINING_FEE_BILLING_TYPES = ['at_signing', 'non_standard'] as const
export const MCF_TYPES = ['standard', 'principal'] as const
export const MCF_BILLING_STARTS = ['at_signing', 'at_go_live', 'non_standard'] as const
export const REBATE_TYPES = ['volume', 'revenue', 'transaction_count', 'other'] as const

/**
 * The old app's real 12 "Other Fees" line items (its "Treasury Management
 * Currency" selector isn't its own fee — it's just the currency for the
 * treasury_management row, captured here via that row's `currencyId`).
 */
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

const paymentMilestoneSchema = vine.object({
  milestone: vine.string().trim().maxLength(150),
  percentage: vine.number().min(0).max(100),
  description: vine.string().trim().maxLength(500).optional(),
})

const mcfPrincipalSlotSchema = vine.object({
  slotIndex: vine.number().min(0).max(2),
  label: vine.string().trim().maxLength(100),
  startMonth: vine.number().min(1),
  endMonth: vine.number().min(1).optional(),
  monthlyPrincipal: vine.number().min(0),
  ratePct: vine.number().min(0).max(100),
})

const mcfBlockFeeSchema = vine.object({
  blockKey: vine.string().trim().maxLength(20),
  commitmentFee: vine.number().min(0),
})

const otherFeeSchema = vine.object({
  conceptCode: vine.enum(OTHER_FEE_CONCEPTS),
  amount: vine.number().min(0),
  isPercentage: vine.boolean(),
  currencyId: vine.number().positive().exists({ table: 'currencies', column: 'id' }).optional(),
})

export const updateSetupFeeValidator = vine.compile(
  vine.object({
    feeType: vine.enum(FEE_TYPES),
    quotedPrice: vine.number().min(0),

    paymentSchedule: vine.enum(PAYMENT_SCHEDULES),
    paymentMilestones: vine.array(paymentMilestoneSchema).optional(),

    joiningFeeBillingType: vine.enum(JOINING_FEE_BILLING_TYPES),

    mcfType: vine.enum(MCF_TYPES),
    mcfBillingStart: vine.enum(MCF_BILLING_STARTS),
    standardCommitmentFee: vine.number().min(0).optional(),
    commitmentFeeDiscountPct: vine.number().min(0).max(100).optional(),
    mcfPrincipalSlots: vine.array(mcfPrincipalSlotSchema).optional(),
    mcfBlockFees: vine.array(mcfBlockFeeSchema).optional(),

    // Enforced max is 6, not the old app's misleading 24 (its own UI never
    // actually allowed past 6 — see FEATURES.md Phase 2 investigation notes).
    waivedMonths: vine.number().min(0).max(6),

    rebateIncentive: vine.boolean(),
    rebateType: vine.enum(REBATE_TYPES).optional(),

    otherFees: vine.array(otherFeeSchema).optional(),
  })
)
