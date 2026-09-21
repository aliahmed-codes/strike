import type { HttpContext } from '@adonisjs/core/http'
import Quote from '#models/quote'
import { canAccessQuote } from '#services/quote_access_service'
import { attachmentHeader } from '#services/attachment_header'
import { buildLegalData } from '#services/quote_legal_service'
import {
  buildLegalContractWorkbook,
  legalContractFileName,
} from '#services/legal_contract_workbook_service'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

async function loadAccessibleQuote(quoteId: number, userCanAccess: (quote: Quote) => boolean) {
  const quote = await Quote.find(quoteId)
  if (!quote) return { error: { status: 404 as const, message: 'Quote not found' } }
  if (!userCanAccess(quote)) {
    return { error: { status: 403 as const, message: 'You do not have access to this quote' } }
  }
  return { quote }
}

export default class QuoteLegalController {
  async show({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { quote, error } = await loadAccessibleQuote(params.quoteId, (q) =>
      canAccessQuote(user, q)
    )
    if (error) return response.status(error.status).send({ message: error.message })

    return response.ok(await buildLegalData(quote!))
  }

  async downloadContract({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { quote, error } = await loadAccessibleQuote(params.quoteId, (q) =>
      canAccessQuote(user, q)
    )
    if (error) return response.status(error.status).send({ message: error.message })

    const data = await buildLegalData(quote!)
    if (data.blockers.length > 0) {
      return response.unprocessableEntity({
        message: "This legal contract can't be generated yet.",
        blockers: data.blockers,
      })
    }

    const fileName = legalContractFileName(data)
    response.header('Content-Type', XLSX_MIME)
    response.header('Content-Disposition', attachmentHeader(fileName))
    return response.send(await buildLegalContractWorkbook(data))
  }
}
