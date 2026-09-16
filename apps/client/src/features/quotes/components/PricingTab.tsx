import { Fragment, useState } from 'react'
import {
  computeCorridorPricing,
  computeTieredCorridorPricing,
  seedQuoteCorridorFromCatalog,
  validateTierAllocation,
  type Corridor,
  type CorridorTierInput,
  type PricingModel,
  type QuoteCorridor,
  type QuoteCorridorInput,
} from '@strike/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { useCorridorCatalog, useCorridorFacets, useCurrencies, useMatchingCorridors } from '../api/useReferenceData'
import { useQuote } from '../api/useQuotes'
import {
  useAddQuoteCorridor,
  useRemoveQuoteCorridor,
  useUpdateQuoteCorridor,
} from '../api/useQuoteCorridors'
import { CollapsibleSection } from './CollapsibleSection'
import { CorridorsToOfferSection, corridorLabel, useCorridorFilterFields } from './CorridorsToOfferSection'
import { FormField } from './FormField'
import { SimpleSelect } from './SimpleSelect'

const RESTRICTED_USE_CASE_LABELS = new Set(['last mile payout', 'account top-up'])

interface EditableFields {
  atvUsd: number
  yearlyVolumeUsd: number
  yearlyTransactions: number
  fixedFeeUsd: number
  variableFeePct: number
  appliedFxSpread: number
  feeDiscountPct: number
}

/** The fields both a standard and a tiered pricing result share, so the table can display either uniformly. */
interface PricingSummary {
  totalRevenue: number
  fxMarginPct: number
  marginFee: number
  marginFeePct: number
  marginPct: number
  grossMarginPct: number
  takeRatePct: number
  needsFinancialApproval: boolean
  financialApprovalReasons: string[]
  needsNetworkApproval: boolean
  networkApprovalReasons: string[]
}

/**
 * One row on the "Priced Corridors" table — either a real saved
 * `quote_corridors` row, or a corridor matched by the "Corridors to Offer"
 * filters that hasn't been edited (and therefore saved) yet. Saved rows
 * always render, unconditionally, regardless of the current filters — only
 * preview rows come and go as filters change. See FEATURES.md Phase 1b.
 */
type DisplayRow =
  | { kind: 'saved'; key: string; row: QuoteCorridor }
  | { kind: 'preview'; key: string; corridor: Corridor }

const EMPTY_DRAFT: Omit<QuoteCorridorInput, 'corridorId'> = {
  fundingCurrencyId: null,
  atvUsd: undefined,
  yearlyVolumeUsd: 0,
  yearlyTransactions: 0,
  fixedFeeUsd: 0,
  variableFeePct: 0,
  appliedFxSpread: 0,
  feeDiscountPct: 0,
}

const EMPTY_TIER: Omit<CorridorTierInput, 'tierNumber'> = {
  yearlyVolumeUsd: 0,
  fixedFeeUsd: 0,
  variableFeePct: 0,
  appliedFxSpread: 0,
}

const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(2)}%`)
const money = (n: number | null) =>
  n === null ? '—' : `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`

/**
 * A static conversion rate, not a live rate feed (see FEATURES.md Phase 1b)
 * — only ~14 currencies have one. Shows "No rate available" rather than a
 * fabricated 1:1 fallback for everything else.
 */
function feeInFundingCurrency(
  amountUsd: number,
  currency: { isoCode3: string; feeConversionRateToUsd: number | null } | undefined
): string {
  if (!currency) return '—'
  if (currency.isoCode3 === 'USD') return money(amountUsd)
  if (currency.feeConversionRateToUsd === null) return 'No rate available'
  const converted = amountUsd * currency.feeConversionRateToUsd
  return `${converted.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency.isoCode3}`
}

/** Live-preview math — the exact same function the backend uses to compute and validate on save, so this can never drift from what actually gets persisted. */
function previewPricing(
  fields: EditableFields,
  corridor: Corridor,
  fundingCurrencyId: number | null,
  opportunityType: string | null
): PricingSummary {
  return computeCorridorPricing({
    ...fields,
    transactionTypeCode: corridor.transactionTypeCode,
    fundingCurrencyId,
    payoutCurrencyId: corridor.payoutCurrencyId,
    opportunityType,
    corridor: {
      fxSource: corridor.fxSource,
      treasuryFxCostSpread: corridor.treasuryFxCostSpread,
      costFixedUsd: corridor.costFixedUsd,
      costVariablePct: corridor.costVariablePct,
      networkNeedApprovalRaw: corridor.networkNeedApprovalRaw,
      internalRaw: corridor.internalRaw,
      centralBankRaw: corridor.centralBankRaw,
    },
  })
}

/** Same idea, but splitting volume across tiers plus a standard remainder — see packages/shared/src/lib/tiered_pricing_math.ts. */
function previewTieredPricing(
  fields: EditableFields,
  atvUsd: number,
  tiers: CorridorTierInput[],
  corridor: Corridor,
  fundingCurrencyId: number | null,
  opportunityType: string | null
): PricingSummary {
  return computeTieredCorridorPricing({
    totalYearlyVolumeUsd: fields.yearlyVolumeUsd,
    atvUsd,
    standardFixedFeeUsd: fields.fixedFeeUsd,
    standardVariableFeePct: fields.variableFeePct,
    standardAppliedFxSpread: fields.appliedFxSpread,
    feeDiscountPct: fields.feeDiscountPct,
    tiers,
    transactionTypeCode: corridor.transactionTypeCode,
    fundingCurrencyId,
    payoutCurrencyId: corridor.payoutCurrencyId,
    opportunityType,
    corridor: {
      fxSource: corridor.fxSource,
      treasuryFxCostSpread: corridor.treasuryFxCostSpread,
      costFixedUsd: corridor.costFixedUsd,
      costVariablePct: corridor.costVariablePct,
      networkNeedApprovalRaw: corridor.networkNeedApprovalRaw,
      internalRaw: corridor.internalRaw,
      centralBankRaw: corridor.centralBankRaw,
    },
  })
}

/** A preview row's starting numbers — same seed used to build its promote-on-edit payload, so it never shows different numbers than the row it becomes. */
function previewFieldsFor(corridor: Corridor): EditableFields {
  const seed = seedQuoteCorridorFromCatalog(corridor)
  return {
    atvUsd: seed.atvUsd ?? 0,
    yearlyVolumeUsd: seed.yearlyVolumeUsd,
    yearlyTransactions: seed.yearlyTransactions,
    fixedFeeUsd: seed.fixedFeeUsd,
    variableFeePct: seed.variableFeePct,
    appliedFxSpread: seed.appliedFxSpread,
    feeDiscountPct: seed.feeDiscountPct ?? 0,
  }
}

function ApprovalBadge({
  label,
  needed,
  reasons,
}: {
  label: string
  needed: boolean
  reasons: string[]
}) {
  if (!needed) return null
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-200"
        >
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <PopoverTitle>{label} approval needed</PopoverTitle>
        <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

function ApprovalCell({
  needsFinancial,
  financialReasons,
  needsNetwork,
  networkReasons,
}: {
  needsFinancial: boolean
  financialReasons: string[]
  needsNetwork: boolean
  networkReasons: string[]
}) {
  if (!needsFinancial && !needsNetwork) {
    return <span className="text-xs text-muted-foreground">—</span>
  }
  return (
    <div className="flex justify-end gap-1">
      <ApprovalBadge label="Financial" needed={needsFinancial} reasons={financialReasons} />
      <ApprovalBadge label="Network" needed={needsNetwork} reasons={networkReasons} />
    </div>
  )
}

export function PricingTab({
  tabKey,
  quoteId,
}: {
  tabKey: string
  quoteId: number | null
}) {
  if (quoteId === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-24 text-center">
        <h2 className="text-lg font-semibold">Save the draft first</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Corridors are priced against a saved pricing request. Click "Save Draft" above, then come
          back to this tab to add corridors.
        </p>
      </div>
    )
  }

  return <PricingTabContent tabKey={tabKey} quoteId={quoteId} />
}

function PricingTabContent({ tabKey, quoteId }: { tabKey: string; quoteId: number }) {
  const { data, isLoading } = useQuote(quoteId)
  const { data: corridorCatalog } = useCorridorCatalog()
  const { data: currencies } = useCurrencies()

  const addCorridor = useAddQuoteCorridor(quoteId)
  const updateCorridor = useUpdateQuoteCorridor(quoteId)
  const removeCorridor = useRemoveQuoteCorridor(quoteId)

  const [selectedCorridorId, setSelectedCorridorId] = useState<number | null>(null)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  // Per-row in-progress edits, keyed by a string row key — `String(id)` for a
  // saved row, `preview-${corridorId}` for one still only matched by filters
  // — holding only the fields touched since the row last loaded/saved/
  // promoted. Cleared once the blur-triggered save (or promotion) succeeds.
  const [rowEdits, setRowEdits] = useState<Record<string, Partial<EditableFields> & { fundingCurrencyId?: number | null }>>({})
  // Per-row in-progress tier edits — replaces the whole tier set for that
  // row until "Save Tiers" is clicked, then cleared so the saved data takes over.
  const [tierDrafts, setTierDrafts] = useState<Record<string, CorridorTierInput[]>>({})
  const [expandedTierRows, setExpandedTierRows] = useState<Set<string>>(new Set())
  const [expandedDetailRows, setExpandedDetailRows] = useState<Set<string>>(new Set())
  // Corridor ids currently being promoted (POSTed) from a preview row — a
  // guard so two blur events in quick succession for the same still-unsaved
  // row don't both create a real row (the backend's 409-on-duplicate would
  // otherwise surface as a visible error).
  const [promotingCorridorIds, setPromotingCorridorIds] = useState<Set<number>>(new Set())
  // A saved row the user explicitly removed, or a preview row they explicitly
  // dismissed — kept client-side only, for this session, so it doesn't
  // immediately reappear as a preview row while it still matches the active
  // filters (the old app needs a whole `deleted_corridors` column + restore
  // modal to manage the fallout of NOT doing this; we just don't persist it).
  const [dismissedCorridorIds, setDismissedCorridorIds] = useState<Set<number>>(new Set())

  const quote = data?.quote
  const { filters } = useCorridorFilterFields(tabKey, quote)
  const restrictToUseCaseAllowedCountries = (quote?.useCases ?? []).some((u) =>
    RESTRICTED_USE_CASE_LABELS.has(u.label.toLowerCase())
  )
  const filterParams = { ...filters, restrictToUseCaseAllowedCountries }
  const { data: facets } = useCorridorFacets(filterParams)
  const { data: matches, isPending: matchesLoading, isError: matchesError } = useMatchingCorridors(filterParams, true)

  if (isLoading || !data) {
    return <Skeleton className="h-64" />
  }

  const opportunityType = data.quote.opportunityType ?? null
  const corridors = data.quote.corridors ?? []
  const savedCorridorIds = new Set(corridors.map((c) => c.corridorId))
  const previewCorridors = (matchesError ? [] : (matches ?? [])).filter(
    (c) => !savedCorridorIds.has(c.id) && !dismissedCorridorIds.has(c.id)
  )
  const displayRows: DisplayRow[] = [
    ...corridors.map((row): DisplayRow => ({ kind: 'saved', key: String(row.id), row })),
    ...previewCorridors.map((corridor): DisplayRow => ({
      kind: 'preview',
      key: `preview-${corridor.id}`,
      corridor,
    })),
  ]
  const availableCorridors = (corridorCatalog ?? []).filter((c) => !savedCorridorIds.has(c.id))
  const selectedCorridor = availableCorridors.find((c) => c.id === selectedCorridorId) ?? null

  const newCorridorPreview = selectedCorridor
    ? previewPricing(
        {
          atvUsd: draft.atvUsd ?? 0,
          yearlyVolumeUsd: draft.yearlyVolumeUsd,
          yearlyTransactions: draft.yearlyTransactions,
          fixedFeeUsd: draft.fixedFeeUsd,
          variableFeePct: draft.variableFeePct,
          appliedFxSpread: draft.appliedFxSpread,
          feeDiscountPct: draft.feeDiscountPct ?? 0,
        },
        selectedCorridor,
        draft.fundingCurrencyId ?? null,
        opportunityType
      )
    : null

  function handleAdd() {
    if (selectedCorridorId === null) return
    addCorridor.mutate(
      { corridorId: selectedCorridorId, ...draft },
      {
        onSuccess: () => {
          setSelectedCorridorId(null)
          setDraft(EMPTY_DRAFT)
        },
      }
    )
  }

  function fieldFor(key: string, saved: EditableFields, field: keyof EditableFields): number {
    return rowEdits[key]?.[field] ?? saved[field]
  }

  function handleFieldChange(key: string, field: keyof EditableFields, value: number) {
    setRowEdits((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }))
  }

  /**
   * Promotes a still-preview corridor to a real saved row on first edit —
   * seeded from the catalog's own reference data plus whatever the user has
   * typed so far, so the new row's numbers exactly match what the preview
   * row was already showing. `extra` covers edits that commit immediately
   * rather than on blur (the funding-currency dropdown).
   */
  function promoteRow(
    corridor: Corridor,
    key: string,
    extra: Partial<Omit<QuoteCorridorInput, 'corridorId'>> = {}
  ) {
    if (promotingCorridorIds.has(corridor.id)) return
    const sentEdits = rowEdits[key]
    const seed = seedQuoteCorridorFromCatalog(corridor)
    const payload: QuoteCorridorInput = { corridorId: corridor.id, ...seed, ...sentEdits, ...extra }

    setPromotingCorridorIds((prev) => new Set(prev).add(corridor.id))
    addCorridor.mutate(payload, {
      onSuccess: (created) => {
        setPromotingCorridorIds((prev) => {
          const next = new Set(prev)
          next.delete(corridor.id)
          return next
        })
        setRowEdits((prev) => {
          const latest = prev[key]
          const { [key]: _removed, ...rest } = prev
          // Only carry edits made *after* we snapshotted the payload above —
          // if nothing changed in the meantime, `latest` is still the same
          // object we already sent, so there's nothing left to reconcile.
          if (latest && latest !== sentEdits) {
            return { ...rest, [String(created.id)]: latest }
          }
          return rest
        })
        setExpandedDetailRows((prev) => {
          if (!prev.has(key)) return prev
          const next = new Set(prev)
          next.delete(key)
          next.add(String(created.id))
          return next
        })
      },
      onError: () => {
        setPromotingCorridorIds((prev) => {
          const next = new Set(prev)
          next.delete(corridor.id)
          return next
        })
      },
    })
  }

  function commitRow(item: DisplayRow) {
    const edits = rowEdits[item.key]
    if (!edits || Object.keys(edits).length === 0) return
    if (item.kind === 'saved') {
      updateCorridor.mutate(
        { corridorRowId: item.row.id, input: edits },
        {
          onSuccess: () => {
            setRowEdits((prev) => {
              const next = { ...prev }
              delete next[item.key]
              return next
            })
          },
        }
      )
    } else {
      promoteRow(item.corridor, item.key)
    }
  }

  function handleFundingCurrencyChange(item: DisplayRow, value: string) {
    if (item.kind === 'saved') {
      updateCorridor.mutate({ corridorRowId: item.row.id, input: { fundingCurrencyId: Number(value) } })
    } else {
      promoteRow(item.corridor, item.key, { fundingCurrencyId: Number(value) })
    }
  }

  function handleRemoveOrDismiss(item: DisplayRow) {
    if (item.kind === 'saved') {
      const corridorId = item.row.corridorId
      removeCorridor.mutate(item.row.id, {
        onSuccess: () => setDismissedCorridorIds((prev) => new Set(prev).add(corridorId)),
      })
    } else {
      setDismissedCorridorIds((prev) => new Set(prev).add(item.corridor.id))
    }
  }

  function tiersFor(row: QuoteCorridor): CorridorTierInput[] {
    return (
      tierDrafts[String(row.id)] ??
      (row.tiers ?? []).map((t) => ({
        tierNumber: t.tierNumber,
        yearlyVolumeUsd: t.yearlyVolumeUsd,
        fixedFeeUsd: t.fixedFeeUsd,
        variableFeePct: t.variableFeePct,
        appliedFxSpread: t.appliedFxSpread,
      }))
    )
  }

  function setPricingModel(rowId: number, pricingModel: PricingModel) {
    updateCorridor.mutate({ corridorRowId: rowId, input: { pricingModel } })
    if (pricingModel === 'tiered') {
      setExpandedTierRows((prev) => new Set(prev).add(String(rowId)))
    }
  }

  function updateTierField(
    rowId: number,
    currentTiers: CorridorTierInput[],
    tierNumber: number,
    field: keyof Omit<CorridorTierInput, 'tierNumber'>,
    value: number
  ) {
    setTierDrafts((prev) => ({
      ...prev,
      [String(rowId)]: currentTiers.map((t) =>
        t.tierNumber === tierNumber ? { ...t, [field]: value } : t
      ),
    }))
  }

  function addTier(rowId: number, currentTiers: CorridorTierInput[]) {
    const used = new Set(currentTiers.map((t) => t.tierNumber))
    const nextNumber = [1, 2, 3].find((n) => !used.has(n))
    if (nextNumber === undefined) return
    setTierDrafts((prev) => ({
      ...prev,
      [String(rowId)]: [...currentTiers, { tierNumber: nextNumber, ...EMPTY_TIER }],
    }))
  }

  function removeTier(rowId: number, currentTiers: CorridorTierInput[], tierNumber: number) {
    setTierDrafts((prev) => ({
      ...prev,
      [String(rowId)]: currentTiers.filter((t) => t.tierNumber !== tierNumber),
    }))
  }

  function saveTiers(rowId: number, currentTiers: CorridorTierInput[]) {
    updateCorridor.mutate(
      { corridorRowId: rowId, input: { tiers: currentTiers } },
      {
        onSuccess: () => {
          setTierDrafts((prev) => {
            const next = { ...prev }
            delete next[String(rowId)]
            return next
          })
        },
      }
    )
  }

  const previewRowCount = displayRows.filter((r) => r.kind === 'preview').length

  return (
    <div className="space-y-6">
      <CorridorsToOfferSection
        tabKey={tabKey}
        quote={data.quote}
        restrictToUseCaseAllowedCountries={restrictToUseCaseAllowedCountries}
      />

      <CollapsibleSection
        title="Priced Corridors"
        actions={
          previewRowCount > 0 ? (
            <span className="text-xs text-primary-foreground/80">
              {previewRowCount} previewing — not saved
            </span>
          ) : undefined
        }
      >
        {matchesLoading ? (
          <p role="status" className="mb-2 text-sm text-muted-foreground">Loading matching corridors…</p>
        ) : matchesError ? (
          <p role="alert" className="mb-2 text-sm text-destructive">Could not load matching corridors. Please try again.</p>
        ) : matches?.length === 0 ? (
          <p className="mb-2 text-sm text-muted-foreground">No catalog corridors match these filters. Any previously saved corridors are retained.</p>
        ) : null}
        {corridors.length > 0 && (
          <p className="mb-2 text-xs text-muted-foreground">{corridors.length} previously saved corridors; {previewRowCount} additional matching previews. Filters do not remove saved work.</p>
        )}
        {displayRows.length > 0 && (
          <div className="overflow-x-auto">
            {!matchesLoading && !matchesError && facets && (matches?.length ?? 0) < facets.totalMatched && (
              <p className="mb-2 text-xs text-muted-foreground">
                Previewing the first {matches?.length ?? 0} of {facets.totalMatched} matching
                corridors — narrow your filters to see the rest.
              </p>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
                  <th className="pb-2 pr-3 font-medium">Corridor</th>
                  <th className="pb-2 pr-3 font-medium">Pricing</th>
                  <th className="pb-2 pr-3 font-medium">Funding Currency</th>
                  <th className="pb-2 pr-3 font-medium">Source Currency</th>
                  <th className="pb-2 pr-3 text-right font-medium">Std Fixed Fee</th>
                  <th className="pb-2 pr-3 text-right font-medium">Std Variable Fee %</th>
                  <th className="pb-2 pr-3 text-right font-medium">ATV (USD)</th>
                  <th className="pb-2 pr-3 text-right font-medium">Yearly Volume</th>
                  <th className="pb-2 pr-3 text-right font-medium">Yearly Trx</th>
                  <th className="pb-2 pr-3 text-right font-medium">Fixed Fee</th>
                  <th className="pb-2 pr-3 text-right font-medium">Variable Fee %</th>
                  <th className="pb-2 pr-3 text-right font-medium">Fee Discount %</th>
                  <th className="pb-2 pr-3 text-right font-medium">FX Spread</th>
                  <th className="pb-2 pr-3 text-right font-medium">Revenue</th>
                  <th className="pb-2 pr-3 text-right font-medium">FX Margin %</th>
                  <th className="pb-2 pr-3 text-right font-medium">Margin Fee</th>
                  <th className="pb-2 pr-3 text-right font-medium">Margin Fee %</th>
                  <th className="pb-2 pr-3 text-right font-medium">Margin %</th>
                  <th className="pb-2 pr-3 text-right font-medium">Gross Margin %</th>
                  <th className="pb-2 pr-3 text-right font-medium">Take Rate</th>
                  <th className="pb-2 pr-3 text-right font-medium">Approval</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {displayRows.map((item) => {
                  const corridor = item.kind === 'saved' ? item.row.corridor : item.corridor
                  const savedRow = item.kind === 'saved' ? item.row : null
                  const isPreview = item.kind === 'preview'
                  const isPromoting = item.kind === 'preview' && promotingCorridorIds.has(item.corridor.id)
                  const saved: EditableFields =
                    item.kind === 'saved'
                      ? {
                          atvUsd: item.row.atvUsd ?? 0,
                          yearlyVolumeUsd: item.row.yearlyVolumeUsd,
                          yearlyTransactions: item.row.yearlyTransactions,
                          fixedFeeUsd: item.row.fixedFeeUsd,
                          variableFeePct: item.row.variableFeePct,
                          appliedFxSpread: item.row.appliedFxSpread,
                          feeDiscountPct: item.row.feeDiscountPct ?? 0,
                        }
                      : previewFieldsFor(item.corridor)
                  const current: EditableFields = {
                    atvUsd: fieldFor(item.key, saved, 'atvUsd'),
                    yearlyVolumeUsd: fieldFor(item.key, saved, 'yearlyVolumeUsd'),
                    yearlyTransactions: fieldFor(item.key, saved, 'yearlyTransactions'),
                    fixedFeeUsd: fieldFor(item.key, saved, 'fixedFeeUsd'),
                    variableFeePct: fieldFor(item.key, saved, 'variableFeePct'),
                    appliedFxSpread: fieldFor(item.key, saved, 'appliedFxSpread'),
                    feeDiscountPct: fieldFor(item.key, saved, 'feeDiscountPct'),
                  }
                  const isTiered = savedRow?.pricingModel === 'tiered'
                  const currentTiers = savedRow ? tiersFor(savedRow) : []
                  const fundingCurrencyId = savedRow
                    ? (savedRow.fundingCurrencyId ?? null)
                    : (rowEdits[item.key]?.fundingCurrencyId ?? null)
                  const previewSummary: PricingSummary | null = !corridor
                    ? null
                    : isTiered
                      ? previewTieredPricing(
                          current,
                          current.atvUsd,
                          currentTiers,
                          corridor,
                          fundingCurrencyId,
                          opportunityType
                        )
                      : previewPricing(current, corridor, fundingCurrencyId, opportunityType)
                  const isExpanded = expandedTierRows.has(item.key)
                  const tierVolumeTotal = currentTiers.reduce(
                    (sum, t) => sum + t.yearlyVolumeUsd,
                    0
                  )
                  const standardRemainder = current.yearlyVolumeUsd - tierVolumeTotal
                  const allocationErrors = validateTierAllocation(
                    current.yearlyVolumeUsd,
                    currentTiers
                  )
                  const fundingCurrencyObj = savedRow
                    ? savedRow.fundingCurrency
                    : (currencies ?? []).find((c) => c.id === fundingCurrencyId)

                  return (
                    <Fragment key={item.key}>
                      <tr
                        className={
                          isPreview
                            ? 'border-b bg-amber-50/70 last:border-0 dark:bg-amber-950/20'
                            : 'border-b last:border-0'
                        }
                      >
                        <td className="py-2 pr-3 font-medium">
                          <div className="flex items-center gap-2">
                            <span>
                              {corridor
                                ? corridorLabel(corridor)
                                : savedRow
                                  ? `#${savedRow.corridorId}`
                                  : ''}
                            </span>
                            {isPreview && (
                              <span className="shrink-0 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                                Not saved
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="text-xs font-normal text-muted-foreground underline hover:text-foreground"
                            onClick={() =>
                              setExpandedDetailRows((prev) => {
                                const next = new Set(prev)
                                if (next.has(item.key)) next.delete(item.key)
                                else next.add(item.key)
                                return next
                              })
                            }
                          >
                            {expandedDetailRows.has(item.key) ? 'Hide details' : 'Details'}
                          </button>
                        </td>
                        <td className="py-2 pr-3">
                          {isPreview ? (
                            <div className="w-28">
                              <SimpleSelect
                                value="standard"
                                onValueChange={() => {}}
                                options={[{ value: 'standard', label: 'Standard' }]}
                                disabled
                              />
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <div className="w-28">
                                <SimpleSelect
                                  value={savedRow!.pricingModel}
                                  onValueChange={(v) => setPricingModel(savedRow!.id, v as PricingModel)}
                                  options={[
                                    { value: 'standard', label: 'Standard' },
                                    { value: 'tiered', label: 'Tiered' },
                                  ]}
                                />
                              </div>
                              {isTiered && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setExpandedTierRows((prev) => {
                                      const next = new Set(prev)
                                      if (next.has(item.key)) next.delete(item.key)
                                      else next.add(item.key)
                                      return next
                                    })
                                  }
                                >
                                  {isExpanded ? 'Hide' : 'Edit'} tiers
                                </Button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          <div className="w-24">
                            <SimpleSelect
                              value={fundingCurrencyId ? String(fundingCurrencyId) : ''}
                              onValueChange={(v) => handleFundingCurrencyChange(item, v)}
                              options={(currencies ?? []).map((c) => ({
                                value: String(c.id),
                                label: c.isoCode3,
                              }))}
                              placeholder="—"
                            />
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {data.quote.sourceCurrency?.isoCode3 ?? '—'}
                        </td>
                        <td className="py-2 pr-3 text-right text-muted-foreground">
                          {corridor ? money(corridor.stdFixedFeeUsd) : '—'}
                        </td>
                        <td className="py-2 pr-3 text-right text-muted-foreground">
                          {corridor ? pct(corridor.stdVariableFeePct) : '—'}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Input
                            type="number"
                            value={current.atvUsd}
                            className="h-8 w-20"
                            onChange={(e) => handleFieldChange(item.key, 'atvUsd', Number(e.target.value))}
                            onBlur={() => commitRow(item)}
                          />
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Input
                            type="number"
                            value={current.yearlyVolumeUsd}
                            className="h-8 w-28"
                            onChange={(e) =>
                              handleFieldChange(item.key, 'yearlyVolumeUsd', Number(e.target.value))
                            }
                            onBlur={() => commitRow(item)}
                          />
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Input
                            type="number"
                            value={current.yearlyTransactions}
                            className="h-8 w-24"
                            onChange={(e) =>
                              handleFieldChange(
                                item.key,
                                'yearlyTransactions',
                                Number(e.target.value)
                              )
                            }
                            onBlur={() => commitRow(item)}
                          />
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Input
                            type="number"
                            value={current.fixedFeeUsd}
                            className="h-8 w-20"
                            onChange={(e) =>
                              handleFieldChange(item.key, 'fixedFeeUsd', Number(e.target.value))
                            }
                            onBlur={() => commitRow(item)}
                          />
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Input
                            type="number"
                            step="0.01"
                            value={current.variableFeePct}
                            className="h-8 w-20"
                            onChange={(e) =>
                              handleFieldChange(item.key, 'variableFeePct', Number(e.target.value))
                            }
                            onBlur={() => commitRow(item)}
                          />
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Input
                            type="number"
                            step="0.01"
                            value={current.feeDiscountPct}
                            className="h-8 w-20"
                            onChange={(e) =>
                              handleFieldChange(item.key, 'feeDiscountPct', Number(e.target.value))
                            }
                            onBlur={() => commitRow(item)}
                          />
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Input
                            type="number"
                            step="0.01"
                            value={current.appliedFxSpread}
                            className="h-8 w-20"
                            onChange={(e) =>
                              handleFieldChange(item.key, 'appliedFxSpread', Number(e.target.value))
                            }
                            onBlur={() => commitRow(item)}
                          />
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {previewSummary ? money(previewSummary.totalRevenue) : money(savedRow?.totalRevenue ?? null)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {previewSummary ? pct(previewSummary.fxMarginPct) : pct(savedRow?.fxMarginPct ?? null)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {previewSummary ? money(previewSummary.marginFee) : money(savedRow?.marginFee ?? null)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {previewSummary ? pct(previewSummary.marginFeePct) : pct(savedRow?.marginFeePct ?? null)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {previewSummary ? pct(previewSummary.marginPct) : pct(savedRow?.marginPct ?? null)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {previewSummary ? pct(previewSummary.grossMarginPct) : pct(savedRow?.grossMarginPct ?? null)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {previewSummary ? pct(previewSummary.takeRatePct) : pct(savedRow?.takeRatePct ?? null)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <ApprovalCell
                            needsFinancial={
                              previewSummary
                                ? previewSummary.needsFinancialApproval
                                : (savedRow?.needsFinancialApproval ?? false)
                            }
                            financialReasons={
                              previewSummary
                                ? previewSummary.financialApprovalReasons
                                : (savedRow?.financialApprovalReasons ?? [])
                            }
                            needsNetwork={
                              previewSummary
                                ? previewSummary.needsNetworkApproval
                                : (savedRow?.needsNetworkApproval ?? false)
                            }
                            networkReasons={
                              previewSummary
                                ? previewSummary.networkApprovalReasons
                                : (savedRow?.networkApprovalReasons ?? [])
                            }
                          />
                        </td>
                        <td className="py-2 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveOrDismiss(item)}
                            disabled={item.kind === 'saved' && removeCorridor.isPending}
                          >
                            {isPromoting ? 'Saving…' : item.kind === 'saved' ? 'Remove' : 'Dismiss'}
                          </Button>
                        </td>
                      </tr>
                      {expandedDetailRows.has(item.key) && corridor && (
                        <tr className="border-b bg-muted/20 last:border-0">
                          <td colSpan={21} className="p-3">
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                              <PreviewStat
                                label="Treasury FX Cost Spread %"
                                value={pct(
                                  corridor.treasuryFxCostSpread === null
                                    ? null
                                    : corridor.treasuryFxCostSpread * 100
                                )}
                              />
                              <PreviewStat
                                label="Fixed Cost (USD)"
                                value={money(corridor.costFixedUsd)}
                              />
                              <PreviewStat
                                label="Variable Cost %"
                                value={pct(
                                  corridor.costVariablePct === null
                                    ? null
                                    : corridor.costVariablePct * 100
                                )}
                              />
                              <PreviewStat
                                label="Historical ATV"
                                value={
                                  corridor.historicalAtv === null
                                    ? 'No data'
                                    : money(corridor.historicalAtv)
                                }
                              />
                              <PreviewStat
                                label={`Fixed Fee in ${fundingCurrencyObj?.isoCode3 ?? 'funding currency'}`}
                                value={feeInFundingCurrency(current.fixedFeeUsd, fundingCurrencyObj)}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                      {savedRow && isTiered && isExpanded && (
                        <tr className="border-b bg-muted/20 last:border-0">
                          <td colSpan={21} className="p-3">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-medium text-muted-foreground uppercase">
                                  Tiers — whatever volume isn't assigned below prices at the
                                  standard fields to the left
                                </p>
                                <span
                                  className={
                                    standardRemainder < 0
                                      ? 'text-xs font-medium text-red-600'
                                      : 'text-xs text-muted-foreground'
                                  }
                                >
                                  Standard remainder: {money(standardRemainder)}
                                </span>
                              </div>

                              {currentTiers.length === 0 && (
                                <p className="text-xs text-muted-foreground">
                                  No tiers yet — 100% of volume prices at the standard fields.
                                </p>
                              )}

                              {currentTiers
                                .slice()
                                .sort((a, b) => a.tierNumber - b.tierNumber)
                                .map((tier) => (
                                  <div
                                    key={tier.tierNumber}
                                    className="grid grid-cols-2 items-end gap-3 sm:grid-cols-3 lg:grid-cols-6"
                                  >
                                    <FormField label={`Tier ${tier.tierNumber} Volume (USD)`}>
                                      <Input
                                        type="number"
                                        value={tier.yearlyVolumeUsd}
                                        onChange={(e) =>
                                          updateTierField(
                                            savedRow.id,
                                            currentTiers,
                                            tier.tierNumber,
                                            'yearlyVolumeUsd',
                                            Number(e.target.value)
                                          )
                                        }
                                      />
                                    </FormField>
                                    <FormField label="Fixed Fee (USD)">
                                      <Input
                                        type="number"
                                        value={tier.fixedFeeUsd}
                                        onChange={(e) =>
                                          updateTierField(
                                            savedRow.id,
                                            currentTiers,
                                            tier.tierNumber,
                                            'fixedFeeUsd',
                                            Number(e.target.value)
                                          )
                                        }
                                      />
                                    </FormField>
                                    <FormField label="Variable Fee %">
                                      <Input
                                        type="number"
                                        step="0.01"
                                        value={tier.variableFeePct}
                                        onChange={(e) =>
                                          updateTierField(
                                            savedRow.id,
                                            currentTiers,
                                            tier.tierNumber,
                                            'variableFeePct',
                                            Number(e.target.value)
                                          )
                                        }
                                      />
                                    </FormField>
                                    <FormField label="FX Spread %">
                                      <Input
                                        type="number"
                                        step="0.01"
                                        value={tier.appliedFxSpread}
                                        onChange={(e) =>
                                          updateTierField(
                                            savedRow.id,
                                            currentTiers,
                                            tier.tierNumber,
                                            'appliedFxSpread',
                                            Number(e.target.value)
                                          )
                                        }
                                      />
                                    </FormField>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        removeTier(savedRow.id, currentTiers, tier.tierNumber)
                                      }
                                    >
                                      Remove tier
                                    </Button>
                                  </div>
                                ))}

                              {allocationErrors.length > 0 && (
                                <p className="text-xs text-red-600">{allocationErrors.join(' ')}</p>
                              )}

                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => addTier(savedRow.id, currentTiers)}
                                  disabled={currentTiers.length >= 3}
                                >
                                  Add tier
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => saveTiers(savedRow.id, currentTiers)}
                                  disabled={updateCorridor.isPending || allocationErrors.length > 0}
                                >
                                  Save tiers
                                </Button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Add a Corridor">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Corridor" required>
            <SimpleSelect
              value={selectedCorridorId ? String(selectedCorridorId) : ''}
              onValueChange={(v) => setSelectedCorridorId(Number(v))}
              options={availableCorridors.map((c) => ({
                value: String(c.id),
                label: `${c.country?.name ?? c.countryId} · ${c.serviceCode} · ${c.transactionTypeCode} · ${c.payoutCurrency?.isoCode3 ?? ''}`,
              }))}
              placeholder="Select a corridor…"
            />
          </FormField>
          <FormField label="Funding Currency">
            <SimpleSelect
              value={draft.fundingCurrencyId ? String(draft.fundingCurrencyId) : ''}
              onValueChange={(v) => setDraft((d) => ({ ...d, fundingCurrencyId: Number(v) }))}
              options={(currencies ?? []).map((c) => ({ value: String(c.id), label: c.isoCode3 }))}
            />
          </FormField>
          <FormField label="Yearly Volume (USD)">
            <Input
              type="number"
              value={draft.yearlyVolumeUsd}
              onChange={(e) => setDraft((d) => ({ ...d, yearlyVolumeUsd: Number(e.target.value) }))}
            />
          </FormField>
          <FormField label="Yearly Transactions">
            <Input
              type="number"
              value={draft.yearlyTransactions}
              onChange={(e) =>
                setDraft((d) => ({ ...d, yearlyTransactions: Number(e.target.value) }))
              }
            />
          </FormField>
          <FormField label="Fixed Fee (USD)">
            <Input
              type="number"
              value={draft.fixedFeeUsd}
              onChange={(e) => setDraft((d) => ({ ...d, fixedFeeUsd: Number(e.target.value) }))}
            />
          </FormField>
          <FormField label="Variable Fee %">
            <Input
              type="number"
              step="0.01"
              value={draft.variableFeePct}
              onChange={(e) => setDraft((d) => ({ ...d, variableFeePct: Number(e.target.value) }))}
            />
          </FormField>
          <FormField label="Applied FX Spread %">
            <Input
              type="number"
              step="0.01"
              value={draft.appliedFxSpread}
              onChange={(e) => setDraft((d) => ({ ...d, appliedFxSpread: Number(e.target.value) }))}
            />
          </FormField>
          <FormField label="Fee Discount %">
            <Input
              type="number"
              step="0.01"
              value={draft.feeDiscountPct}
              onChange={(e) => setDraft((d) => ({ ...d, feeDiscountPct: Number(e.target.value) }))}
            />
          </FormField>
        </div>

        {selectedCorridor && (
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-3 lg:grid-cols-4">
            <PreviewStat
              label="Std Fixed Fee (catalog)"
              value={money(selectedCorridor.stdFixedFeeUsd)}
            />
            <PreviewStat
              label="Std Variable Fee % (catalog)"
              value={pct(selectedCorridor.stdVariableFeePct)}
            />
            <PreviewStat
              label="Historical ATV"
              value={
                selectedCorridor.historicalAtv === null
                  ? 'No data'
                  : money(selectedCorridor.historicalAtv)
              }
            />
          </div>
        )}

        {selectedCorridor && newCorridorPreview && (
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-3 lg:grid-cols-6">
            <PreviewStat label="Revenue" value={money(newCorridorPreview.totalRevenue)} />
            <PreviewStat label="FX Margin %" value={pct(newCorridorPreview.fxMarginPct)} />
            <PreviewStat label="Margin Fee" value={money(newCorridorPreview.marginFee)} />
            <PreviewStat label="Margin %" value={pct(newCorridorPreview.marginPct)} />
            <PreviewStat label="Gross Margin %" value={pct(newCorridorPreview.grossMarginPct)} />
            <PreviewStat label="Take Rate" value={pct(newCorridorPreview.takeRatePct)} />
            <div className="flex flex-col justify-center">
              <span className="text-xs text-muted-foreground uppercase">Approval</span>
              <ApprovalCell
                needsFinancial={newCorridorPreview.needsFinancialApproval}
                financialReasons={newCorridorPreview.financialApprovalReasons}
                needsNetwork={newCorridorPreview.needsNetworkApproval}
                networkReasons={newCorridorPreview.networkApprovalReasons}
              />
            </div>
          </div>
        )}

        <Button
          className="mt-4"
          onClick={handleAdd}
          disabled={selectedCorridorId === null || addCorridor.isPending}
        >
          {addCorridor.isPending ? 'Adding…' : 'Add Corridor'}
        </Button>
      </CollapsibleSection>
    </div>
  )
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  )
}
