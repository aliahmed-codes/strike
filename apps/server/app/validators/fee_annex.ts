import vine from '@vinejs/vine'
import { MAX_ANNEX_HTML_LENGTH } from '#services/annex_html_sanitizer'

export const saveFeeAnnexValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(255),
    content: vine.string().minLength(1).maxLength(MAX_ANNEX_HTML_LENGTH),
  })
)

export const fillFeeAnnexValidator = vine.compile(
  vine.object({
    content: vine.string().minLength(1).maxLength(MAX_ANNEX_HTML_LENGTH),
  })
)
