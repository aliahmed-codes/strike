import vine from '@vinejs/vine'

const PRICING_STRATEGIES = [
  'corridor_pricing',
  'flat_fee',
  'volume_based',
  'tiered_pricing',
] as const
const FX_PRICING_OPTIONS = ['fx_spread', 'revenue_share'] as const
const FX_MODELS = ['traditional_fx', 'trading_desk', 'both_models'] as const

const quoteFields = {
  opportunityType: vine.string().trim().maxLength(60).optional(),
  partnerCountryId: vine
    .number()
    .positive()
    .exists({ table: 'countries', column: 'id' })
    .optional(),
  useCaseIds: vine
    .array(vine.number().positive().exists({ table: 'use_cases', column: 'id' }))
    .optional(),
  integrationTypeId: vine
    .number()
    .positive()
    .exists({ table: 'integration_types', column: 'id' })
    .optional(),
  icpLevel1Id: vine.number().positive().exists({ table: 'icp_nodes', column: 'id' }).optional(),
  icpLevel2Id: vine.number().positive().exists({ table: 'icp_nodes', column: 'id' }).optional(),
  icpLevel3Id: vine.number().positive().exists({ table: 'icp_nodes', column: 'id' }).optional(),
  contractLengthYears: vine.number().min(1).max(20).optional(),
  partnerPrCode: vine.string().trim().maxLength(60).optional(),
  showFxSourceInContract: vine.boolean().optional(),
  showFxSpreadInContract: vine.boolean().optional(),
  fxModel: vine.enum(FX_MODELS).optional(),
  selectedPricingStrategy: vine.enum(PRICING_STRATEGIES).optional(),
  selectedFxPricing: vine.enum(FX_PRICING_OPTIONS).optional(),
  fundingCurrencyId: vine
    .number()
    .positive()
    .exists({ table: 'currencies', column: 'id' })
    .optional(),
  fundingCurrencyIds: vine
    .array(vine.number().positive().exists({ table: 'currencies', column: 'id' }))
    .optional(),
  sourceCurrencyId: vine
    .number()
    .positive()
    .exists({ table: 'currencies', column: 'id' })
    .optional(),
  sourceCurrencyIds: vine
    .array(vine.number().positive().exists({ table: 'currencies', column: 'id' }))
    .optional(),
  defaultFeeCurrencyId: vine
    .number()
    .positive()
    .exists({ table: 'currencies', column: 'id' })
    .optional(),
}

export const createQuoteValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(200),
    ...quoteFields,
  })
)

export const updateQuoteValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(200).optional(),
    ...quoteFields,
  })
)

const corridorPricingFields = {
  fundingCurrencyId: vine
    .number()
    .positive()
    .exists({ table: 'currencies', column: 'id' })
    .optional(),
  atvUsd: vine.number().min(0).optional(),
  yearlyVolumeUsd: vine.number().min(0),
  yearlyTransactions: vine.number().min(0),
  fixedFeeUsd: vine.number().min(0),
  variableFeePct: vine.number().min(0).max(100),
  appliedFxSpread: vine.number().min(0).max(100),
  feeDiscountPct: vine.number().min(0).max(100).optional(),
}

const PRICING_MODELS = ['standard', 'tiered'] as const

const corridorTierFields = vine.object({
  tierNumber: vine.number().min(1).max(3),
  yearlyVolumeUsd: vine.number().min(0),
  fixedFeeUsd: vine.number().min(0),
  variableFeePct: vine.number().min(0).max(100),
  appliedFxSpread: vine.number().min(0).max(100),
})

export const createQuoteCorridorValidator = vine.compile(
  vine.object({
    corridorId: vine.number().positive().exists({ table: 'corridors', column: 'id' }),
    pricingModel: vine.enum(PRICING_MODELS).optional(),
    tiers: vine.array(corridorTierFields).optional(),
    ...corridorPricingFields,
  })
)

export const updateQuoteCorridorValidator = vine.compile(
  vine.object({
    fundingCurrencyId: vine
      .number()
      .positive()
      .exists({ table: 'currencies', column: 'id' })
      .optional(),
    atvUsd: vine.number().min(0).optional(),
    yearlyVolumeUsd: vine.number().min(0).optional(),
    yearlyTransactions: vine.number().min(0).optional(),
    fixedFeeUsd: vine.number().min(0).optional(),
    variableFeePct: vine.number().min(0).max(100).optional(),
    appliedFxSpread: vine.number().min(0).max(100).optional(),
    feeDiscountPct: vine.number().min(0).max(100).optional(),
    pricingModel: vine.enum(PRICING_MODELS).optional(),
    tiers: vine.array(corridorTierFields).optional(),
  })
)
