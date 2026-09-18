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
import type Quote from '#models/quote'
import QuotePnlInput from '#models/quote_pnl_input'

/**
 * The actual per-corridor math and the projection math both live in
 * `@strike/shared` (not duplicated here) so the frontend can show the exact
 * same live growth preview before saving — see
 * docs/old-app-reference/remaining-quote-tabs.md section 8 (Step 1).
 */
export { computeQuotePnl }
export type { PnlPricedCorridor, PnlSetupFeeInputs, QuotePnlResult, QuotePnlYear }

/**
 * Loads exactly the membership set Step 0 (D1/D2) resolved for official
 * P&L: saved (persisted), non-deleted, positive-volume corridors only. Zero-
 * volume rows and unsaved preview edits never reach the projection. Also
 * reused by the Quoting Summary endpoint so both tabs share one membership
 * rule.
 */
export async function loadPricedCorridors(quote: Quote): Promise<PnlPricedCorridor[]> {
  await quote.load('corridors', (q) => {
    q.withScopes((s) => s.active())
    q.where('yearlyVolumeUsd', '>', 0)
    q.whereNotNull('totalRevenue')
    q.preload('corridor')
  })

  return quote.corridors.map((corridor) => ({
    yearlyVolumeUsd: Number(corridor.yearlyVolumeUsd),
    yearlyTransactions: Number(corridor.yearlyTransactions),
    revenueFee: Number(corridor.revenueFee ?? 0),
    fxMargin: Number(corridor.fxMargin ?? 0),
    marginFee: Number(corridor.marginFee ?? 0),
    totalMargin: Number(corridor.totalMargin ?? 0),
  }))
}

export function hasB2BCorridor(quote: Quote): boolean {
  return quote.corridors.some((c) => c.corridor?.transactionTypeCode === 'B2B')
}

export async function loadSetupFeeInputs(quote: Quote): Promise<PnlSetupFeeInputs | null> {
  const setupFee = await quote
    .related('setupFee')
    .query()
    .preload('mcfPrincipalSlots')
    .preload('mcfBlockFees')
    .first()

  if (!setupFee) return null

  return {
    quotedPrice: Number(setupFee.quotedPrice),
    mcfType: setupFee.mcfType,
    standardCommitmentFee: Number(setupFee.standardCommitmentFee),
    commitmentFeeDiscountPct: Number(setupFee.commitmentFeeDiscountPct),
    mcfPrincipalSlots: setupFee.mcfPrincipalSlots.map((slot) => ({
      startMonth: slot.startMonth,
      endMonth: slot.endMonth,
      monthlyPrincipal: Number(slot.monthlyPrincipal),
      ratePct: Number(slot.ratePct),
    })),
    mcfBlockFees: setupFee.mcfBlockFees.map((block) => ({
      blockKey: block.blockKey,
      commitmentFee: Number(block.commitmentFee),
    })),
    waivedMonths: setupFee.waivedMonths,
    contractLengthYears: quote.contractLengthYears ?? 1,
  }
}

export async function buildPnlResponse(quote: Quote) {
  const corridors = await loadPricedCorridors(quote)
  const setupFee = await loadSetupFeeInputs(quote)
  const pnlInput = await QuotePnlInput.findBy('quoteId', quote.id)

  const year2GrowthPct = Number(pnlInput?.year2GrowthPct ?? 0)
  const year3GrowthPct = Number(pnlInput?.year3GrowthPct ?? 0)

  const years = computeQuotePnl({ corridors, setupFee, year2GrowthPct, year3GrowthPct })

  const approvalReasons = computePnlApprovalReasons({
    opportunityType: quote.opportunityType,
    hasB2BCorridor: hasB2BCorridor(quote),
    years,
  })

  return {
    inputs: { year2GrowthPct, year3GrowthPct },
    years,
    completeness: {
      corridorCount: corridors.length,
      hasSetupFee: setupFee !== null,
    },
    needsApproval: approvalReasons.length > 0,
    approvalReasons,
  }
}

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
