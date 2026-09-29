import type { MbpAdjustmentResult } from './mbp_pricing_math.js'

/**
 * Currencies the old app treats as "hard" (lower FX risk, smaller minimum
 * spread markup) versus everything else. Confirmed from its real
 * `isHardCurrency` check.
 */
const HARD_CURRENCIES = new Set(['GBP', 'USD', 'EUR', 'SGD', 'AUD', 'CAD'])

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/** A corridor's real treasury FX cost, converted from a decimal fraction to percentage points, floored at 0. */
export function computeTreasuryFxCostPct(treasuryFxCostSpread: number | null): number {
  if (treasuryFxCostSpread === null || Number.isNaN(treasuryFxCostSpread)) return 0
  return round(Math.max(0, treasuryFxCostSpread) * 100, 4)
}

/**
 * The minimum acceptable FX spread for a corridor — its real treasury cost
 * plus a currency-tier markup (hard currencies carry less risk, so a
 * smaller markup). Zero for a like-for-like corridor (funding currency
 * equals payout currency), since there's no FX conversion happening at all.
 *
 * `mbp`, when given, can change this: a "standard"-mode strategic override
 * *replaces* the minimum spread outright (`minimumFxSpreadOverride`); a
 * grid rule (or an "adjustment"-mode override) *replaces* the currency-tier
 * markup component with its own bps bump (`minimumFxSpreadAdjustmentBps`)
 * — confirmed against the old app's real Denmark example: treasury cost
 * 0.10% + a 15bps grid bump = 0.25% minimum, not the usual hard-currency
 * 10bps markup.
 */
export function computeFxMinimumSpreadPct(
  treasuryFxCostSpread: number | null,
  fundingCurrencyIso: string | undefined,
  payoutCurrencyIso: string,
  mbp?: MbpAdjustmentResult | null
): number {
  if (fundingCurrencyIso && fundingCurrencyIso === payoutCurrencyIso) return 0
  if (mbp?.minimumFxSpreadOverride !== null && mbp?.minimumFxSpreadOverride !== undefined) {
    return round(mbp.minimumFxSpreadOverride, 4)
  }
  const treasuryCostPct = computeTreasuryFxCostPct(treasuryFxCostSpread)
  if (mbp?.minimumFxSpreadAdjustmentBps !== null && mbp?.minimumFxSpreadAdjustmentBps !== undefined) {
    return round(treasuryCostPct + mbp.minimumFxSpreadAdjustmentBps / 100, 4)
  }
  const markup = fundingCurrencyIso && HARD_CURRENCIES.has(fundingCurrencyIso) ? 0.1 : 0.2
  return round(treasuryCostPct + markup, 4)
}

/**
 * The suggested default FX spread — the minimum spread plus a fixed 10bps
 * buffer above it (or, for a "standard"-mode strategic override, its own
 * direct `fxSpreadOverride`).
 */
export function computeFxDefaultSpreadPct(
  treasuryFxCostSpread: number | null,
  fundingCurrencyIso: string | undefined,
  payoutCurrencyIso: string,
  mbp?: MbpAdjustmentResult | null
): number {
  if (fundingCurrencyIso && fundingCurrencyIso === payoutCurrencyIso) return 0
  if (mbp?.fxSpreadOverride !== null && mbp?.fxSpreadOverride !== undefined) {
    return round(mbp.fxSpreadOverride, 4)
  }
  return round(computeFxMinimumSpreadPct(treasuryFxCostSpread, fundingCurrencyIso, payoutCurrencyIso, mbp) + 0.1, 4)
}
