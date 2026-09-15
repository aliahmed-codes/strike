import type { HttpContext } from '@adonisjs/core/http'
import Quote from '#models/quote'
import { canAccessQuote } from '#services/quote_access_service'
import { computeQuoteTotals } from '#services/quote_pricing_service'
import { createQuoteValidator, updateQuoteValidator } from '#validators/quote'

type QuotePivotFields = {
  useCaseIds?: number[]
  fundingCurrencyIds?: number[]
  sourceCurrencyIds?: number[]
}

/** Splits pivot-table sets (many-to-many) off from the plain columns on the payload. */
function splitPivotFields<T extends QuotePivotFields>(payload: T) {
  const { useCaseIds, fundingCurrencyIds, sourceCurrencyIds, ...columns } = payload
  return { columns, pivots: { useCaseIds, fundingCurrencyIds, sourceCurrencyIds } }
}

async function syncPivots(quote: Quote, pivots: QuotePivotFields) {
  if (pivots.useCaseIds) await quote.related('useCases').sync(pivots.useCaseIds)
  if (pivots.fundingCurrencyIds) {
    await quote.related('fundingCurrencies').sync(pivots.fundingCurrencyIds)
  }
  if (pivots.sourceCurrencyIds) {
    await quote.related('sourceCurrencies').sync(pivots.sourceCurrencyIds)
  }
}

export default class QuotesController {
  async index({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()

    const query = Quote.query()
      .withCount('corridors', (q) => q.as('corridorCount'))
      .orderBy('updatedAt', 'desc')

    if (user.role !== 'admin') {
      query.where('ownerId', user.id)
    }

    const quotes = await query
    return response.ok(quotes)
  }

  async store({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(createQuoteValidator)
    const { columns, pivots } = splitPivotFields(payload)

    const quote = await Quote.create({ ...columns, ownerId: user.id, status: 'draft' })
    await syncPivots(quote, pivots)

    await quote.load('useCases')
    await quote.load('fundingCurrencies')
    await quote.load('sourceCurrencies')

    return response.created(quote)
  }

  async show({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const quote = await Quote.find(params.id)

    if (!quote) {
      return response.notFound({ message: 'Quote not found' })
    }
    if (!canAccessQuote(user, quote)) {
      return response.forbidden({ message: 'You do not have access to this quote' })
    }

    await quote.load('owner')
    await quote.load('partnerCountry')
    await quote.load('useCases')
    await quote.load('integrationType')
    await quote.load('icpLevel1')
    await quote.load('icpLevel2')
    await quote.load('icpLevel3')
    await quote.load('fundingCurrency')
    await quote.load('fundingCurrencies')
    await quote.load('sourceCurrency')
    await quote.load('sourceCurrencies')
    await quote.load('defaultFeeCurrency')
    await quote.load('corridors', (q) => {
      q.preload('corridor', (cq) => cq.preload('country').preload('payoutCurrency'))
      q.preload('fundingCurrency')
      q.preload('tiers', (tq) => tq.orderBy('tierNumber'))
    })

    return response.ok({
      quote: quote.serialize(),
      totals: computeQuoteTotals(quote.corridors),
    })
  }

  async update({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const quote = await Quote.find(params.id)

    if (!quote) {
      return response.notFound({ message: 'Quote not found' })
    }
    if (!canAccessQuote(user, quote)) {
      return response.forbidden({ message: 'You do not have access to this quote' })
    }
    if (quote.status !== 'draft') {
      return response.conflict({ message: 'Quote is not editable in its current status' })
    }

    const payload = await request.validateUsing(updateQuoteValidator)
    const { columns, pivots } = splitPivotFields(payload)

    quote.merge(columns)
    await quote.save()
    await syncPivots(quote, pivots)

    await quote.load('useCases')
    await quote.load('fundingCurrencies')
    await quote.load('sourceCurrencies')

    return response.ok(quote)
  }

  async destroy({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const quote = await Quote.find(params.id)

    if (!quote) {
      return response.notFound({ message: 'Quote not found' })
    }
    if (!canAccessQuote(user, quote)) {
      return response.forbidden({ message: 'You do not have access to this quote' })
    }
    if (quote.status !== 'draft') {
      return response.conflict({ message: 'Quote is not editable in its current status' })
    }

    await quote.delete()
    return response.noContent()
  }
}
