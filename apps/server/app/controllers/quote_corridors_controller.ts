import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import type User from '#models/user'
import Quote from '#models/quote'
import QuoteCorridor from '#models/quote_corridor'
import QuoteCorridorTier from '#models/quote_corridor_tier'
import Corridor from '#models/corridor'
import { canAccessQuote } from '#services/quote_access_service'
import {
  computeCorridorPricing,
  computeTieredCorridorPricing,
  validateTierAllocation,
  type CorridorMasterData,
  type CorridorTierInput,
} from '#services/quote_pricing_service'
import { createQuoteCorridorValidator, updateQuoteCorridorValidator } from '#validators/quote'

function masterDataFor(corridor: Corridor): CorridorMasterData {
  return {
    fxSource: corridor.fxSource,
    treasuryFxCostSpread: corridor.treasuryFxCostSpread,
    costFixedUsd: corridor.costFixedUsd,
    costVariablePct: corridor.costVariablePct,
    networkNeedApprovalRaw: corridor.networkNeedApprovalRaw,
    internalRaw: corridor.internalRaw,
    centralBankRaw: corridor.centralBankRaw,
  }
}

async function loadEditableQuote(quoteId: number, user: User) {
  const quote = await Quote.find(quoteId)
  if (!quote) {
    return { error: { status: 404 as const, message: 'Quote not found' } }
  }
  if (!canAccessQuote(user, quote)) {
    return { error: { status: 403 as const, message: 'You do not have access to this quote' } }
  }
  if (quote.status !== 'draft') {
    return {
      error: { status: 409 as const, message: 'Quote is not editable in its current status' },
    }
  }
  return { quote }
}

/**
 * Prices a corridor and persists the result, branching on pricingModel.
 * `tiers` is the desired tier set for a tiered corridor — required when
 * switching into 'tiered', optional (falls back to the corridor's existing
 * tier rows) when re-pricing after an unrelated field change.
 */
async function priceAndSave(
  quoteCorridor: QuoteCorridor,
  corridor: Corridor,
  quote: Quote,
  tiers: CorridorTierInput[] | undefined
): Promise<{ error: string } | { ok: true }> {
  const commonInputs = {
    transactionTypeCode: corridor.transactionTypeCode,
    fundingCurrencyId: quoteCorridor.fundingCurrencyId,
    payoutCurrencyId: corridor.payoutCurrencyId,
    opportunityType: quote.opportunityType,
    corridor: masterDataFor(corridor),
  }

  if (quoteCorridor.pricingModel === 'standard') {
    const pricing = computeCorridorPricing({
      yearlyVolumeUsd: quoteCorridor.yearlyVolumeUsd,
      yearlyTransactions: quoteCorridor.yearlyTransactions,
      fixedFeeUsd: quoteCorridor.fixedFeeUsd,
      variableFeePct: quoteCorridor.variableFeePct,
      appliedFxSpread: quoteCorridor.appliedFxSpread,
      feeDiscountPct: quoteCorridor.feeDiscountPct,
      ...commonInputs,
    })
    quoteCorridor.merge({ ...pricing, computedAt: DateTime.now() })
    await quoteCorridor.save()
    await QuoteCorridorTier.query().where('quoteCorridorId', quoteCorridor.id).delete()
    return { ok: true }
  }

  // Tiered: use the given tier set, or whatever's already persisted.
  let effectiveTiers: CorridorTierInput[]
  if (tiers) {
    effectiveTiers = tiers
  } else {
    const existingTiers = await QuoteCorridorTier.query()
      .where('quoteCorridorId', quoteCorridor.id)
      .orderBy('tierNumber')
    effectiveTiers = existingTiers.map((t) => ({
      tierNumber: t.tierNumber,
      yearlyVolumeUsd: t.yearlyVolumeUsd,
      fixedFeeUsd: t.fixedFeeUsd,
      variableFeePct: t.variableFeePct,
      appliedFxSpread: t.appliedFxSpread,
    }))
  }

  const allocationErrors = validateTierAllocation(quoteCorridor.yearlyVolumeUsd, effectiveTiers)
  if (allocationErrors.length > 0) {
    return { error: allocationErrors.join(' ') }
  }

  const tiered = computeTieredCorridorPricing({
    totalYearlyVolumeUsd: quoteCorridor.yearlyVolumeUsd,
    atvUsd: quoteCorridor.atvUsd,
    standardFixedFeeUsd: quoteCorridor.fixedFeeUsd,
    standardVariableFeePct: quoteCorridor.variableFeePct,
    standardAppliedFxSpread: quoteCorridor.appliedFxSpread,
    feeDiscountPct: quoteCorridor.feeDiscountPct,
    tiers: effectiveTiers,
    ...commonInputs,
  })

  quoteCorridor.merge({
    revenueFee: tiered.revenueFee,
    fxMargin: tiered.fxMargin,
    fxMarginPct: tiered.fxMarginPct,
    marginFee: tiered.marginFee,
    marginFeePct: tiered.marginFeePct,
    totalRevenue: tiered.totalRevenue,
    totalMargin: tiered.totalMargin,
    marginPct: tiered.marginPct,
    grossMarginPct: tiered.grossMarginPct,
    takeRatePct: tiered.takeRatePct,
    needsApproval: tiered.needsApproval,
    approvalReasons: tiered.approvalReasons,
    needsFinancialApproval: tiered.needsFinancialApproval,
    financialApprovalReasons: tiered.financialApprovalReasons,
    needsNetworkApproval: tiered.needsNetworkApproval,
    networkApprovalReasons: tiered.networkApprovalReasons,
    computedAt: DateTime.now(),
  })
  await quoteCorridor.save()

  await QuoteCorridorTier.query().where('quoteCorridorId', quoteCorridor.id).delete()
  for (const tierResult of tiered.tiers) {
    await QuoteCorridorTier.create({
      quoteCorridorId: quoteCorridor.id,
      tierNumber: tierResult.tierNumber,
      yearlyVolumeUsd: effectiveTiers.find((t) => t.tierNumber === tierResult.tierNumber)!
        .yearlyVolumeUsd,
      fixedFeeUsd: effectiveTiers.find((t) => t.tierNumber === tierResult.tierNumber)!.fixedFeeUsd,
      variableFeePct: effectiveTiers.find((t) => t.tierNumber === tierResult.tierNumber)!
        .variableFeePct,
      appliedFxSpread: effectiveTiers.find((t) => t.tierNumber === tierResult.tierNumber)!
        .appliedFxSpread,
      yearlyTransactions: tierResult.yearlyTransactions,
      revenueFee: tierResult.revenueFee,
      fxMargin: tierResult.fxMargin,
      fxMarginPct: tierResult.fxMarginPct,
      marginFee: tierResult.marginFee,
      marginFeePct: tierResult.marginFeePct,
      totalRevenue: tierResult.totalRevenue,
      totalMargin: tierResult.totalMargin,
      marginPct: tierResult.marginPct,
      grossMarginPct: tierResult.grossMarginPct,
      takeRatePct: tierResult.takeRatePct,
      needsApproval: tierResult.needsApproval,
      approvalReasons: tierResult.approvalReasons,
    })
  }

  return { ok: true }
}

export default class QuoteCorridorsController {
  async store({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { quote, error } = await loadEditableQuote(params.quoteId, user)
    if (error) return response.status(error.status).send({ message: error.message })

    const payload = await request.validateUsing(createQuoteCorridorValidator)

    const alreadyAdded = await QuoteCorridor.query()
      .where('quoteId', quote!.id)
      .where('corridorId', payload.corridorId)
      .first()
    if (alreadyAdded) {
      return response.conflict({ message: 'This corridor has already been added to the quote' })
    }

    const corridor = await Corridor.findOrFail(payload.corridorId)

    const quoteCorridor = new QuoteCorridor()
    quoteCorridor.merge({
      quoteId: quote!.id,
      corridorId: payload.corridorId,
      fundingCurrencyId: payload.fundingCurrencyId ?? null,
      atvUsd: payload.atvUsd ?? 0,
      yearlyVolumeUsd: payload.yearlyVolumeUsd,
      yearlyTransactions: payload.yearlyTransactions,
      fixedFeeUsd: payload.fixedFeeUsd,
      variableFeePct: payload.variableFeePct,
      appliedFxSpread: payload.appliedFxSpread,
      feeDiscountPct: payload.feeDiscountPct ?? 0,
      pricingModel: payload.pricingModel ?? 'standard',
    })
    await quoteCorridor.save()

    const result = await priceAndSave(quoteCorridor, corridor, quote!, payload.tiers)
    if ('error' in result) {
      await quoteCorridor.delete()
      return response.unprocessableEntity({ message: result.error })
    }

    await quoteCorridor.load('tiers')
    return response.created(quoteCorridor)
  }

  async update({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { quote, error } = await loadEditableQuote(params.quoteId, user)
    if (error) return response.status(error.status).send({ message: error.message })

    const quoteCorridor = await QuoteCorridor.query()
      .where('id', params.id)
      .where('quoteId', params.quoteId)
      .first()
    if (!quoteCorridor) {
      return response.notFound({ message: 'Corridor not found on this quote' })
    }

    const payload = await request.validateUsing(updateQuoteCorridorValidator)
    const { tiers, ...corridorFields } = payload
    quoteCorridor.merge(corridorFields)

    const corridor = await Corridor.findOrFail(quoteCorridor.corridorId)

    const result = await priceAndSave(quoteCorridor, corridor, quote!, tiers)
    if ('error' in result) {
      return response.unprocessableEntity({ message: result.error })
    }

    await quoteCorridor.load('tiers')
    return response.ok(quoteCorridor)
  }

  async destroy({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { error } = await loadEditableQuote(params.quoteId, user)
    if (error) return response.status(error.status).send({ message: error.message })

    const quoteCorridor = await QuoteCorridor.query()
      .where('id', params.id)
      .where('quoteId', params.quoteId)
      .first()
    if (!quoteCorridor) {
      return response.notFound({ message: 'Corridor not found on this quote' })
    }

    await quoteCorridor.delete()
    return response.noContent()
  }
}
