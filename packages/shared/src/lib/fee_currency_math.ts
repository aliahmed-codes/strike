/** The only two currency fields fee conversion needs. */
export interface FeeConversionCurrency {
  isoCode3: string
  feeConversionRateToUsd: number | null
}

/**
 * Converts a USD amount into a fee currency using the currency's static
 * rate. Returns null — never a 1:1 guess — when the currency has no real
 * rate (only ~14 currencies do), so callers must show "no rate" or block.
 */
export function usdToFeeCurrencyAmount(
  amountUsd: number,
  currency: FeeConversionCurrency | undefined
): number | null {
  if (!currency) return null
  if (currency.isoCode3 === 'USD') return amountUsd
  if (!currency.feeConversionRateToUsd) return null
  return amountUsd * currency.feeConversionRateToUsd
}

/** The reverse direction, with the same null-when-uncovered rule. */
export function feeCurrencyToUsd(
  amountInCurrency: number,
  currency: FeeConversionCurrency | undefined
): number | null {
  if (!currency) return null
  if (currency.isoCode3 === 'USD') return amountInCurrency
  if (!currency.feeConversionRateToUsd) return null
  return amountInCurrency / currency.feeConversionRateToUsd
}
