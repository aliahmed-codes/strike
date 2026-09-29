/**
 * The numeric limits enforced by the backend's corridor validators
 * (`apps/server/app/validators/quote.ts`) — kept here so the frontend's live
 * input validation can never quietly drift from what the server actually
 * accepts.
 */
export const CORRIDOR_FIELD_LIMITS = {
  atvUsd: { min: 0 },
  yearlyVolumeUsd: { min: 0 },
  yearlyTransactions: { min: 0 },
  fixedFeeUsd: { min: 0 },
  variableFeePct: { min: 0, max: 100 },
  appliedFxSpread: { min: 0, max: 100 },
  feeDiscountPct: { min: 0, max: 100 },
  // Stored as fractions (matching the catalog fields they override — see
  // `corridor_pricing_math.ts`), not percent — the UI converts the
  // percent value the user types by /100 before validating/storing.
  treasuryFxCostSpreadOverride: { min: 0, max: 1 },
  costFixedUsdOverride: { min: 0 },
  costVariablePctOverride: { min: 0, max: 1 },
} as const

export type CorridorLimitedField = keyof typeof CORRIDOR_FIELD_LIMITS

export function validateCorridorField(field: CorridorLimitedField, value: number): string | null {
  const limit: { min: number; max?: number } = CORRIDOR_FIELD_LIMITS[field]
  if (Number.isNaN(value)) return 'Enter a number'
  if (value < limit.min) return `Must be at least ${limit.min}`
  if (limit.max !== undefined && value > limit.max) return `Must not be greater than ${limit.max}`
  return null
}
