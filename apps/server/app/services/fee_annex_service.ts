import * as cheerio from 'cheerio'
import db from '@adonisjs/lucid/services/db'
import type { QuoteLegalData } from '@strike/shared'
import Quote from '#models/quote'
import QuoteFeeAnnexVersion from '#models/quote_fee_annex_version'
import { canonicalAnnexHtml } from '#services/annex_fill_service'

/** `<Partner>_<PR>_<YYYYMMDD>_Fee_Annex`, the old app's default annex name. */
export function suggestedAnnexName(
  data: Pick<QuoteLegalData, 'quoteName' | 'prCode'>,
  today: Date = new Date()
): string {
  const partner = data.quoteName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_') || 'Partner'
  const pr = data.prCode?.trim() || 'PR'
  const date = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(
    today.getDate()
  ).padStart(2, '0')}`
  return `${partner}_${pr}_${date}_Fee_Annex`
}

/** A document with no text, image or table is empty, however much markup remains. */
export function isAnnexEmpty(html: string): boolean {
  const $ = cheerio.load(html, {}, false)
  return $.root().text().trim() === '' && $('img, table, hr').length === 0
}

export async function latestAnnexVersion(quoteId: number) {
  return QuoteFeeAnnexVersion.query()
    .where('quote_id', quoteId)
    .preload('modifiedBy')
    .orderBy('version', 'desc')
    .first()
}

export function serializeAnnexVersion(version: QuoteFeeAnnexVersion, withContent = true) {
  return {
    version: version.version,
    name: version.name,
    ...(withContent ? { content: version.content } : {}),
    // A name, never an email: any viewer of the quote can read this.
    modifiedByName: version.modifiedBy
      ? `${version.modifiedBy.firstName} ${version.modifiedBy.lastName}`
      : null,
    createdAt: version.createdAt.toISO(),
  }
}

/**
 * Saves the annex as the next numbered version. The quote row is locked for the
 * duration, so two saves at once get consecutive numbers instead of one failing
 * on the unique (quote, version) constraint. Identical name and content is not a
 * new version.
 */
export async function saveAnnexVersion(
  quote: Quote,
  userId: number,
  name: string,
  content: string
): Promise<{ version: QuoteFeeAnnexVersion; changed: boolean }> {
  const trx = await db.transaction()
  try {
    await Quote.query({ client: trx }).where('id', quote.id).forUpdate().first()
    const latest = await QuoteFeeAnnexVersion.query({ client: trx })
      .where('quote_id', quote.id)
      .orderBy('version', 'desc')
      .first()

    if (
      latest &&
      latest.name === name &&
      canonicalAnnexHtml(latest.content) === canonicalAnnexHtml(content)
    ) {
      await trx.commit()
      return { version: latest, changed: false }
    }

    const created = await QuoteFeeAnnexVersion.create(
      {
        quoteId: quote.id,
        version: (latest?.version ?? 0) + 1,
        name,
        content,
        modifiedByUserId: userId,
      },
      { client: trx }
    )
    await trx.commit()
    return { version: created, changed: true }
  } catch (error) {
    await trx.rollback()
    throw error
  }
}
