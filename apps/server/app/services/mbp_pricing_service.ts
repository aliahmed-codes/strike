import {
  computeMbpAdjustment,
  matchesTransactionType,
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
 * server-only seam: it fetches the handful of rule rows relevant to one
 * corridor+quote combination and calls the shared matcher, following the
 * same re-export convention as `quote_pricing_service.ts`.
 */
export { computeMbpAdjustment, matchesTransactionType }
export type { MbpAdjustmentResult, MbpMatchContext, MbpReferenceData }

/**
 * Fetches only the rule rows that could possibly apply to this one
 * combination — narrow `.where(...)` queries, not full-table scans. The
 * reference tables are tiny (a few hundred rows total across all 6), so
 * this is cheap to run on every price/save.
 */
export async function fetchMbpReferenceData(ctx: {
  countryId: number
  regionId: number | null
  icpLevel1Id: number | null
  icpLevel3Id: number | null
}): Promise<MbpReferenceData> {
  const [countryTiers, regionPressures, icpSensitivities, decisionMatrix, gridFeeAdjustments, strategicOverrides] =
    await Promise.all([
      CountryTier.query().where('countryId', ctx.countryId),
      ctx.regionId !== null ? RegionPressure.query().where('regionId', ctx.regionId) : Promise.resolve([]),
      ctx.icpLevel3Id !== null
        ? IcpSensitivity.query().where('icpNodeIdL3', ctx.icpLevel3Id)
        : Promise.resolve([]),
      // Only 9 rows ever — cheap to always fetch in full.
      DecisionMatrixEntry.all(),
      ctx.icpLevel1Id !== null
        ? GridFeeAdjustment.query().where('icpNodeIdL1', ctx.icpLevel1Id)
        : Promise.resolve([]),
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

/**
 * The full MBP lookup for one corridor on one quote — the quote supplies
 * the Sending Partner Region + ICP category, the corridor supplies its own
 * country (for tier) and transaction type. Returns `null` when nothing
 * matches (the corridor keeps its plain catalog fee/FX terms).
 *
 * `quote.partnerCountry` must already be preloaded by the caller (its own
 * `regionId` is a plain column, no nested preload needed) — this function
 * does no preloading itself, to keep it a plain, easily-testable function
 * of its inputs.
 */
export async function computeMbpForCorridor(
  corridor: Corridor,
  quote: Quote
): Promise<MbpAdjustmentResult | null> {
  const regionId = quote.partnerCountry?.regionId ?? null
  const data = await fetchMbpReferenceData({
    countryId: corridor.countryId,
    regionId,
    icpLevel1Id: quote.icpLevel1Id,
    icpLevel3Id: quote.icpLevel3Id,
  })

  return computeMbpAdjustment(
    {
      regionId,
      icpLevel1Id: quote.icpLevel1Id,
      icpLevel2Id: quote.icpLevel2Id,
      icpLevel3Id: quote.icpLevel3Id,
      countryId: corridor.countryId,
      transactionTypeCode: corridor.transactionTypeCode,
      currencyId: corridor.payoutCurrencyId,
    },
    data
  )
}
