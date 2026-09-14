import { useState } from 'react'
import { computeCorridorPricing, type Corridor, type QuoteCorridorInput } from '@strike/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { useCorridorCatalog, useCurrencies } from '../api/useReferenceData'
import { useQuote } from '../api/useQuotes'
import { useAddQuoteCorridor, useRemoveQuoteCorridor, useUpdateQuoteCorridor } from '../api/useQuoteCorridors'
import { CollapsibleSection } from './CollapsibleSection'
import { FormField } from './FormField'
import { SimpleSelect } from './SimpleSelect'

interface EditableFields {
  yearlyVolumeUsd: number
  yearlyTransactions: number
  fixedFeeUsd: number
  variableFeePct: number
  appliedFxSpread: number
  feeDiscountPct: number
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

const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(2)}%`)
const money = (n: number | null) => (n === null ? '—' : `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`)

/** Live-preview math — the exact same function the backend uses to compute and validate on save, so this can never drift from what actually gets persisted. */
function previewPricing(
  fields: EditableFields,
  corridor: Corridor,
  fundingCurrencyId: number | null,
  opportunityType: string | null
) {
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

function ApprovalBadge({ label, needed, reasons }: { label: string; needed: boolean; reasons: string[] }) {
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

export function PricingTab({ tabKey: _tabKey, quoteId }: { tabKey: string; quoteId: number | null }) {
  if (quoteId === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-24 text-center">
        <h2 className="text-lg font-semibold">Save the draft first</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Corridors are priced against a saved pricing request. Click "Save Draft" above, then come back to
          this tab to add corridors.
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
                  <th className="pb-2 pr-3 text-right font-medium">Yearly Volume</th>
                  <th className="pb-2 pr-3 text-right font-medium">Yearly Trx</th>
                  <th className="pb-2 pr-3 text-right font-medium">Fixed Fee</th>
                  <th className="pb-2 pr-3 text-right font-medium">Variable Fee %</th>
                  <th className="pb-2 pr-3 text-right font-medium">FX Spread</th>
                  <th className="pb-2 pr-3 text-right font-medium">Revenue</th>
                  <th className="pb-2 pr-3 text-right font-medium">FX Margin %</th>
                  <th className="pb-2 pr-3 text-right font-medium">Margin Fee</th>
                  <th className="pb-2 pr-3 text-right font-medium">Gross Margin %</th>
                  <th className="pb-2 pr-3 text-right font-medium">Take Rate</th>
                  <th className="pb-2 pr-3 text-right font-medium">Approval</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {corridors.map((row) => {
                  const saved: EditableFields = {
                    yearlyVolumeUsd: row.yearlyVolumeUsd,
                    yearlyTransactions: row.yearlyTransactions,
                    fixedFeeUsd: row.fixedFeeUsd,
                    variableFeePct: row.variableFeePct,
                    appliedFxSpread: row.appliedFxSpread,
                    feeDiscountPct: row.feeDiscountPct ?? 0,
                  }
                  const current: EditableFields = {
                    yearlyVolumeUsd: fieldFor(row.id, saved, 'yearlyVolumeUsd'),
                    yearlyTransactions: fieldFor(row.id, saved, 'yearlyTransactions'),
                    fixedFeeUsd: fieldFor(row.id, saved, 'fixedFeeUsd'),
                    variableFeePct: fieldFor(row.id, saved, 'variableFeePct'),
                    appliedFxSpread: fieldFor(row.id, saved, 'appliedFxSpread'),
                    feeDiscountPct: fieldFor(row.id, saved, 'feeDiscountPct'),
                  }
                  const preview = row.corridor
                    ? previewPricing(current, row.corridor, row.fundingCurrencyId ?? null, opportunityType)
                    : null

                  return (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">
                        {row.corridor
                          ? `${row.corridor.country?.name ?? row.corridor.countryId} · ${row.corridor.serviceCode} · ${row.corridor.transactionTypeCode} · ${row.corridor.payoutCurrency?.isoCode3 ?? ''}`
                          : `#${row.corridorId}`}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <Input
                          type="number"
                          value={current.yearlyVolumeUsd}
                          className="h-8 w-28"
                          onChange={(e) => handleFieldChange(row.id, 'yearlyVolumeUsd', Number(e.target.value))}
                          onBlur={() => commitRow(row.id, saved)}
                        />
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <Input
                          type="number"
                          value={current.yearlyTransactions}
                          className="h-8 w-24"
                          onChange={(e) => handleFieldChange(row.id, 'yearlyTransactions', Number(e.target.value))}
                          onBlur={() => commitRow(row.id, saved)}
                        />
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <Input
                          type="number"
                          value={current.fixedFeeUsd}
                          className="h-8 w-20"
                          onChange={(e) => handleFieldChange(row.id, 'fixedFeeUsd', Number(e.target.value))}
                          onBlur={() => commitRow(row.id, saved)}
                        />
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <Input
                          type="number"
                          step="0.01"
                          value={current.variableFeePct}
                          className="h-8 w-20"
                          onChange={(e) => handleFieldChange(row.id, 'variableFeePct', Number(e.target.value))}
                          onBlur={() => commitRow(row.id, saved)}
                        />
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <Input
                          type="number"
                          step="0.01"
                          value={current.appliedFxSpread}
                          className="h-8 w-20"
                          onChange={(e) => handleFieldChange(row.id, 'appliedFxSpread', Number(e.target.value))}
                          onBlur={() => commitRow(row.id, saved)}
                        />
                      </td>
                      <td className="py-2 pr-3 text-right">{preview ? money(preview.totalRevenue) : money(row.totalRevenue)}</td>
                      <td className="py-2 pr-3 text-right">{preview ? pct(preview.fxMarginPct) : pct(row.fxMarginPct)}</td>
                      <td className="py-2 pr-3 text-right">{preview ? money(preview.marginFee) : money(row.marginFee)}</td>
                      <td className="py-2 pr-3 text-right">{preview ? pct(preview.grossMarginPct) : pct(row.grossMarginPct)}</td>
                      <td className="py-2 pr-3 text-right">{preview ? pct(preview.takeRatePct) : pct(row.takeRatePct)}</td>
                      <td className="py-2 pr-3 text-right">
                        <ApprovalCell
                          needsFinancial={preview ? preview.needsFinancialApproval : row.needsFinancialApproval}
                          financialReasons={preview ? preview.financialApprovalReasons : (row.financialApprovalReasons ?? [])}
                          needsNetwork={preview ? preview.needsNetworkApproval : row.needsNetworkApproval}
                          networkReasons={preview ? preview.networkApprovalReasons : (row.networkApprovalReasons ?? [])}
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
              onChange={(e) => setDraft((d) => ({ ...d, yearlyTransactions: Number(e.target.value) }))}
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

        {selectedCorridor && newCorridorPreview && (
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-3 lg:grid-cols-6">
            <PreviewStat label="Revenue" value={money(newCorridorPreview.totalRevenue)} />
            <PreviewStat label="FX Margin %" value={pct(newCorridorPreview.fxMarginPct)} />
            <PreviewStat label="Margin Fee" value={money(newCorridorPreview.marginFee)} />
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
