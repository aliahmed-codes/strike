/** Only the fields the Quoting Summary's region rollup needs — decoupled from the Lucid model so it's trivial to unit test. */
export interface QuoteSummaryCorridor {
  regionId: number | null
  regionName: string | null
  countryId: number | null
  fundingCurrencyId: number | null
  payoutCurrencyId: number
  fixedFeeUsd: number
  appliedFxSpread: number
  yearlyVolumeUsd: number
  totalRevenue: number
}

export interface RegionSummaryRow {
  regionId: number | null
  regionName: string | null
  countryCount: number
  corridorCount: number
  averageFeeUsd: number
  averageFxSpreadPct: number
  expectedVolumeUsd: number
  projectedRevenueUsd: number
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function summarizeGroup(
  regionId: number | null,
  regionName: string | null,
  corridors: QuoteSummaryCorridor[]
): RegionSummaryRow {
  const countryCount = new Set(corridors.map((c) => c.countryId)).size
  const corridorCount = corridors.length
  const feeSum = corridors.reduce((sum, c) => sum + c.fixedFeeUsd, 0)
  const spreadSum = corridors.reduce((sum, c) => sum + c.appliedFxSpread, 0)
  const expectedVolumeUsd = corridors.reduce((sum, c) => sum + c.yearlyVolumeUsd, 0)
  const projectedRevenueUsd = corridors.reduce((sum, c) => sum + c.totalRevenue, 0)

  return {
    regionId,
    regionName,
    countryCount,
    corridorCount,
    averageFeeUsd: corridorCount > 0 ? round(feeSum / corridorCount, 2) : 0,
    averageFxSpreadPct: corridorCount > 0 ? round(spreadSum / corridorCount, 4) : 0,
    expectedVolumeUsd: round(expectedVolumeUsd, 2),
    projectedRevenueUsd: round(projectedRevenueUsd, 2),
  }
}

/**
 * Groups saved, priced corridors by region for the Quoting Summary tab.
 * Averages use each corridor's own quoted fixedFeeUsd/appliedFxSpread —
 * never a catalog/minimum fallback chain — so a legitimate 0 is averaged
 * as 0, not masked (old app's real bug, see
 * docs/old-app-reference/remaining-quote-tabs.md section 4.3).
 */
export function buildCorridorRegionSummary(corridors: QuoteSummaryCorridor[]): {
  rows: RegionSummaryRow[]
  totals: RegionSummaryRow
} {
  const groups = new Map<number | string, { regionId: number | null; regionName: string | null; corridors: QuoteSummaryCorridor[] }>()

  for (const corridor of corridors) {
    const key = corridor.regionId ?? 'unknown'
    const group = groups.get(key)
    if (group) {
      group.corridors.push(corridor)
    } else {
      groups.set(key, {
        regionId: corridor.regionId,
        regionName: corridor.regionName,
        corridors: [corridor],
      })
    }
  }

  const rows = Array.from(groups.values()).map((group) =>
    summarizeGroup(group.regionId, group.regionName, group.corridors)
  )

  const totals = summarizeGroup(null, null, corridors)

  return { rows, totals }
}

/** Distinct funding/payout currency pairs across saved corridors, matching old app's per-pair row definition. */
export function countUniqueCurrencyPairs(
  corridors: Array<{ fundingCurrencyId: number | null; payoutCurrencyId: number }>
): number {
  const pairs = new Set(corridors.map((c) => `${c.fundingCurrencyId}-${c.payoutCurrencyId}`))
  return pairs.size
}
