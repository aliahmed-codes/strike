/**
 * Tiered/volume-based corridor pricing (FEATURES.md Phase 1b) — a corridor's
 * total yearly volume is split across up to 3 tiers, each with its own
 * fixed fee/variable fee %/FX spread; whatever volume is left over prices at
 * the corridor's own standard fields. Deliberately does NOT introduce any
 * new pricing formula: each tier (and the standard remainder) is just
 * another call to `computeCorridorPricing`, summed together. This is a
 * cleaned-up rebuild of the old app's intent, not a port of its code — see
 * FEATURES.md Phase 1b for the investigation notes on what was wrong with
 * the original (backwards tier-discount numbering, a broken volume
 * allocation mechanism, no real per-tier approval checks, hardcoded
 * discounts despite looking editable) and what's fixed here.
 */

import {
  computeCorridorPricing,
  type CorridorMasterData,
  type CorridorPricingResult,
} from './corridor_pricing_math.js'
import type { CorridorTierInput } from '../types/quote.js'

export type { CorridorTierInput }

export interface CorridorTierResult extends CorridorPricingResult {
  tierNumber: number
  yearlyTransactions: number
}

export interface TieredCorridorPricingInputs {
  totalYearlyVolumeUsd: number
  atvUsd: number
  standardFixedFeeUsd: number
  standardVariableFeePct: number
  standardAppliedFxSpread: number
  feeDiscountPct: number
  tiers: CorridorTierInput[]
  transactionTypeCode: string
  fundingCurrencyId: number | null
  payoutCurrencyId: number
  opportunityType: string | null
  corridor: CorridorMasterData
}

export interface TieredCorridorPricingResult {
  standard: CorridorTierResult
  tiers: CorridorTierResult[]
  revenueFee: number
  fxMargin: number
  fxMarginPct: number
  marginFee: number
  totalRevenue: number
  totalMargin: number
  totalVolumeUsd: number
  totalTransactions: number
  grossMarginPct: number
  takeRatePct: number
  needsApproval: boolean
  approvalReasons: string[]
  needsFinancialApproval: boolean
  financialApprovalReasons: string[]
  needsNetworkApproval: boolean
  networkApprovalReasons: string[]
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function transactionsForVolume(volumeUsd: number, atvUsd: number): number {
  if (atvUsd <= 0 || volumeUsd <= 0) return 0
  return Math.ceil(volumeUsd / atvUsd)
}

function priceSlice(
  tierNumber: number,
  volumeUsd: number,
  fixedFeeUsd: number,
  variableFeePct: number,
  appliedFxSpread: number,
  inputs: TieredCorridorPricingInputs
): CorridorTierResult {
  const yearlyTransactions = transactionsForVolume(volumeUsd, inputs.atvUsd)
  const priced = computeCorridorPricing({
    yearlyVolumeUsd: volumeUsd,
    yearlyTransactions,
    fixedFeeUsd,
    variableFeePct,
    appliedFxSpread,
    feeDiscountPct: inputs.feeDiscountPct,
    transactionTypeCode: inputs.transactionTypeCode,
    fundingCurrencyId: inputs.fundingCurrencyId,
    payoutCurrencyId: inputs.payoutCurrencyId,
    opportunityType: inputs.opportunityType,
    corridor: inputs.corridor,
  })
  return { tierNumber, yearlyTransactions, ...priced }
}

/** Tier volumes can never add up to more than the corridor's total. */
export function validateTierAllocation(
  totalYearlyVolumeUsd: number,
  tiers: CorridorTierInput[]
): string[] {
  const errors: string[] = []
  const tierTotal = tiers.reduce((sum, t) => sum + t.yearlyVolumeUsd, 0)
  if (tierTotal > totalYearlyVolumeUsd) {
    errors.push(
      `Tier volumes total $${round(tierTotal, 2)}, which exceeds the corridor's total yearly volume of $${round(totalYearlyVolumeUsd, 2)}.`
    )
  }
  const seen = new Set<number>()
  for (const tier of tiers) {
    if (tier.tierNumber < 1 || tier.tierNumber > 3) {
      errors.push(`Tier number must be 1, 2, or 3 (got ${tier.tierNumber}).`)
    }
    if (seen.has(tier.tierNumber)) {
      errors.push(`Tier ${tier.tierNumber} is defined more than once.`)
    }
    seen.add(tier.tierNumber)
  }
  return errors
}

export function computeTieredCorridorPricing(
  inputs: TieredCorridorPricingInputs
): TieredCorridorPricingResult {
  const tierVolumeTotal = inputs.tiers.reduce((sum, t) => sum + t.yearlyVolumeUsd, 0)
  const standardVolume = Math.max(0, inputs.totalYearlyVolumeUsd - tierVolumeTotal)

  const standard = priceSlice(
    0,
    standardVolume,
    inputs.standardFixedFeeUsd,
    inputs.standardVariableFeePct,
    inputs.standardAppliedFxSpread,
    inputs
  )

  const tiers = inputs.tiers
    .slice()
    .sort((a, b) => a.tierNumber - b.tierNumber)
    .map((tier) =>
      priceSlice(
        tier.tierNumber,
        tier.yearlyVolumeUsd,
        tier.fixedFeeUsd,
        tier.variableFeePct,
        tier.appliedFxSpread,
        inputs
      )
    )

  const allSlices = [standard, ...tiers]
  const revenueFee = allSlices.reduce((sum, s) => sum + s.revenueFee, 0)
  const fxMargin = allSlices.reduce((sum, s) => sum + s.fxMargin, 0)
  const marginFee = allSlices.reduce((sum, s) => sum + s.marginFee, 0)
  const totalRevenue = allSlices.reduce((sum, s) => sum + s.totalRevenue, 0)
  const totalMargin = allSlices.reduce((sum, s) => sum + s.totalMargin, 0)
  const totalVolumeUsd = standardVolume + tierVolumeTotal
  const totalTransactions = allSlices.reduce((sum, s) => sum + s.yearlyTransactions, 0)
  const fxMarginPct = totalRevenue > 0 ? (fxMargin / totalRevenue) * 100 : 0
  const grossMarginPct = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0
  const takeRatePct = totalVolumeUsd > 0 ? (totalRevenue / totalVolumeUsd) * 100 : 0

  const approvalReasons: string[] = []
  const financialApprovalReasons: string[] = []
  const networkApprovalReasons: string[] = []
  for (const slice of allSlices) {
    const label = slice.tierNumber === 0 ? 'Standard' : `Tier ${slice.tierNumber}`
    for (const reason of slice.approvalReasons) approvalReasons.push(`${label}: ${reason}`)
    for (const reason of slice.financialApprovalReasons)
      financialApprovalReasons.push(`${label}: ${reason}`)
    for (const reason of slice.networkApprovalReasons)
      networkApprovalReasons.push(`${label}: ${reason}`)
  }

  return {
    standard,
    tiers,
    revenueFee: round(revenueFee, 2),
    fxMargin: round(fxMargin, 2),
    fxMarginPct: round(fxMarginPct, 4),
    marginFee: round(marginFee, 2),
    totalRevenue: round(totalRevenue, 2),
    totalMargin: round(totalMargin, 2),
    totalVolumeUsd: round(totalVolumeUsd, 2),
    totalTransactions,
    grossMarginPct: round(grossMarginPct, 4),
    takeRatePct: round(takeRatePct, 4),
    needsFinancialApproval: financialApprovalReasons.length > 0,
    financialApprovalReasons,
    needsNetworkApproval: networkApprovalReasons.length > 0,
    networkApprovalReasons,
    needsApproval: approvalReasons.length > 0,
    approvalReasons,
  }
}
