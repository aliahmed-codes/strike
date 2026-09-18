import {
  computeQuotePnl,
  PNL_GROSS_MARGIN_THRESHOLD_BY_OPPORTUNITY,
  PNL_MARGIN_PCT_THRESHOLD_B2B,
  PNL_MARGIN_PCT_THRESHOLD_NON_B2B,
} from '@strike/shared'
import type { PnlPricedCorridor, PnlSetupFeeInputs, QuotePnlResult } from '@strike/shared'

/**
 * The actual per-corridor math and the projection math both live in
 * `@strike/shared` (not duplicated here) so the frontend can show the exact
 * same live growth preview before saving — see
 * docs/old-app-reference/remaining-quote-tabs.md section 8 (Step 1).
 */
export { computeQuotePnl }
export type { PnlPricedCorridor, PnlSetupFeeInputs, QuotePnlResult }

/**
 * Aggregate-level approval reasons for the P&L view (distinct from each
 * corridor's own financial/network approval reasons, already computed by
 * quote_pricing_service). Needs opportunity-type and B2B context, so this
 * stays backend-only — same pattern as Setup Fee's approval-reason text.
 */
export interface PnlApprovalInput {
  opportunityType: string | null
  /** Whether any saved, non-deleted, positive-volume corridor on the quote has transactionTypeCode === 'B2B'. */
  hasB2BCorridor: boolean
  year1GrossMarginPct: number
  year1MarginPct: number
  year1FxMargin: number
}

export function computePnlApprovalReasons(input: PnlApprovalInput): string[] {
  const reasons: string[] = []
  const opportunityType = (input.opportunityType ?? '').trim().toLowerCase()
  const gmThreshold = PNL_GROSS_MARGIN_THRESHOLD_BY_OPPORTUNITY[opportunityType]

  if (gmThreshold !== undefined) {
    if (input.year1GrossMarginPct < gmThreshold) {
      reasons.push(
        `Year 1 gross margin of ${input.year1GrossMarginPct}% is below the ${gmThreshold}% threshold`
      )
    }
  } else if (input.year1GrossMarginPct < 0) {
    reasons.push(`Year 1 gross margin of ${input.year1GrossMarginPct}% is negative`)
  }

  const marginPctThreshold = input.hasB2BCorridor
    ? PNL_MARGIN_PCT_THRESHOLD_B2B
    : PNL_MARGIN_PCT_THRESHOLD_NON_B2B
  if (input.year1MarginPct < marginPctThreshold) {
    reasons.push(
      `Year 1 margin of ${input.year1MarginPct}% of volume is below the ${marginPctThreshold}% minimum`
    )
  }

  if (input.year1FxMargin < 0) {
    reasons.push('Year 1 FX margin is negative')
  }

  return reasons
}
