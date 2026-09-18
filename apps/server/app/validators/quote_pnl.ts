import vine from '@vinejs/vine'
import { PNL_GROWTH_PCT_LIMITS } from '@strike/shared'

export const updateQuotePnlValidator = vine.compile(
  vine.object({
    year2GrowthPct: vine.number().min(PNL_GROWTH_PCT_LIMITS.min).max(PNL_GROWTH_PCT_LIMITS.max),
    year3GrowthPct: vine.number().min(PNL_GROWTH_PCT_LIMITS.min).max(PNL_GROWTH_PCT_LIMITS.max),
  })
)
