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
 */
export function computeFxMinimumSpreadPct(
  treasuryFxCostSpread: number | null,
  fundingCurrencyIso: string | undefined,
  payoutCurrencyIso: string
): number {
  if (fundingCurrencyIso && fundingCurrencyIso === payoutCurrencyIso) return 0
  const treasuryCostPct = computeTreasuryFxCostPct(treasuryFxCostSpread)
  const markup = fundingCurrencyIso && HARD_CURRENCIES.has(fundingCurrencyIso) ? 0.1 : 0.2
  return round(treasuryCostPct + markup, 4)
}

/** The suggested default FX spread — the minimum spread plus a fixed 10bps buffer above it. */
export function computeFxDefaultSpreadPct(
  treasuryFxCostSpread: number | null,
  fundingCurrencyIso: string | undefined,
  payoutCurrencyIso: string
): number {
  if (fundingCurrencyIso && fundingCurrencyIso === payoutCurrencyIso) return 0
  return round(computeFxMinimumSpreadPct(treasuryFxCostSpread, fundingCurrencyIso, payoutCurrencyIso) + 0.1, 4)
}
