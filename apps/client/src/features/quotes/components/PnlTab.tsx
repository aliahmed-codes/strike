import { useMemo } from 'react'
import type { QuotePnlResult, QuotePnlYear } from '@strike/shared'
import { computeQuotePnl, validatePnlGrowthField } from '@strike/shared'
import { Input } from '@/components/ui/input'
import { getApiErrorMessage, getApiFieldErrors } from '@/lib/api-error'
import { useQuote } from '../api/useQuotes'
import { useSetupFee } from '../api/useSetupFee'
import { useQuotePnl, useUpdateQuotePnl } from '../api/useQuotePnl'
import { useQuoteWorkspaceStore } from '../store/useQuoteWorkspaceStore'
import { CollapsibleSection } from './CollapsibleSection'
import { FormField } from './FormField'

export function PnlTab({
  tabKey,
  quoteId,
  contractLengthYears,
  updatePnl,
}: {
  tabKey: string
  quoteId: number | null
  contractLengthYears: number
  updatePnl: ReturnType<typeof useUpdateQuotePnl>
}) {
  if (quoteId === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-24 text-center">
        <h2 className="text-lg font-semibold">Save the draft first</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          P&amp;L is computed from a real pricing request. Click "Save Draft" first, then come back
          here.
        </p>
      </div>
    )
  }

  return (
    <PnlTabContent
      tabKey={tabKey}
      quoteId={quoteId}
      contractLengthYears={contractLengthYears}
      updatePnl={updatePnl}
    />
  )
}

function PnlTabContent({
  tabKey,
  quoteId,
  contractLengthYears,
  updatePnl,
}: {
  tabKey: string
  quoteId: number
  contractLengthYears: number
  updatePnl: ReturnType<typeof useUpdateQuotePnl>
}) {
  const { data: pnl, isLoading } = useQuotePnl(quoteId)
  const { data: quoteData } = useQuote(quoteId)
  const { data: setupFee } = useSetupFee(quoteId)

  // Draft growth inputs live in the shared workspace store, not local
  // component state — so the single "Save Draft" button can see and save
  // them, and so they survive switching to another tab and back (Radix
  // unmounts inactive TabsContent by default).
  const draft = useQuoteWorkspaceStore((s) => s.pendingPnlInputs[tabKey])
  const updateDraftPnlInputs = useQuoteWorkspaceStore((s) => s.updateDraftPnlInputs)
  const current = draft ?? {
    year2GrowthPct: pnl?.inputs.year2GrowthPct ?? 0,
    year3GrowthPct: pnl?.inputs.year3GrowthPct ?? 0,
  }

  const year2ClientError = validatePnlGrowthField(current.year2GrowthPct)
  const year3ClientError = validatePnlGrowthField(current.year3GrowthPct)

  // Readable errors: the two growth fields have real backend field names, so
  // a save-time rejection (e.g. an out-of-range value the client check
  // somehow missed) attaches directly under the right input; anything else
  // (a 409 non-draft conflict, a network error) shows as one general line.
  const fieldErrors = getApiFieldErrors(updatePnl.error) ?? []
  const serverYear2Error = fieldErrors.find((e) => e.field === 'year2GrowthPct')?.message
  const serverYear3Error = fieldErrors.find((e) => e.field === 'year3GrowthPct')?.message
  const generalErrorMessage =
    fieldErrors.length === 0 && updatePnl.isError ? getApiErrorMessage(updatePnl.error) : null

  const year2Error = year2ClientError ?? serverYear2Error
  const year3Error = year3ClientError ?? serverYear3Error

  function setYear2GrowthPct(value: number) {
    updateDraftPnlInputs(tabKey, { ...current, year2GrowthPct: value })
  }
  function setYear3GrowthPct(value: number) {
    updateDraftPnlInputs(tabKey, { ...current, year3GrowthPct: value })
  }

  // Same saved-non-deleted-positive-volume membership rule the backend
  // applies (Step 0, D1/D2) — a mismatch here only affects this unsaved
  // preview cosmetically, never what Save actually persists.
  const pricedCorridors = useMemo(
    () =>
      (quoteData?.quote.corridors ?? [])
        .filter((c) => c.yearlyVolumeUsd > 0 && c.totalRevenue !== null)
        .map((c) => ({
          yearlyVolumeUsd: c.yearlyVolumeUsd,
          yearlyTransactions: c.yearlyTransactions,
          revenueFee: c.revenueFee ?? 0,
          fxMargin: c.fxMargin ?? 0,
          marginFee: c.marginFee ?? 0,
          totalMargin: c.totalMargin ?? 0,
        })),
    [quoteData]
  )

  const setupFeeInputs = useMemo(() => {
    if (!setupFee) return null
    return {
      quotedPrice: setupFee.quotedPrice,
      mcfType: setupFee.mcfType,
      standardCommitmentFee: setupFee.standardCommitmentFee ?? 0,
      commitmentFeeDiscountPct: setupFee.commitmentFeeDiscountPct ?? 0,
      mcfPrincipalSlots: (setupFee.mcfPrincipalSlots ?? []).map((s) => ({
        startMonth: s.startMonth,
        endMonth: s.endMonth,
        monthlyPrincipal: s.monthlyPrincipal,
        ratePct: s.ratePct,
      })),
      mcfBlockFees: (setupFee.mcfBlockFees ?? []).map((b) => ({
        blockKey: b.blockKey,
        commitmentFee: b.commitmentFee,
      })),
      waivedMonths: setupFee.waivedMonths,
      contractLengthYears,
    }
  }, [setupFee, contractLengthYears])

  // Live preview via the exact backend function — @strike/shared's
  // computeQuotePnl, the same one apps/server/app/services/quote_pnl_service.ts
  // calls, so this can never drift from what Save will actually persist.
  const preview: QuotePnlResult | null = useMemo(() => {
    if (year2ClientError || year3ClientError) return null
    return computeQuotePnl({
      corridors: pricedCorridors,
      setupFee: setupFeeInputs,
      year2GrowthPct: current.year2GrowthPct,
      year3GrowthPct: current.year3GrowthPct,
    })
  }, [pricedCorridors, setupFeeInputs, current.year2GrowthPct, current.year3GrowthPct, year2ClientError, year3ClientError])

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading P&amp;L…</p>
  }

  if (pnl === undefined) {
    return <p className="text-sm text-destructive">Couldn't load P&amp;L for this quote.</p>
  }

  const isDirty = draft !== undefined
  const displayedYears = isDirty && preview ? preview : pnl.years

  return (
    <div className="space-y-6">
      {generalErrorMessage && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {generalErrorMessage}
        </div>
      )}

      {pnl.needsApproval && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-medium">This P&amp;L requires approval:</p>
          <ul className="mt-1 list-disc pl-5">
            {pnl.approvalReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      <CollapsibleSection title="Growth Assumptions" defaultOpen>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="Year 2-over-1 Growth %"
            caption={year2Error ? undefined : 'e.g. 10 for 10% growth, 0 for flat, negative for a decline'}
          >
            <Input
              type="number"
              value={current.year2GrowthPct}
              aria-invalid={!!year2Error}
              onChange={(e) => setYear2GrowthPct(Number(e.target.value))}
            />
            {year2Error && <p className="text-xs text-destructive">{year2Error}</p>}
          </FormField>
          <FormField
            label="Year 3-over-2 Growth %"
            caption={year3Error ? undefined : 'e.g. 10 for 10% growth, 0 for flat, negative for a decline'}
          >
            <Input
              type="number"
              value={current.year3GrowthPct}
              aria-invalid={!!year3Error}
              onChange={(e) => setYear3GrowthPct(Number(e.target.value))}
            />
            {year3Error && <p className="text-xs text-destructive">{year3Error}</p>}
          </FormField>
        </div>
        {isDirty && (
          <p className="mt-3 text-xs text-muted-foreground">
            Showing an unsaved live preview — click "Save Draft" at the top of the page to persist
            these growth rates.
          </p>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Projected P&L" defaultOpen>
        <p className="mb-3 text-xs text-muted-foreground">
          Always a 3-year forecast, regardless of contract length. Year 1 reflects saved corridor
          pricing and setup fee only; Year 2/3 apply the growth rates above.
        </p>
        <PnlTable years={displayedYears} />
      </CollapsibleSection>
    </div>
  )
}

const CURRENCY_ROWS: { key: keyof QuotePnlYear; label: string }[] = [
  { key: 'principal', label: 'Principal' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'atvUsd', label: 'ATV' },
  { key: 'feeRevenue', label: 'Fee Revenue' },
  { key: 'fxMargin', label: 'FX Margin' },
  { key: 'oneOffFee', label: 'Setup / Network Joining Fee' },
  { key: 'commitmentFeeRevenue', label: 'Monthly Commitment Fee' },
  { key: 'totalRevenue', label: 'Total Revenue' },
  { key: 'marginFee', label: 'Margin Fee' },
  { key: 'totalMargin', label: 'Total Margin' },
]

const PERCENT_ROWS: { key: keyof QuotePnlYear; label: string }[] = [
  { key: 'takeRatePct', label: 'Take Rate %' },
  { key: 'marginPct', label: 'Margin %' },
  { key: 'fxMarginPct', label: 'FX Margin %' },
  { key: 'grossMarginPct', label: 'Gross Margin %' },
]

const PLAIN_ROW_KEYS: (keyof QuotePnlYear)[] = ['transactions']

function formatCell(key: keyof QuotePnlYear, value: number, isPercent: boolean): string {
  if (isPercent) return `${value}%`
  if (PLAIN_ROW_KEYS.includes(key)) return value.toLocaleString()
  return `$${value.toLocaleString()}`
}

function PnlTable({ years }: { years: QuotePnlResult }) {
  const rows = [...CURRENCY_ROWS, ...PERCENT_ROWS]
  const isPercentRow = (key: keyof QuotePnlYear) => PERCENT_ROWS.some((r) => r.key === key)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
            <th className="pb-2 pr-3">Metric</th>
            <th className="pb-2 pr-3">Year 1</th>
            <th className="pb-2 pr-3">Year 2</th>
            <th className="pb-2 pr-3">Year 3</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, label }) => (
            <tr key={key} className="border-b last:border-0">
              <td className="py-1.5 pr-3 font-medium">{label}</td>
              <td className="py-1.5 pr-3">{formatCell(key, years.year1[key], isPercentRow(key))}</td>
              <td className="py-1.5 pr-3">{formatCell(key, years.year2[key], isPercentRow(key))}</td>
              <td className="py-1.5 pr-3">{formatCell(key, years.year3[key], isPercentRow(key))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
