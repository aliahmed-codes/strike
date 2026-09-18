import type { HttpContext } from '@adonisjs/core/http'
import type User from '#models/user'
import Quote from '#models/quote'
import QuotePnlInput from '#models/quote_pnl_input'
import { canAccessQuote } from '#services/quote_access_service'
import { buildPnlResponse } from '#services/quote_pnl_service'
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
