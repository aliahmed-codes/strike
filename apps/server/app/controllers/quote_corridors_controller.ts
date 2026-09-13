import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import type User from '#models/user'
import Quote from '#models/quote'
import QuoteCorridor from '#models/quote_corridor'
import { canAccessQuote } from '#services/quote_access_service'
import { computeCorridorPricing } from '#services/quote_pricing_service'
import { createQuoteCorridorValidator, updateQuoteCorridorValidator } from '#validators/quote'

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

    const pricing = computeCorridorPricing({
      yearlyVolumeUsd: payload.yearlyVolumeUsd,
      yearlyTransactions: payload.yearlyTransactions,
      fixedFeeUsd: payload.fixedFeeUsd,
      variableFeePct: payload.variableFeePct,
      appliedFxSpread: payload.appliedFxSpread,
      feeDiscountPct: payload.feeDiscountPct ?? 0,
    })

    const quoteCorridor = await QuoteCorridor.create({
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
      ...pricing,
      computedAt: DateTime.now(),
    })

    return response.created(quoteCorridor)
  }

  async update({ auth, params, request, response }: HttpContext) {
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

    const payload = await request.validateUsing(updateQuoteCorridorValidator)
    quoteCorridor.merge(payload)

    const pricing = computeCorridorPricing({
      yearlyVolumeUsd: quoteCorridor.yearlyVolumeUsd,
      yearlyTransactions: quoteCorridor.yearlyTransactions,
      fixedFeeUsd: quoteCorridor.fixedFeeUsd,
      variableFeePct: quoteCorridor.variableFeePct,
      appliedFxSpread: quoteCorridor.appliedFxSpread,
      feeDiscountPct: quoteCorridor.feeDiscountPct,
    })
    quoteCorridor.merge({ ...pricing, computedAt: DateTime.now() })
    await quoteCorridor.save()

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
