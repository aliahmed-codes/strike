import type { Corridor, QuoteCorridorInput } from '../types/quote.js'
import { DEFAULT_ATV_USD, computeYearlyTransactions } from './corridor_pricing_math.js'
import { resolveMbpFee, type MbpAdjustmentResult } from './mbp_pricing_math.js'

/**
 * Default values for a corridor that's only being *previewed* (matched by the
 * "Corridors to Offer" filters, not yet saved) — used both to render the
 * preview row's starting numbers and to build the payload that promotes it
 * to a real `quote_corridors` row on first edit. Kept in one place so a
 * freshly-promoted row and its preview never show different numbers.
 *
 * `mbp` is the corridor's Market-Based Pricing preview (see
 * `matchingCorridors`'s `mbp` field) — when a rule matches, its fee wins
 * over the plain catalog fee, exactly like the server does when the
 * corridor is actually promoted to a real row (see
 * `quote_corridors_controller.ts`'s `resolveMbpFee` usage). Passing `null`/
 * omitting it behaves exactly as before (plain catalog default).
 */
export function seedQuoteCorridorFromCatalog(
  corridor: Corridor,
  mbp: MbpAdjustmentResult | null = null
): Omit<QuoteCorridorInput, 'corridorId'> {
  const atvUsd = corridor.historicalAtv ?? DEFAULT_ATV_USD
  const yearlyVolumeUsd = 0
  return {
    atvUsd,
    fixedFeeUsd: resolveMbpFee(mbp, corridor.stdFixedFeeUsd),
    variableFeePct: corridor.stdVariableFeePct ?? 0,
    yearlyVolumeUsd,
    yearlyTransactions: computeYearlyTransactions(yearlyVolumeUsd, atvUsd),
    appliedFxSpread: 0,
    feeDiscountPct: 0,
    pricingModel: 'standard',
    fxSourceOverride: mbp?.fxSourceOverride ?? null,
  }
}
