import type { HttpContext } from '@adonisjs/core/http'
import Quote from '#models/quote'
import { canAccessQuote } from '#services/quote_access_service'
import { computeQuoteTotals } from '#services/quote_pricing_service'
import { createQuoteValidator, updateQuoteValidator } from '#validators/quote'

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

    const quote = await Quote.create({ ...payload, ownerId: user.id, status: 'draft' })

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
    await quote.load('useCase')
    await quote.load('integrationType')
    await quote.load('icpNode')
    await quote.load('fundingCurrency')
    await quote.load('sourceCurrency')
    await quote.load('corridors', (q) => {
      q.preload('corridor', (cq) => cq.preload('country').preload('payoutCurrency'))
      q.preload('fundingCurrency')
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
    quote.merge(payload)
    await quote.save()

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
