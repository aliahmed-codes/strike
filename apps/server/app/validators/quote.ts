import vine from '@vinejs/vine'

export const createQuoteValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(200),
    opportunityType: vine.string().trim().maxLength(60).optional(),
    partnerCountryId: vine
      .number()
      .positive()
      .exists({ table: 'countries', column: 'id' })
      .optional(),
    useCaseId: vine.number().positive().exists({ table: 'use_cases', column: 'id' }).optional(),
    integrationTypeId: vine
      .number()
      .positive()
      .exists({ table: 'integration_types', column: 'id' })
      .optional(),
    icpNodeId: vine.number().positive().exists({ table: 'icp_nodes', column: 'id' }).optional(),
    contractLengthYears: vine.number().min(1).max(20).optional(),
    waivedMonths: vine.number().min(0).max(24).optional(),
    partnerPrCode: vine.string().trim().maxLength(60).optional(),
    fundingCurrencyId: vine
      .number()
      .positive()
      .exists({ table: 'currencies', column: 'id' })
      .optional(),
    sourceCurrencyId: vine
      .number()
      .positive()
      .exists({ table: 'currencies', column: 'id' })
      .optional(),
  })
)

export const updateQuoteValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(200).optional(),
    opportunityType: vine.string().trim().maxLength(60).optional(),
    partnerCountryId: vine
      .number()
      .positive()
      .exists({ table: 'countries', column: 'id' })
      .optional(),
    useCaseId: vine.number().positive().exists({ table: 'use_cases', column: 'id' }).optional(),
    integrationTypeId: vine
      .number()
      .positive()
      .exists({ table: 'integration_types', column: 'id' })
      .optional(),
    icpNodeId: vine.number().positive().exists({ table: 'icp_nodes', column: 'id' }).optional(),
    contractLengthYears: vine.number().min(1).max(20).optional(),
    waivedMonths: vine.number().min(0).max(24).optional(),
    partnerPrCode: vine.string().trim().maxLength(60).optional(),
    fundingCurrencyId: vine
      .number()
      .positive()
      .exists({ table: 'currencies', column: 'id' })
      .optional(),
    sourceCurrencyId: vine
      .number()
      .positive()
      .exists({ table: 'currencies', column: 'id' })
      .optional(),
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

export const createQuoteCorridorValidator = vine.compile(
  vine.object({
    corridorId: vine.number().positive().exists({ table: 'corridors', column: 'id' }),
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
  })
)
