import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import type User from '#models/user'
import Quote from '#models/quote'
import QuoteCorridor from '#models/quote_corridor'
import QuoteCorridorTier from '#models/quote_corridor_tier'
import Corridor from '#models/corridor'
import { canAccessQuote, isQuoteEditable } from '#services/quote_access_service'
import {
  computeCorridorPricing,
  computeTieredCorridorPricing,
  computeYearlyTransactions,
  validateTierAllocation,
  type CorridorMasterData,
  type CorridorTierInput,
} from '#services/quote_pricing_service'
import { computeMbpForCorridor } from '#services/mbp_pricing_service'
import {
  bulkCorridorIdsValidator,
  createQuoteCorridorValidator,
  updateQuoteCorridorValidator,
} from '#validators/quote'

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
  // `.preload('partnerCountry')` is needed for the MBP lookup's Sending
  // Partner Region (Country.regionId is a plain column — no nested preload
  // of `region` itself required).
  const quote = await Quote.query().where('id', quoteId).preload('partnerCountry').first()
  if (!quote) {
    return { error: { status: 404 as const, message: 'Quote not found' } }
  }
  if (!canAccessQuote(user, quote)) {
    return { error: { status: 403 as const, message: 'You do not have access to this quote' } }
  }
  if (!isQuoteEditable(quote)) {
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
): Promise<{ error: string } | { ok: true; mbp: Awaited<ReturnType<typeof computeMbpForCorridor>> }> {
  // Never trusted from client input — always derived from the row's own
  // volume/ATV, matching the old app's real non-editable "Yearly
  // transactions" column.
  const yearlyTransactions = computeYearlyTransactions(
    quoteCorridor.yearlyVolumeUsd,
    quoteCorridor.atvUsd
  )
  quoteCorridor.yearlyTransactions = yearlyTransactions

  // Market-Based Pricing: while the fee hasn't been manually typed over,
  // it always follows the current MBP recommendation (or the plain catalog
  // fee, if no MBP rule matches) — recomputed on every save, so it stays
  // live if the quote's Sending Partner Region/ICP category changes later.
  // The moment a human explicitly sets it (see `update` below),
  // `fixedFeeManuallySet` flips true and it stops auto-following.
  const mbp = await computeMbpForCorridor(corridor, quote)
  if (!quoteCorridor.fixedFeeManuallySet) {
    const catalogFee = corridor.stdFixedFeeUsd ?? 0
    quoteCorridor.fixedFeeUsd =
      mbp?.fixedFeeUsdOverride ??
      (mbp?.fixedFeeAdjustmentPct != null ? catalogFee * (1 + mbp.fixedFeeAdjustmentPct / 100) : catalogFee)
  }

  const commonInputs = {
    transactionTypeCode: corridor.transactionTypeCode,
    fundingCurrencyId: quoteCorridor.fundingCurrencyId,
    payoutCurrencyId: corridor.payoutCurrencyId,
    opportunityType: quote.opportunityType,
    corridor: masterDataFor(corridor),
    fxSourceOverride: quoteCorridor.fxSourceOverride ?? mbp?.fxSourceOverride ?? null,
    treasuryFxCostSpreadOverride: quoteCorridor.treasuryFxCostSpreadOverride,
    costFixedUsdOverride: quoteCorridor.costFixedUsdOverride,
    costVariablePctOverride: quoteCorridor.costVariablePctOverride,
  }

  if (quoteCorridor.pricingModel === 'standard') {
    const pricing = computeCorridorPricing({
      yearlyVolumeUsd: quoteCorridor.yearlyVolumeUsd,
      yearlyTransactions,
      fixedFeeUsd: quoteCorridor.fixedFeeUsd,
      variableFeePct: quoteCorridor.variableFeePct,
      appliedFxSpread: quoteCorridor.appliedFxSpread,
      feeDiscountPct: quoteCorridor.feeDiscountPct,
      ...commonInputs,
    })
    quoteCorridor.merge({ ...pricing, computedAt: DateTime.now() })
    await quoteCorridor.save()
    await QuoteCorridorTier.query().where('quoteCorridorId', quoteCorridor.id).delete()
    return { ok: true, mbp }
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

  return { ok: true, mbp }
}

export default class QuoteCorridorsController {
  async store({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { quote, error } = await loadEditableQuote(params.quoteId, user)
    if (error) return response.status(error.status).send({ message: error.message })

    const payload = await request.validateUsing(createQuoteCorridorValidator)

    // Scoped by funding currency too (Phase B) — the same corridor can be
    // added once per funding currency on the quote, but not twice for the
    // *same* one. `whereNull` handles "no funding currency" as its own
    // distinct case, matching the DB's COALESCE-based unique index below.
    const alreadyAddedQuery = QuoteCorridor.query()
      .where('quoteId', quote!.id)
      .where('corridorId', payload.corridorId)
      .withScopes((s) => s.active())
    const alreadyAdded = await (
      payload.fundingCurrencyId
        ? alreadyAddedQuery.where('fundingCurrencyId', payload.fundingCurrencyId)
        : alreadyAddedQuery.whereNull('fundingCurrencyId')
    ).first()
    if (alreadyAdded) {
      return response.conflict({
        message: 'This corridor has already been added to the quote for this funding currency',
      })
    }

    const corridor = await Corridor.findOrFail(payload.corridorId)

    // A creation payload whose fixedFeeUsd already equals the plain catalog
    // fee is exactly what an MBP-unaware caller would send by default (see
    // `seedQuoteCorridorFromCatalog`) — treat that as "not manually set yet"
    // so Market-Based Pricing can supply its own default underneath it. A
    // payload that deliberately sends something else is a real manual
    // value (a human typed it, or a test fixture exercising specific
    // numbers) and must never be silently replaced.
    const catalogFee = corridor.stdFixedFeeUsd ?? 0
    const fixedFeeManuallySet = payload.fixedFeeUsd !== catalogFee

    const quoteCorridor = new QuoteCorridor()
    quoteCorridor.merge({
      quoteId: quote!.id,
      corridorId: payload.corridorId,
      fundingCurrencyId: payload.fundingCurrencyId ?? null,
      atvUsd: payload.atvUsd ?? 0,
      yearlyVolumeUsd: payload.yearlyVolumeUsd,
      yearlyTransactions: payload.yearlyTransactions,
      fixedFeeUsd: payload.fixedFeeUsd,
      fixedFeeManuallySet,
      variableFeePct: payload.variableFeePct,
      appliedFxSpread: payload.appliedFxSpread,
      feeDiscountPct: payload.feeDiscountPct ?? 0,
      pricingModel: payload.pricingModel ?? 'standard',
      fxSourceOverride: payload.fxSourceOverride ?? null,
      treasuryFxCostSpreadOverride: payload.treasuryFxCostSpreadOverride ?? null,
      costFixedUsdOverride: payload.costFixedUsdOverride ?? null,
      costVariablePctOverride: payload.costVariablePctOverride ?? null,
    })
    await quoteCorridor.save()

    const result = await priceAndSave(quoteCorridor, corridor, quote!, payload.tiers)
    if ('error' in result) {
      await quoteCorridor.delete()
      return response.unprocessableEntity({ message: result.error })
    }

    await quoteCorridor.load('tiers')
    quoteCorridor.$extras.mbp = result.mbp
    return response.created(quoteCorridor)
  }

  async update({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { quote, error } = await loadEditableQuote(params.quoteId, user)
    if (error) return response.status(error.status).send({ message: error.message })

    const quoteCorridor = await QuoteCorridor.query()
      .where('id', params.id)
      .where('quoteId', params.quoteId)
      .withScopes((s) => s.active())
      .first()
    if (!quoteCorridor) {
      return response.notFound({ message: 'Corridor not found on this quote' })
    }

    const payload = await request.validateUsing(updateQuoteCorridorValidator)
    const { tiers, ...corridorFields } = payload
    // A save that explicitly sets the Fixed Fee is a human overriding it —
    // it stops auto-following Market-Based Pricing from this point on. A
    // save that doesn't touch this field (e.g. changing the discount % only)
    // leaves the flag as-is, so an already-manual fee stays manual.
    if (payload.fixedFeeUsd !== undefined) {
      quoteCorridor.fixedFeeManuallySet = true
    }
    quoteCorridor.merge(corridorFields)

    const corridor = await Corridor.findOrFail(quoteCorridor.corridorId)

    const result = await priceAndSave(quoteCorridor, corridor, quote!, tiers)
    if ('error' in result) {
      return response.unprocessableEntity({ message: result.error })
    }

    await quoteCorridor.load('tiers')
    quoteCorridor.$extras.mbp = result.mbp
    return response.ok(quoteCorridor)
  }

  async destroy({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { error } = await loadEditableQuote(params.quoteId, user)
    if (error) return response.status(error.status).send({ message: error.message })

    const quoteCorridor = await QuoteCorridor.query()
      .where('id', params.id)
      .where('quoteId', params.quoteId)
      .withScopes((s) => s.active())
      .first()
    if (!quoteCorridor) {
      return response.notFound({ message: 'Corridor not found on this quote' })
    }

    await quoteCorridor.merge({ deletedAt: DateTime.now() }).save()
    return response.noContent()
  }

  async bulkDelete({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { quote, error } = await loadEditableQuote(params.quoteId, user)
    if (error) return response.status(error.status).send({ message: error.message })

    const { corridorIds } = await request.validateUsing(bulkCorridorIdsValidator)
    const rows = await QuoteCorridor.query()
      .where('quoteId', quote!.id)
      .whereIn('id', corridorIds)
      .withScopes((s) => s.active())

    const foundIds = new Set(rows.map((r) => r.id))
    await Promise.all(rows.map((r) => r.merge({ deletedAt: DateTime.now() }).save()))

    return response.ok({
      deletedIds: rows.map((r) => r.id),
      notFoundIds: corridorIds.filter((id) => !foundIds.has(id)),
    })
  }

  async bulkRestore({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { quote, error } = await loadEditableQuote(params.quoteId, user)
    if (error) return response.status(error.status).send({ message: error.message })

    const { corridorIds } = await request.validateUsing(bulkCorridorIdsValidator)
    const rows = await QuoteCorridor.query()
      .where('quoteId', quote!.id)
      .whereIn('id', corridorIds)
      .whereNotNull('deletedAt')

    const foundIds = new Set(rows.map((r) => r.id))
    await Promise.all(rows.map((r) => r.merge({ deletedAt: null }).save()))

    return response.ok({
      restoredIds: rows.map((r) => r.id),
      notFoundIds: corridorIds.filter((id) => !foundIds.has(id)),
    })
  }

  async listDeleted({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { quote, error } = await loadEditableQuote(params.quoteId, user)
    if (error) return response.status(error.status).send({ message: error.message })

    const rows = await QuoteCorridor.query()
      .where('quoteId', quote!.id)
      .whereNotNull('deletedAt')
      .preload('corridor', (cq) =>
        cq.preload('country', (ctq) => ctq.preload('region')).preload('payoutCurrency')
      )
      .preload('fundingCurrency')

    return response.ok(rows)
  }
}
