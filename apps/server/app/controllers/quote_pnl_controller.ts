import type { HttpContext } from '@adonisjs/core/http'
import type User from '#models/user'
import Quote from '#models/quote'
import QuotePnlInput from '#models/quote_pnl_input'
import { canAccessQuote } from '#services/quote_access_service'
import {
  computeQuotePnl,
  computePnlApprovalReasons,
  type PnlPricedCorridor,
  type PnlSetupFeeInputs,
} from '#services/quote_pnl_service'
import { updateQuotePnlValidator } from '#validators/quote_pnl'

async function loadAccessibleQuote(quoteId: number, user: User) {
  const quote = await Quote.find(quoteId)
  if (!quote) {
    return { error: { status: 404 as const, message: 'Quote not found' } }
  }
  if (!canAccessQuote(user, quote)) {
    return { error: { status: 403 as const, message: 'You do not have access to this quote' } }
  }
  return { quote }
}

/**
 * Loads exactly the membership set Step 0 (D1/D2) resolved for official
 * P&L: saved (persisted), non-deleted, positive-volume corridors only. Zero-
 * volume rows and unsaved preview edits never reach the projection.
 */
async function loadPricedCorridors(quote: Quote): Promise<PnlPricedCorridor[]> {
  await quote.load('corridors', (q) => {
    q.withScopes((s) => s.active())
    q.where('yearlyVolumeUsd', '>', 0)
    q.whereNotNull('totalRevenue')
    q.preload('corridor')
  })

  return quote.corridors.map((corridor) => ({
    yearlyVolumeUsd: Number(corridor.yearlyVolumeUsd),
    yearlyTransactions: Number(corridor.yearlyTransactions),
    revenueFee: Number(corridor.revenueFee ?? 0),
    fxMargin: Number(corridor.fxMargin ?? 0),
    marginFee: Number(corridor.marginFee ?? 0),
    totalMargin: Number(corridor.totalMargin ?? 0),
  }))
}

function hasB2BCorridor(quote: Quote): boolean {
  return quote.corridors.some((c) => c.corridor?.transactionTypeCode === 'B2B')
}

async function loadSetupFeeInputs(quote: Quote): Promise<PnlSetupFeeInputs | null> {
  const setupFee = await quote
    .related('setupFee')
    .query()
    .preload('mcfPrincipalSlots')
    .preload('mcfBlockFees')
    .first()

  if (!setupFee) return null

  return {
    quotedPrice: Number(setupFee.quotedPrice),
    mcfType: setupFee.mcfType,
    standardCommitmentFee: Number(setupFee.standardCommitmentFee),
    commitmentFeeDiscountPct: Number(setupFee.commitmentFeeDiscountPct),
    mcfPrincipalSlots: setupFee.mcfPrincipalSlots.map((slot) => ({
      startMonth: slot.startMonth,
      endMonth: slot.endMonth,
      monthlyPrincipal: Number(slot.monthlyPrincipal),
      ratePct: Number(slot.ratePct),
    })),
    mcfBlockFees: setupFee.mcfBlockFees.map((block) => ({
      blockKey: block.blockKey,
      commitmentFee: Number(block.commitmentFee),
    })),
    waivedMonths: setupFee.waivedMonths,
    contractLengthYears: quote.contractLengthYears ?? 1,
  }
}

async function buildPnlResponse(quote: Quote) {
  const corridors = await loadPricedCorridors(quote)
  const setupFee = await loadSetupFeeInputs(quote)
  const pnlInput = await QuotePnlInput.findBy('quoteId', quote.id)

  const year2GrowthPct = Number(pnlInput?.year2GrowthPct ?? 0)
  const year3GrowthPct = Number(pnlInput?.year3GrowthPct ?? 0)

  const years = computeQuotePnl({ corridors, setupFee, year2GrowthPct, year3GrowthPct })

  const approvalReasons = computePnlApprovalReasons({
    opportunityType: quote.opportunityType,
    hasB2BCorridor: hasB2BCorridor(quote),
    year1GrossMarginPct: years.year1.grossMarginPct,
    year1MarginPct: years.year1.marginPct,
    year1FxMargin: years.year1.fxMargin,
  })

  return {
    inputs: { year2GrowthPct, year3GrowthPct },
    years,
    completeness: {
      corridorCount: corridors.length,
      hasSetupFee: setupFee !== null,
    },
    needsApproval: approvalReasons.length > 0,
    approvalReasons,
  }
}

export default class QuotePnlController {
  async show({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { quote, error } = await loadAccessibleQuote(params.quoteId, user)
    if (error) return response.status(error.status).send({ message: error.message })

    return response.ok(await buildPnlResponse(quote!))
  }

  async update({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { quote, error } = await loadAccessibleQuote(params.quoteId, user)
    if (error) return response.status(error.status).send({ message: error.message })

    if (quote!.status !== 'draft') {
      return response.conflict({ message: 'Quote is not editable in its current status' })
    }

    const payload = await request.validateUsing(updateQuotePnlValidator)

    await QuotePnlInput.updateOrCreate(
      { quoteId: quote!.id },
      {
        quoteId: quote!.id,
        year2GrowthPct: payload.year2GrowthPct,
        year3GrowthPct: payload.year3GrowthPct,
      }
    )

    return response.ok(await buildPnlResponse(quote!))
  }
}
