import {
  computeMbpAdjustment,
  isFixedFeeManuallySet,
  matchesTransactionType,
  resolveMbpFee,
  type MbpAdjustmentResult,
  type MbpMatchContext,
  type MbpReferenceData,
} from '@strike/shared'
import Corridor from '#models/corridor'
import Quote from '#models/quote'
import CountryTier from '#models/country_tier'
import RegionPressure from '#models/region_pressure'
import IcpSensitivity from '#models/icp_sensitivity'
import DecisionMatrixEntry from '#models/decision_matrix_entry'
import GridFeeAdjustment from '#models/grid_fee_adjustment'
import StrategicOverride from '#models/strategic_override'

/**
 * The Market-Based Pricing (MBP) matching logic itself lives in
 * `@strike/shared` (pure, no database access — see FEATURES.md/Phase notes
 * and docs/old-app-reference for the investigation). This file is the
 * server-only seam: it fetches the rule rows and calls the shared matcher,
 * following the same re-export convention as `quote_pricing_service.ts`.
 */
export { computeMbpAdjustment, isFixedFeeManuallySet, matchesTransactionType, resolveMbpFee }
export type { MbpAdjustmentResult, MbpMatchContext, MbpReferenceData }

/**
 * Loads every row of all 6 MBP reference tables, unfiltered — they're tiny
 * (~370 rows total combined), so this is cheap to run once per request and
 * reuse across every corridor being priced/previewed in that request,
 * rather than re-querying per corridor (see `computeMbpForCorridors`).
 */
export async function fetchAllMbpReferenceData(): Promise<MbpReferenceData> {
  const [countryTiers, regionPressures, icpSensitivities, decisionMatrix, gridFeeAdjustments, strategicOverrides] =
    await Promise.all([
      CountryTier.all(),
      RegionPressure.all(),
      IcpSensitivity.all(),
      DecisionMatrixEntry.all(),
      GridFeeAdjustment.all(),
      StrategicOverride.query().where('isActive', true),
    ])

  return {
    countryTiers: countryTiers.map((t) => ({ countryId: t.countryId, tier: t.tier })),
    regionPressures: regionPressures.map((rp) => ({
      regionId: rp.regionId,
      transactionType: rp.transactionType,
      pressureLevel: rp.pressureLevel,
    })),
    icpSensitivities: icpSensitivities.map((s) => ({
      icpNodeIdL3: s.icpNodeIdL3,
      transactionType: s.transactionType,
      sensitivity: s.sensitivity,
    })),
    decisionMatrix: decisionMatrix.map((d) => ({
      id: d.id,
      icpSensitivity: d.icpSensitivity,
      regionPressure: d.regionPressure,
      pricingDecision: d.pricingDecision,
      feeAdjustmentPercent: d.feeAdjustmentPercent,
      fxSpreadAdjustmentBps: d.fxSpreadAdjustmentBps,
    })),
    gridFeeAdjustments: gridFeeAdjustments.map((g) => ({
      id: g.id,
      regionPressure: g.regionPressure,
      corridorTier: g.corridorTier,
      icpNodeIdL1: g.icpNodeIdL1,
      transactionType: g.transactionType,
      fixedFeeUsd: g.fixedFeeUsd,
      fxSpreadAdjustmentBps: g.fxSpreadAdjustmentBps,
      minimumFxSpreadAdjustmentBps: g.minimumFxSpreadAdjustmentBps,
    })),
    strategicOverrides: strategicOverrides.map((o) => ({
      id: o.id,
      countryId: o.countryId,
      currencyId: o.currencyId,
      regionId: o.regionId,
      transactionType: o.transactionType,
      icpNodeIdL1: o.icpNodeIdL1,
      icpNodeIdL2: o.icpNodeIdL2,
      icpNodeIdL3: o.icpNodeIdL3,
      overrideMode: o.overrideMode,
      feeAdjustmentPercent: o.feeAdjustmentPercent,
      fxSpreadAdjustmentBps: o.fxSpreadAdjustmentBps,
      fixedFeeUsd: o.fixedFeeUsd,
      fxSpread: o.fxSpread,
      minimumFxSpread: o.minimumFxSpread,
      reason: o.reason,
      priority: o.priority,
      isActive: o.isActive,
      effectiveFrom: o.effectiveFrom ? o.effectiveFrom.toJSDate() : null,
      effectiveTo: o.effectiveTo ? o.effectiveTo.toJSDate() : null,
    })),
  }
}

/** A quote's Sending Partner Region + ICP category — the quote-level half of an MBP match context, shared by every corridor on that quote. */
function quoteMbpContext(quote: Quote) {
  return {
    regionId: quote.partnerCountry?.regionId ?? null,
    icpLevel1Id: quote.icpLevel1Id,
    icpLevel2Id: quote.icpLevel2Id,
    icpLevel3Id: quote.icpLevel3Id,
  }
}

/**
 * The full MBP lookup for one corridor on one quote. Returns `null` when
 * nothing matches (the corridor keeps its plain catalog fee/FX terms).
 *
 * `quote.partnerCountry` must already be preloaded by the caller (its own
 * `regionId` is a plain column, no nested preload needed).
 */
export function computeMbpForCorridor(
  corridor: Corridor,
  quote: Quote,
  data: MbpReferenceData
): MbpAdjustmentResult | null {
  const { regionId, icpLevel1Id, icpLevel2Id, icpLevel3Id } = quoteMbpContext(quote)
  return computeMbpAdjustment(
    {
      regionId,
      icpLevel1Id,
      icpLevel2Id,
      icpLevel3Id,
      countryId: corridor.countryId,
      transactionTypeCode: corridor.transactionTypeCode,
      currencyId: corridor.payoutCurrencyId,
    },
    data
  )
}

/** Same lookup, for every corridor in a list at once, reusing one already-fetched `MbpReferenceData` — see `fetchAllMbpReferenceData`. */
export function computeMbpForCorridors(
  corridors: Corridor[],
  quote: Quote,
  data: MbpReferenceData
): Map<number, MbpAdjustmentResult | null> {
  const result = new Map<number, MbpAdjustmentResult | null>()
  for (const corridor of corridors) {
    result.set(corridor.id, computeMbpForCorridor(corridor, quote, data))
  }
  return result
}
