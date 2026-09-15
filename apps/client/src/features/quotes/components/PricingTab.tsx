import { Fragment, useState } from 'react'
import {
  computeCorridorPricing,
  computeTieredCorridorPricing,
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
import { useCorridorCatalog, useCurrencies } from '../api/useReferenceData'
import { useQuote } from '../api/useQuotes'
import {
  useAddQuoteCorridor,
  useRemoveQuoteCorridor,
  useUpdateQuoteCorridor,
} from '../api/useQuoteCorridors'
import { CollapsibleSection } from './CollapsibleSection'
import { FormField } from './FormField'
import { SimpleSelect } from './SimpleSelect'

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
  tabKey: _tabKey,
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

  return <PricingTabContent quoteId={quoteId} />
}

function PricingTabContent({ quoteId }: { quoteId: number }) {
  const { data, isLoading } = useQuote(quoteId)
  const { data: corridorCatalog } = useCorridorCatalog()
  const { data: currencies } = useCurrencies()

  const addCorridor = useAddQuoteCorridor(quoteId)
  const updateCorridor = useUpdateQuoteCorridor(quoteId)
  const removeCorridor = useRemoveQuoteCorridor(quoteId)

  const [selectedCorridorId, setSelectedCorridorId] = useState<number | null>(null)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  // Per-row in-progress edits, keyed by quote_corridor row id — only the
  // fields the user has touched since the row last loaded/saved. Cleared
  // once the blur-triggered save for that row succeeds.
  const [rowEdits, setRowEdits] = useState<Record<number, Partial<EditableFields>>>({})
  // Per-row in-progress tier edits — replaces the whole tier set for that
  // row until "Save Tiers" is clicked, then cleared so the saved data takes over.
  const [tierDrafts, setTierDrafts] = useState<Record<number, CorridorTierInput[]>>({})
  const [expandedTierRows, setExpandedTierRows] = useState<Set<number>>(new Set())
  const [expandedDetailRows, setExpandedDetailRows] = useState<Set<number>>(new Set())

  if (isLoading || !data) {
    return <Skeleton className="h-64" />
  }

  const opportunityType = data.quote.opportunityType ?? null
  const corridors = data.quote.corridors ?? []
  const addedCorridorIds = new Set(corridors.map((c) => c.corridorId))
  const availableCorridors = (corridorCatalog ?? []).filter((c) => !addedCorridorIds.has(c.id))
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

  function fieldFor(rowId: number, saved: EditableFields, field: keyof EditableFields): number {
    return rowEdits[rowId]?.[field] ?? saved[field]
  }

  function handleFieldChange(rowId: number, field: keyof EditableFields, value: number) {
    setRowEdits((prev) => ({ ...prev, [rowId]: { ...prev[rowId], [field]: value } }))
  }

  function commitRow(rowId: number, saved: EditableFields) {
    const edits = rowEdits[rowId]
    if (!edits || Object.keys(edits).length === 0) return
    updateCorridor.mutate(
      { corridorRowId: rowId, input: edits },
      {
        onSuccess: () => {
          setRowEdits((prev) => {
            const next = { ...prev }
            delete next[rowId]
            return next
          })
        },
      }
    )
    void saved
  }

  function tiersFor(row: QuoteCorridor): CorridorTierInput[] {
    return (
      tierDrafts[row.id] ??
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
      setExpandedTierRows((prev) => new Set(prev).add(rowId))
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
      [rowId]: currentTiers.map((t) =>
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
      [rowId]: [...currentTiers, { tierNumber: nextNumber, ...EMPTY_TIER }],
    }))
  }

  function removeTier(rowId: number, currentTiers: CorridorTierInput[], tierNumber: number) {
    setTierDrafts((prev) => ({
      ...prev,
      [rowId]: currentTiers.filter((t) => t.tierNumber !== tierNumber),
    }))
  }

  function saveTiers(rowId: number, currentTiers: CorridorTierInput[]) {
    updateCorridor.mutate(
      { corridorRowId: rowId, input: { tiers: currentTiers } },
      {
        onSuccess: () => {
          setTierDrafts((prev) => {
            const next = { ...prev }
            delete next[rowId]
            return next
          })
        },
      }
    )
  }

  return (
    <div className="space-y-6">
      <CollapsibleSection title="Priced Corridors">
        {corridors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No corridors added yet.</p>
        ) : (
          <div className="overflow-x-auto">
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
                {corridors.map((row) => {
                  const saved: EditableFields = {
                    atvUsd: row.atvUsd ?? 0,
                    yearlyVolumeUsd: row.yearlyVolumeUsd,
                    yearlyTransactions: row.yearlyTransactions,
                    fixedFeeUsd: row.fixedFeeUsd,
                    variableFeePct: row.variableFeePct,
                    appliedFxSpread: row.appliedFxSpread,
                    feeDiscountPct: row.feeDiscountPct ?? 0,
                  }
                  const current: EditableFields = {
                    atvUsd: fieldFor(row.id, saved, 'atvUsd'),
                    yearlyVolumeUsd: fieldFor(row.id, saved, 'yearlyVolumeUsd'),
                    yearlyTransactions: fieldFor(row.id, saved, 'yearlyTransactions'),
                    fixedFeeUsd: fieldFor(row.id, saved, 'fixedFeeUsd'),
                    variableFeePct: fieldFor(row.id, saved, 'variableFeePct'),
                    appliedFxSpread: fieldFor(row.id, saved, 'appliedFxSpread'),
                    feeDiscountPct: fieldFor(row.id, saved, 'feeDiscountPct'),
                  }
                  const isTiered = row.pricingModel === 'tiered'
                  const currentTiers = tiersFor(row)
                  const preview: PricingSummary | null = !row.corridor
                    ? null
                    : isTiered
                      ? previewTieredPricing(
                          current,
                          current.atvUsd,
                          currentTiers,
                          row.corridor,
                          row.fundingCurrencyId ?? null,
                          opportunityType
                        )
                      : previewPricing(
                          current,
                          row.corridor,
                          row.fundingCurrencyId ?? null,
                          opportunityType
                        )
                  const isExpanded = expandedTierRows.has(row.id)
                  const tierVolumeTotal = currentTiers.reduce(
                    (sum, t) => sum + t.yearlyVolumeUsd,
                    0
                  )
                  const standardRemainder = current.yearlyVolumeUsd - tierVolumeTotal
                  const allocationErrors = validateTierAllocation(
                    current.yearlyVolumeUsd,
                    currentTiers
                  )

                  return (
                    <Fragment key={row.id}>
                      <tr className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium">
                          <div>
                            {row.corridor
                              ? `${row.corridor.country?.name ?? row.corridor.countryId} · ${row.corridor.serviceCode} · ${row.corridor.transactionTypeCode} · ${row.corridor.payoutCurrency?.isoCode3 ?? ''}`
                              : `#${row.corridorId}`}
                          </div>
                          <button
                            type="button"
                            className="text-xs font-normal text-muted-foreground underline hover:text-foreground"
                            onClick={() =>
                              setExpandedDetailRows((prev) => {
                                const next = new Set(prev)
                                if (next.has(row.id)) next.delete(row.id)
                                else next.add(row.id)
                                return next
                              })
                            }
                          >
                            {expandedDetailRows.has(row.id) ? 'Hide details' : 'Details'}
                          </button>
                        </td>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-1">
                            <div className="w-28">
                              <SimpleSelect
                                value={row.pricingModel}
                                onValueChange={(v) => setPricingModel(row.id, v as PricingModel)}
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
                                    if (next.has(row.id)) next.delete(row.id)
                                    else next.add(row.id)
                                    return next
                                  })
                                }
                              >
                                {isExpanded ? 'Hide' : 'Edit'} tiers
                              </Button>
                            )}
                          </div>
                        </td>
                        <td className="py-2 pr-3">
                          <div className="w-24">
                            <SimpleSelect
                              value={row.fundingCurrencyId ? String(row.fundingCurrencyId) : ''}
                              onValueChange={(v) =>
                                updateCorridor.mutate({
                                  corridorRowId: row.id,
                                  input: { fundingCurrencyId: Number(v) },
                                })
                              }
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
                          {row.corridor ? money(row.corridor.stdFixedFeeUsd) : '—'}
                        </td>
                        <td className="py-2 pr-3 text-right text-muted-foreground">
                          {row.corridor ? pct(row.corridor.stdVariableFeePct) : '—'}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Input
                            type="number"
                            value={current.atvUsd}
                            className="h-8 w-20"
                            onChange={(e) => handleFieldChange(row.id, 'atvUsd', Number(e.target.value))}
                            onBlur={() => commitRow(row.id, saved)}
                          />
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Input
                            type="number"
                            value={current.yearlyVolumeUsd}
                            className="h-8 w-28"
                            onChange={(e) =>
                              handleFieldChange(row.id, 'yearlyVolumeUsd', Number(e.target.value))
                            }
                            onBlur={() => commitRow(row.id, saved)}
                          />
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Input
                            type="number"
                            value={current.yearlyTransactions}
                            className="h-8 w-24"
                            onChange={(e) =>
                              handleFieldChange(
                                row.id,
                                'yearlyTransactions',
                                Number(e.target.value)
                              )
                            }
                            onBlur={() => commitRow(row.id, saved)}
                          />
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Input
                            type="number"
                            value={current.fixedFeeUsd}
                            className="h-8 w-20"
                            onChange={(e) =>
                              handleFieldChange(row.id, 'fixedFeeUsd', Number(e.target.value))
                            }
                            onBlur={() => commitRow(row.id, saved)}
                          />
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Input
                            type="number"
                            step="0.01"
                            value={current.variableFeePct}
                            className="h-8 w-20"
                            onChange={(e) =>
                              handleFieldChange(row.id, 'variableFeePct', Number(e.target.value))
                            }
                            onBlur={() => commitRow(row.id, saved)}
                          />
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Input
                            type="number"
                            step="0.01"
                            value={current.feeDiscountPct}
                            className="h-8 w-20"
                            onChange={(e) =>
                              handleFieldChange(row.id, 'feeDiscountPct', Number(e.target.value))
                            }
                            onBlur={() => commitRow(row.id, saved)}
                          />
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Input
                            type="number"
                            step="0.01"
                            value={current.appliedFxSpread}
                            className="h-8 w-20"
                            onChange={(e) =>
                              handleFieldChange(row.id, 'appliedFxSpread', Number(e.target.value))
                            }
                            onBlur={() => commitRow(row.id, saved)}
                          />
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {preview ? money(preview.totalRevenue) : money(row.totalRevenue)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {preview ? pct(preview.fxMarginPct) : pct(row.fxMarginPct)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {preview ? money(preview.marginFee) : money(row.marginFee)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {preview ? pct(preview.marginFeePct) : pct(row.marginFeePct)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {preview ? pct(preview.marginPct) : pct(row.marginPct)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {preview ? pct(preview.grossMarginPct) : pct(row.grossMarginPct)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {preview ? pct(preview.takeRatePct) : pct(row.takeRatePct)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <ApprovalCell
                            needsFinancial={
                              preview ? preview.needsFinancialApproval : row.needsFinancialApproval
                            }
                            financialReasons={
                              preview
                                ? preview.financialApprovalReasons
                                : (row.financialApprovalReasons ?? [])
                            }
                            needsNetwork={
                              preview ? preview.needsNetworkApproval : row.needsNetworkApproval
                            }
                            networkReasons={
                              preview
                                ? preview.networkApprovalReasons
                                : (row.networkApprovalReasons ?? [])
                            }
                          />
                        </td>
                        <td className="py-2 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeCorridor.mutate(row.id)}
                            disabled={removeCorridor.isPending}
                          >
                            Remove
                          </Button>
                        </td>
                      </tr>
                      {expandedDetailRows.has(row.id) && row.corridor && (
                        <tr className="border-b bg-muted/20 last:border-0">
                          <td colSpan={21} className="p-3">
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                              <PreviewStat
                                label="Treasury FX Cost Spread %"
                                value={pct(
                                  row.corridor.treasuryFxCostSpread === null
                                    ? null
                                    : row.corridor.treasuryFxCostSpread * 100
                                )}
                              />
                              <PreviewStat
                                label="Fixed Cost (USD)"
                                value={money(row.corridor.costFixedUsd)}
                              />
                              <PreviewStat
                                label="Variable Cost %"
                                value={pct(
                                  row.corridor.costVariablePct === null
                                    ? null
                                    : row.corridor.costVariablePct * 100
                                )}
                              />
                              <PreviewStat
                                label="Historical ATV"
                                value={
                                  row.corridor.historicalAtv === null
                                    ? 'No data'
                                    : money(row.corridor.historicalAtv)
                                }
                              />
                              <PreviewStat
                                label={`Fixed Fee in ${row.fundingCurrency?.isoCode3 ?? 'funding currency'}`}
                                value={feeInFundingCurrency(
                                  current.fixedFeeUsd,
                                  row.fundingCurrency
                                )}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                      {isTiered && isExpanded && (
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
                                            row.id,
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
                                            row.id,
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
                                            row.id,
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
                                            row.id,
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
                                        removeTier(row.id, currentTiers, tier.tierNumber)
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
                                  onClick={() => addTier(row.id, currentTiers)}
                                  disabled={currentTiers.length >= 3}
                                >
                                  Add tier
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => saveTiers(row.id, currentTiers)}
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
