import type { HttpContext } from '@adonisjs/core/http'
import Quote from '#models/quote'
import { canAccessQuote } from '#services/quote_access_service'
import { buildQuoteSummary } from '#services/quote_summary_service'

export default class QuoteSummaryController {
  async show({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const quote = await Quote.find(params.quoteId)

    if (!quote) {
      return response.notFound({ message: 'Quote not found' })
    }
    if (!canAccessQuote(user, quote)) {
      return response.forbidden({ message: 'You do not have access to this quote' })
    }

    return response.ok(await buildQuoteSummary(quote))
  }
}
