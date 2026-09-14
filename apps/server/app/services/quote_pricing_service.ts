import { computeCorridorPricing } from '@strike/shared'
import type {
  CorridorMasterData,
  CorridorPricingInputs,
  CorridorPricingResult,
} from '@strike/shared'

/**
 * The backend is the only source of truth for these numbers — the client
 * never computes or submits revenue/margin/take-rate directly, it only
 * submits the raw inputs. This is a deliberate departure from the old
 * project, which computed everything in the browser (as JS floats, with no
 * backend source of truth at all) and stored the result as an opaque JSON
 * blob (see CLAUDE.md §6 / FEATURES.md item #4).
 *
 * The actual per-corridor math lives in `@strike/shared` (not duplicated
 * here) so the frontend can show the exact same live preview numbers before
 * saving, without the two ever drifting apart — see FEATURES.md Phase 1b
 * for the formula-derivation notes and what's deliberately not replicated.
 */
export { computeCorridorPricing }
export type { CorridorMasterData, CorridorPricingInputs, CorridorPricingResult }

/** Only the fields computeQuoteTotals actually needs — decoupled from the Lucid model so it's trivial to unit test. */
export interface PricedCorridor {
  totalRevenue: number | null
  totalMargin: number | null
  yearlyVolumeUsd: number
  yearlyTransactions: number
  needsApproval: boolean
}

export interface QuoteTotals {
  totalRevenue: number
  totalMargin: number
  totalVolumeUsd: number
  totalTransactions: number
  averageTakeRatePct: number
  weightedGrossMarginPct: number
  corridorCount: number
  corridorsNeedingApproval: number
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export function computeQuoteTotals(corridors: PricedCorridor[]): QuoteTotals {
  const priced = corridors.filter((c) => c.totalRevenue !== null)

  const totalRevenue = priced.reduce((sum, c) => sum + Number(c.totalRevenue), 0)
  const totalMargin = priced.reduce((sum, c) => sum + Number(c.totalMargin), 0)
  const totalVolumeUsd = priced.reduce((sum, c) => sum + Number(c.yearlyVolumeUsd), 0)
  const totalTransactions = priced.reduce((sum, c) => sum + Number(c.yearlyTransactions), 0)

  const averageTakeRatePct = totalVolumeUsd > 0 ? (totalRevenue / totalVolumeUsd) * 100 : 0
  const weightedGrossMarginPct = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0

  return {
    totalRevenue: round(totalRevenue, 2),
    totalMargin: round(totalMargin, 2),
    totalVolumeUsd: round(totalVolumeUsd, 2),
    totalTransactions,
    averageTakeRatePct: round(averageTakeRatePct, 4),
    weightedGrossMarginPct: round(weightedGrossMarginPct, 4),
    corridorCount: corridors.length,
    corridorsNeedingApproval: corridors.filter((c) => c.needsApproval).length,
  }
}
