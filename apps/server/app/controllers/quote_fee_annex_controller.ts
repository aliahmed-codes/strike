import { readFile } from 'node:fs/promises'
import type { HttpContext } from '@adonisjs/core/http'
import mammoth from 'mammoth'
import logger from '@adonisjs/core/services/logger'
import Quote from '#models/quote'
import QuoteFeeAnnexVersion from '#models/quote_fee_annex_version'
import { canAccessQuote } from '#services/quote_access_service'
import { buildLegalData } from '#services/quote_legal_service'
import { AnnexPdfUnavailableError, buildAnnexPdf } from '#services/annex_pdf_service'
import { buildAnnexDocx } from '#services/annex_docx_service'
import { attachmentHeader } from '#services/attachment_header'
import { fillAnnexHtml, isAnnexStale } from '#services/annex_fill_service'
import { sanitizeAnnexHtml, sanitizeAnnexName } from '#services/annex_html_sanitizer'
import {
  isAnnexEmpty,
  latestAnnexVersion,
  saveAnnexVersion,
  serializeAnnexVersion,
  suggestedAnnexName,
} from '#services/fee_annex_service'
import { fillFeeAnnexValidator, saveFeeAnnexValidator } from '#validators/fee_annex'

async function loadAccessibleQuote(quoteId: number, userCanAccess: (quote: Quote) => boolean) {
  const quote = await Quote.find(quoteId)
  if (!quote) return { error: { status: 404 as const, message: 'Quote not found' } }
  if (!userCanAccess(quote)) {
    return { error: { status: 403 as const, message: 'You do not have access to this quote' } }
  }
  return { quote }
}

const PDF_MIME = 'application/pdf'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Fee_Annex_<quote name>_STRIKE_<id>.<ext>, with only header-safe characters kept. */
export function annexFileName(
  quote: Pick<Quote, 'id' | 'name'>,
  extension: 'pdf' | 'docx'
): string {
  const base = quote.name.replace(/\s+/g, '').replace(/[^A-Za-z0-9._-]/g, '') || `Quote_${quote.id}`
  return `Fee_Annex_${base}_STRIKE_${quote.id}.${extension}`
}

const fieldError = (field: string, message: string) => ({ errors: [{ field, message }] })

/**
 * Fee Annex endpoints. Reading and editing follow quote access (owner or admin)
 * and, like the old app, are allowed at any quote status so an approved quote's
 * annex can still be corrected.
 */
export default class QuoteFeeAnnexController {
  async show({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { quote, error } = await loadAccessibleQuote(params.quoteId, (q) =>
      canAccessQuote(user, q)
    )
    if (error) return response.status(error.status).send({ message: error.message })

    const data = await buildLegalData(quote!)
    const latest = await latestAnnexVersion(quote!.id)
    return response.ok({
      annex: latest
        ? { ...serializeAnnexVersion(latest), isStale: isAnnexStale(latest.content, data) }
        : null,
      suggestedName: suggestedAnnexName(data),
      hasSetupFee: data.oneOffFee !== null,
    })
  }

  async versions({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { quote, error } = await loadAccessibleQuote(params.quoteId, (q) =>
      canAccessQuote(user, q)
    )
    if (error) return response.status(error.status).send({ message: error.message })

    const versions = await QuoteFeeAnnexVersion.query()
      .where('quote_id', quote!.id)
      .preload('modifiedBy')
      .orderBy('version', 'desc')
    return response.ok({ versions: versions.map((v) => serializeAnnexVersion(v, false)) })
  }

  async save({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { quote, error } = await loadAccessibleQuote(params.quoteId, (q) =>
      canAccessQuote(user, q)
    )
    if (error) return response.status(error.status).send({ message: error.message })

    // Validation and sanitizing only after the access check, so nobody can make
    // the server parse a large document for a quote they cannot see.
    const payload = await request.validateUsing(saveFeeAnnexValidator)
    const name = sanitizeAnnexName(payload.name)
    if (name === '') {
      return response.unprocessableEntity(fieldError('name', 'Give the annex a name.'))
    }
    const content = sanitizeAnnexHtml(payload.content)
    if (isAnnexEmpty(content)) {
      return response.unprocessableEntity(
        fieldError('content', 'The annex has no content to save.')
      )
    }

    const { version, changed } = await saveAnnexVersion(quote!, user.id, name, content)
    await version.load('modifiedBy')
    const data = await buildLegalData(quote!)
    return response.ok({
      annex: { ...serializeAnnexVersion(version), isStale: isAnnexStale(version.content, data) },
      changed,
    })
  }

  /** Fills a document from the quote's current data without saving it (used to refresh an open annex). */
  async fill({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { quote, error } = await loadAccessibleQuote(params.quoteId, (q) =>
      canAccessQuote(user, q)
    )
    if (error) return response.status(error.status).send({ message: error.message })

    const payload = await request.validateUsing(fillFeeAnnexValidator)
    const data = await buildLegalData(quote!)
    const result = fillAnnexHtml(sanitizeAnnexHtml(payload.content), data)
    return response.ok({ content: sanitizeAnnexHtml(result.html), warnings: result.warnings })
  }

  /** Converts an uploaded .docx/.html template, sanitizes and fills it; nothing is saved until the user saves. */
  async importFile({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { quote, error } = await loadAccessibleQuote(params.quoteId, (q) =>
      canAccessQuote(user, q)
    )
    if (error) return response.status(error.status).send({ message: error.message })

    const file = request.file('file', { size: '15mb' })
    if (!file) {
      return response.unprocessableEntity(fieldError('file', 'Choose a .docx or .html file.'))
    }
    if (!file.isValid) {
      return response.unprocessableEntity(
        fieldError('file', file.errors[0]?.message ?? 'That file could not be used.')
      )
    }
    // Checked on the name the user gave (case-insensitively); the content is
    // validated by actually converting it below.
    const extension = file.clientName.split('.').pop()?.toLowerCase() ?? ''
    if (!['docx', 'html', 'htm'].includes(extension)) {
      return response.unprocessableEntity(
        fieldError(
          'file',
          'Only .docx or .html files are supported. PDF files cannot be uploaded here.'
        )
      )
    }

    const buffer = await readFile(file.tmpPath!)
    let rawHtml: string
    if (extension === 'docx') {
      try {
        const converted = await mammoth.convertToHtml({ buffer })
        rawHtml = converted.value
      } catch {
        return response.unprocessableEntity(
          fieldError('file', "That Word file couldn't be read. Save it again as a .docx and retry.")
        )
      }
    } else {
      rawHtml = buffer.toString('utf8')
    }

    const clean = sanitizeAnnexHtml(rawHtml)
    if (isAnnexEmpty(clean)) {
      return response.unprocessableEntity(fieldError('file', 'That file has no content.'))
    }

    const data = await buildLegalData(quote!)
    const result = fillAnnexHtml(clean, data)
    return response.ok({
      content: sanitizeAnnexHtml(result.html),
      warnings: result.warnings,
      fileName: file.clientName,
    })
  }

  async downloadPdf({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { quote, error } = await loadAccessibleQuote(params.quoteId, (q) =>
      canAccessQuote(user, q)
    )
    if (error) return response.status(error.status).send({ message: error.message })

    const latest = await latestAnnexVersion(quote!.id)
    if (!latest) return response.notFound({ message: 'Save a Fee Annex first.' })

    try {
      const pdf = await buildAnnexPdf(latest.content, {
        name: latest.name,
        isApproved: quote!.status === 'approved',
      })
      response.header('Content-Type', PDF_MIME)
      response.header('Content-Disposition', attachmentHeader(annexFileName(quote!, 'pdf')))
      return response.send(pdf)
    } catch (renderError) {
      if (renderError instanceof AnnexPdfUnavailableError) {
        return response.serviceUnavailable({ message: renderError.message })
      }
      logger.error({ err: renderError, quoteId: quote!.id }, 'Fee Annex PDF rendering failed')
      return response.internalServerError({
        message: 'The PDF could not be generated. Please try again.',
      })
    }
  }

  async downloadDocx({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { quote, error } = await loadAccessibleQuote(params.quoteId, (q) =>
      canAccessQuote(user, q)
    )
    if (error) return response.status(error.status).send({ message: error.message })

    const latest = await latestAnnexVersion(quote!.id)
    if (!latest) return response.notFound({ message: 'Save a Fee Annex first.' })

    const docx = await buildAnnexDocx(latest.content, {
      name: latest.name,
      isApproved: quote!.status === 'approved',
    })
    response.header('Content-Type', DOCX_MIME)
    response.header('Content-Disposition', attachmentHeader(annexFileName(quote!, 'docx')))
    return response.send(docx)
  }
}
