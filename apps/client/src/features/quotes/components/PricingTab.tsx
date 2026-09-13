import { useState } from 'react'
import type { QuoteCorridorInput } from '@strike/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useCorridorCatalog, useCurrencies } from '../api/useReferenceData'
import { useQuote } from '../api/useQuotes'
import { useAddQuoteCorridor, useRemoveQuoteCorridor, useUpdateQuoteCorridor } from '../api/useQuoteCorridors'
import { CollapsibleSection } from './CollapsibleSection'
import { FormField } from './FormField'
import { SimpleSelect } from './SimpleSelect'

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

  if (isLoading || !data) {
    return <Skeleton className="h-64" />
  }

  const corridors = data.quote.corridors ?? []
  const addedCorridorIds = new Set(corridors.map((c) => c.corridorId))
  const availableCorridors = (corridorCatalog ?? []).filter((c) => !addedCorridorIds.has(c.id))

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
                  <th className="pb-2 pr-3 text-right font-medium">Margin</th>
                  <th className="pb-2 pr-3 text-right font-medium">Take Rate</th>
                  <th className="pb-2 pr-3 text-right font-medium">Approval</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {corridors.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">
                      {row.corridor
                        ? `${row.corridor.country?.name ?? row.corridor.countryId} · ${row.corridor.serviceCode} · ${row.corridor.transactionTypeCode} · ${row.corridor.payoutCurrency?.isoCode3 ?? ''}`
                        : `#${row.corridorId}`}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <Input
                        type="number"
                        defaultValue={row.yearlyVolumeUsd}
                        className="h-8 w-28"
                        onBlur={(e) =>
                          updateCorridor.mutate({
                            corridorRowId: row.id,
                            input: { yearlyVolumeUsd: Number(e.target.value) },
                          })
                        }
                      />
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <Input
                        type="number"
                        defaultValue={row.yearlyTransactions}
                        className="h-8 w-24"
                        onBlur={(e) =>
                          updateCorridor.mutate({
                            corridorRowId: row.id,
                            input: { yearlyTransactions: Number(e.target.value) },
                          })
                        }
                      />
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <Input
                        type="number"
                        defaultValue={row.fixedFeeUsd}
                        className="h-8 w-20"
                        onBlur={(e) =>
                          updateCorridor.mutate({
                            corridorRowId: row.id,
                            input: { fixedFeeUsd: Number(e.target.value) },
                          })
                        }
                      />
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <Input
                        type="number"
                        step="0.01"
                        defaultValue={row.variableFeePct}
                        className="h-8 w-20"
                        onBlur={(e) =>
                          updateCorridor.mutate({
                            corridorRowId: row.id,
                            input: { variableFeePct: Number(e.target.value) },
                          })
                        }
                      />
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <Input
                        type="number"
                        step="0.01"
                        defaultValue={row.appliedFxSpread}
                        className="h-8 w-20"
                        onBlur={(e) =>
                          updateCorridor.mutate({
                            corridorRowId: row.id,
                            input: { appliedFxSpread: Number(e.target.value) },
                          })
                        }
                      />
                    </td>
                    <td className="py-2 pr-3 text-right">{money(row.totalRevenue)}</td>
                    <td className="py-2 pr-3 text-right">{money(row.totalMargin)}</td>
                    <td className="py-2 pr-3 text-right">{pct(row.takeRatePct)}</td>
                    <td className="py-2 pr-3 text-right">
                      {row.needsApproval ? (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                          Needed
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
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
                ))}
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
