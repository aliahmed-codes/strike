import {
  buildCorridorRegionSummary,
  computeSetupFeeTotals,
  countUniqueCurrencyPairs,
  type QuoteSummaryCorridor,
} from '@strike/shared'
import type Quote from '#models/quote'
import { buildPnlResponse, loadSetupFeeInputs } from '#services/quote_pnl_service'

/**
 * Loads the same D1/D2 membership set P&L uses (saved, non-deleted,
 * positive-volume corridors) plus the region/currency fields the summary's
 * rollup needs. One membership rule shared across P&L and Quoting Summary —
 * see docs/old-app-reference/remaining-quote-tabs.md section 4.2/7 (D1/D2).
 */
async function loadSummaryCorridors(quote: Quote): Promise<QuoteSummaryCorridor[]> {
  await quote.load('corridors', (q) => {
    q.withScopes((s) => s.active())
    q.where('yearlyVolumeUsd', '>', 0)
    q.whereNotNull('totalRevenue')
    q.preload('corridor', (cq) => cq.preload('country', (ctq) => ctq.preload('region')))
  })

  return quote.corridors.map((corridor) => ({
    regionId: corridor.corridor.country.regionId,
    regionName: corridor.corridor.country.region.name,
    countryId: corridor.corridor.countryId,
    fundingCurrencyId: corridor.fundingCurrencyId,
    payoutCurrencyId: corridor.corridor.payoutCurrencyId,
    fixedFeeUsd: Number(corridor.fixedFeeUsd),
    appliedFxSpread: Number(corridor.appliedFxSpread),
    yearlyVolumeUsd: Number(corridor.yearlyVolumeUsd),
    totalRevenue: Number(corridor.totalRevenue),
  }))
}

export async function buildQuoteSummary(quote: Quote) {
  await quote.load('owner')
  await quote.load('partnerCountry', (q) => q.preload('region'))

  const summaryCorridors = await loadSummaryCorridors(quote)
  const { rows: corridorsByRegion, totals: corridorsByRegionTotals } =
    buildCorridorRegionSummary(summaryCorridors)
  const uniqueCurrencyPairCount = countUniqueCurrencyPairs(summaryCorridors)

  const financialProjections = await buildPnlResponse(quote)
  const setupFeeInputs = await loadSetupFeeInputs(quote)

  const setupFee = await quote.related('setupFee').query().preload('paymentMilestones').first()

  const setupFeeTotals = setupFeeInputs ? computeSetupFeeTotals(setupFeeInputs) : null

  return {
    partner: {
      name: quote.name,
      regionName: quote.partnerCountry?.region.name ?? null,
      countryName: quote.partnerCountry?.name ?? null,
      partnerType: quote.opportunityType,
      ownerName: `${quote.owner.firstName} ${quote.owner.lastName}`,
      prCode: quote.partnerPrCode,
    },
    contract: {
      contractLengthYears: quote.contractLengthYears,
      uniqueCurrencyPairCount,
      totalCorridorRowCount: summaryCorridors.length,
      monthlyCommitmentFee: setupFeeTotals?.finalCommitmentFee ?? null,
      waivedMonths: setupFee?.waivedMonths ?? null,
      totalContractValue: setupFeeTotals?.totalContractValue ?? null,
    },
    setupFee: setupFee
      ? {
          feeType: setupFee.feeType,
          quotedPrice: Number(setupFee.quotedPrice),
          totalContractValue: setupFeeTotals!.totalContractValue,
          year1CommittedRevenue: setupFeeTotals!.year1CommittedRevenue,
          finalCommitmentFee: setupFeeTotals!.finalCommitmentFee,
          paymentSchedule: setupFee.paymentSchedule,
          paymentMilestones: setupFee.paymentMilestones.map((milestone) => ({
            milestone: milestone.milestone,
            percentage: Number(milestone.percentage),
            description: milestone.description,
          })),
        }
      : {
          feeType: null,
          quotedPrice: null,
          totalContractValue: null,
          year1CommittedRevenue: null,
          finalCommitmentFee: null,
          paymentSchedule: null,
          paymentMilestones: [],
        },
    financialProjections,
    corridorsByRegion,
    corridorsByRegionTotals,
    completeness: {
      corridorCount: summaryCorridors.length,
      hasSetupFee: setupFee !== null,
      partnerRegionMissing: quote.partnerCountry?.region.name === undefined,
      partnerCountryMissing: quote.partnerCountry === null,
    },
  }
}
