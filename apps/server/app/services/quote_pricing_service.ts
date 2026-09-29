import {
  computeCorridorPricing,
  computeQuoteTotals,
  computeTieredCorridorPricing,
  computeYearlyTransactions,
  validateTierAllocation,
} from '@strike/shared'
import type {
  CorridorMasterData,
  CorridorPricingInputs,
  CorridorPricingResult,
  CorridorTierInput,
  PricedCorridor,
  QuoteTotals,
  TieredCorridorPricingInputs,
  TieredCorridorPricingResult,
} from '@strike/shared'

/**
 * The backend is the only source of truth for these numbers — the client
 * never computes or submits revenue/margin/take-rate directly, it only
 * submits the raw inputs. This is a deliberate departure from the old
 * project, which computed everything in the browser (as JS floats, with no
 * backend source of truth at all) and stored the result as an opaque JSON
 * blob (see CLAUDE.md §6 / FEATURES.md item #4).
 *
 * The actual per-corridor math, and the totals-across-corridors math, both
 * live in `@strike/shared` (not duplicated here) so the frontend can show
 * the exact same live preview numbers before saving, without the two ever
 * drifting apart — see FEATURES.md Phase 1b for the formula-derivation
 * notes and what's deliberately not replicated.
 */
export {
  computeCorridorPricing,
  computeQuoteTotals,
  computeTieredCorridorPricing,
  computeYearlyTransactions,
  validateTierAllocation,
}
export type {
  CorridorMasterData,
  CorridorPricingInputs,
  CorridorPricingResult,
  CorridorTierInput,
  PricedCorridor,
  QuoteTotals,
  TieredCorridorPricingInputs,
  TieredCorridorPricingResult,
}
