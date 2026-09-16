import type { Corridor, QuoteCorridorInput } from '../types/quote.js'

/**
 * Default values for a corridor that's only being *previewed* (matched by the
 * "Corridors to Offer" filters, not yet saved) — used both to render the
 * preview row's starting numbers and to build the payload that promotes it
 * to a real `quote_corridors` row on first edit. Kept in one place so a
 * freshly-promoted row and its preview never show different numbers.
 */
export function seedQuoteCorridorFromCatalog(
  corridor: Corridor
): Omit<QuoteCorridorInput, 'corridorId'> {
  return {
    atvUsd: corridor.historicalAtv ?? 0,
    fixedFeeUsd: corridor.stdFixedFeeUsd ?? 0,
    variableFeePct: corridor.stdVariableFeePct ?? 0,
    yearlyVolumeUsd: 0,
    yearlyTransactions: 0,
    appliedFxSpread: 0,
    feeDiscountPct: 0,
    pricingModel: 'standard',
  }
}
