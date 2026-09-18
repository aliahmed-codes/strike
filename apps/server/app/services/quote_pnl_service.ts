import {
  computeQuotePnl,
  isFxMarginNegative,
  isFxMarginPctNegative,
  isGrossMarginBelowThreshold,
  isMarginPctBelowThreshold,
  PNL_GROSS_MARGIN_THRESHOLD_BY_OPPORTUNITY,
  PNL_MARGIN_PCT_THRESHOLD_B2B,
  PNL_MARGIN_PCT_THRESHOLD_NON_B2B,
} from '@strike/shared'
import type {
  PnlPricedCorridor,
  PnlSetupFeeInputs,
  QuotePnlResult,
  QuotePnlYear,
} from '@strike/shared'

/**
 * The actual per-corridor math and the projection math both live in
 * `@strike/shared` (not duplicated here) so the frontend can show the exact
 * same live growth preview before saving — see
 * docs/old-app-reference/remaining-quote-tabs.md section 8 (Step 1).
 */
export { computeQuotePnl }
export type { PnlPricedCorridor, PnlSetupFeeInputs, QuotePnlResult, QuotePnlYear }

/**
 * Aggregate-level approval reasons for the P&L view (distinct from each
 * corridor's own financial/network approval reasons, already computed by
 * quote_pricing_service). Needs opportunity-type and B2B context, so this
 * stays backend-only — same pattern as Setup Fee's approval-reason text.
 *
 * Checks all 3 years independently, matching the old app's real live P&L
 * table (`PLTab.tsx`) — not just Year 1, which is all its own separate,
 * confirmed-stale approvals-store snapshot ever checked.
 */
export interface PnlApprovalInput {
  opportunityType: string | null
  /** Whether any saved, non-deleted, positive-volume corridor on the quote has transactionTypeCode === 'B2B'. */
  hasB2BCorridor: boolean
  years: QuotePnlResult
}

export function computePnlApprovalReasons(input: PnlApprovalInput): string[] {
  const reasons: string[] = []
  const marginPctThreshold = input.hasB2BCorridor
    ? PNL_MARGIN_PCT_THRESHOLD_B2B
    : PNL_MARGIN_PCT_THRESHOLD_NON_B2B
  const gmThreshold =
    PNL_GROSS_MARGIN_THRESHOLD_BY_OPPORTUNITY[(input.opportunityType ?? '').trim().toLowerCase()]

  const yearsInOrder: [string, QuotePnlYear][] = [
    ['Year 1', input.years.year1],
    ['Year 2', input.years.year2],
    ['Year 3', input.years.year3],
  ]

  for (const [label, year] of yearsInOrder) {
    if (isGrossMarginBelowThreshold(year.grossMarginPct, input.opportunityType)) {
      reasons.push(
        gmThreshold !== undefined
          ? `${label} gross margin of ${year.grossMarginPct}% is below the ${gmThreshold}% threshold`
          : `${label} gross margin of ${year.grossMarginPct}% is negative`
      )
    }
    if (isMarginPctBelowThreshold(year.marginPct, input.hasB2BCorridor)) {
      reasons.push(
        `${label} margin of ${year.marginPct}% of volume is below the ${marginPctThreshold}% minimum`
      )
    }
    if (isFxMarginNegative(year.fxMargin)) {
      reasons.push(`${label} FX margin is negative`)
    }
    if (isFxMarginPctNegative(year.fxMarginPct)) {
      reasons.push(`${label} FX margin % is negative`)
    }
  }

  return reasons
}
