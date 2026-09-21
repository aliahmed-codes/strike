import { isAxiosError } from 'axios'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import type { LegalOtherLineItem, QuoteLegalData } from '@strike/shared'
import { Button } from '@/components/ui/button'
import { getApiErrorMessage } from '@/lib/api-error'
import { saveBlob } from '@/lib/download-blob'
import {
  useDownloadFeeAnnexDocx,
  useDownloadFeeAnnexPdf,
  useFeeAnnex,
} from '../api/useQuoteFeeAnnex'
import { useDownloadLegalContract, useQuoteLegal } from '../api/useQuoteLegal'
import { CollapsibleSection } from './CollapsibleSection'
import { FeeAnnexEditorDialog } from './FeeAnnexEditorDialog'

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`

function otherItemValue(item: LegalOtherLineItem): string {
  if (item.kind === 'text') return item.text ?? '—'
  if (item.kind === 'percentage') return `${item.amount}%`
  return money(item.amount ?? 0)
}

function blockersFrom(error: unknown): string[] {
  if (!isAxiosError(error)) return []
  const blockers = (error.response?.data as { blockers?: unknown } | undefined)?.blockers
  return Array.isArray(blockers) ? blockers.filter((b): b is string => typeof b === 'string') : []
}

export function LegalTab({ quoteId }: { quoteId: number | null }) {
  if (quoteId === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-24 text-center">
        <h2 className="text-lg font-semibold">Save the draft first</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Legal documents are generated from a saved pricing request. Click "Save Draft" above, then
          come back to this tab.
        </p>
      </div>
    )
  }

  return <LegalTabContent quoteId={quoteId} />
}

function LegalTabContent({ quoteId }: { quoteId: number }) {
  const { data: legal, isLoading } = useQuoteLegal(quoteId)
  const download = useDownloadLegalContract(quoteId)

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading legal terms…</p>
  }
  if (legal === undefined) {
    return <p className="text-sm text-destructive">Couldn't load the legal terms for this quote.</p>
  }

  const isBlocked = legal.blockers.length > 0
  const downloadBlockers = blockersFrom(download.error)

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Review pricing terms and generate legal contracts based on the agreed pricing parameters.
        This tab shows saved data only.
      </p>

      {!legal.isApproved && (
        <Notice>
          This quote isn't approved yet — the Legal Contract you generate is marked as a DRAFT.
        </Notice>
      )}

      {isBlocked && (
        <Notice title="A legal contract can't be generated yet:" items={legal.blockers} />
      )}

      <CollapsibleSection title="Final Quotation" defaultOpen>
        <p className="text-xs text-muted-foreground">Quotation Info (Read-only)</p>
        <FeesSection legal={legal} />
        <CorridorsSection legal={legal} />
      </CollapsibleSection>

      <CollapsibleSection title="Contract Actions" defaultOpen>
        <div className="space-y-3">
          <h3 className="font-medium">Contract Generation</h3>
          <p className="text-sm text-muted-foreground">
            Generate a legal contract based on the pricing parameters above.
          </p>
          <Button
            disabled={isBlocked || download.isPending}
            title={isBlocked ? 'Resolve the items listed above first' : undefined}
            onClick={() =>
              download.mutate(undefined, {
                onSuccess: ({ blob, fileName }) => saveBlob(blob, fileName),
              })
            }
          >
            {download.isPending ? 'Generating…' : 'Generate Legal Contract'}
          </Button>
          {download.isError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
              <p>{getApiErrorMessage(download.error)}</p>
              {downloadBlockers.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {downloadBlockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 space-y-3 border-t pt-6">
          <FeeAnnexSection quoteId={quoteId} isApproved={legal.isApproved} />
        </div>
      </CollapsibleSection>
    </div>
  )
}

function FeeAnnexSection({ quoteId, isApproved }: { quoteId: number; isApproved: boolean }) {
  const { data: annexData, isLoading } = useFeeAnnex(quoteId)
  const downloadPdf = useDownloadFeeAnnexPdf(quoteId)
  const downloadDocx = useDownloadFeeAnnexDocx(quoteId)
  const [editorOpen, setEditorOpen] = useState(false)

  const annex = annexData?.annex ?? null
  const downloadDisabledReason = !isApproved
    ? 'Available once the quote is approved'
    : !annex
      ? 'Save a Fee Annex first'
      : undefined

  return (
    <>
      <h3 className="font-medium">Fee Annex</h3>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : annex ? (
        <p className="text-sm text-muted-foreground">
          Version {annex.version}
          {annex.modifiedByName ? ` · saved by ${annex.modifiedByName}` : ''} ·{' '}
          {new Date(annex.createdAt).toLocaleString()}
          {annex.isStale && (
            <span className="ml-2 text-amber-600 dark:text-amber-400">
              (out of date with the quote's current data)
            </span>
          )}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">No Fee Annex saved yet.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setEditorOpen(true)}>
          {annex ? 'Edit / Preview' : 'Create Fee Annex'}
        </Button>
        <Button
          variant="outline"
          disabled={Boolean(downloadDisabledReason) || downloadPdf.isPending}
          title={downloadDisabledReason}
          onClick={() =>
            downloadPdf.mutate(undefined, {
              onSuccess: ({ blob, fileName }) => saveBlob(blob, fileName),
            })
          }
        >
          {downloadPdf.isPending ? 'Generating…' : 'Download PDF'}
        </Button>
        <Button
          variant="outline"
          disabled={Boolean(downloadDisabledReason) || downloadDocx.isPending}
          title={downloadDisabledReason}
          onClick={() =>
            downloadDocx.mutate(undefined, {
              onSuccess: ({ blob, fileName }) => saveBlob(blob, fileName),
            })
          }
        >
          {downloadDocx.isPending ? 'Generating…' : 'Download DOCX'}
        </Button>
      </div>
      {(downloadPdf.isError || downloadDocx.isError) && (
        <p className="text-sm text-destructive">
          {getApiErrorMessage(downloadPdf.error ?? downloadDocx.error)}
        </p>
      )}

      <FeeAnnexEditorDialog quoteId={quoteId} open={editorOpen} onOpenChange={setEditorOpen} />
    </>
  )
}

function Notice({ title, items, children }: { title?: string; items?: string[]; children?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        {title && <p className="font-medium">{title}</p>}
        {children}
        {items && (
          <ul className="mt-1 list-disc pl-5">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs text-muted-foreground uppercase">{label}</p>
    </div>
  )
}

function FeesSection({ legal }: { legal: QuoteLegalData }) {
  return (
    <div className="space-y-3">
      <h3 className="font-medium">Set Up Fees &amp; Fees</h3>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="grid grid-cols-2 gap-4">
          <Stat
            label={legal.oneOffFee?.label ?? 'Set Up Fee'}
            value={legal.oneOffFee ? money(legal.oneOffFee.amount) : '—'}
          />
          <Stat label="Fee currency" value={legal.feeCurrency ?? '—'} />
          <Stat
            label="Source Currency"
            value={legal.sourceCurrencies.length > 0 ? legal.sourceCurrencies.join(', ') : '—'}
          />
          <Stat
            label="Contract length (years)"
            value={legal.contractYears === null ? '—' : String(legal.contractYears)}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th className="pb-2 pr-3">Other pricing line items</th>
                <th className="pb-2 pr-3">Price (USD)</th>
              </tr>
            </thead>
            <tbody>
              {legal.otherLineItems.length === 0 ? (
                <tr>
                  <td colSpan={2} className="py-1.5 text-muted-foreground">
                    No other pricing line items.
                  </td>
                </tr>
              ) : (
                legal.otherLineItems.map((item) => (
                  <tr key={item.label} className="border-b last:border-0">
                    <td className="py-1.5 pr-3 font-medium">{item.label}</td>
                    <td className="py-1.5 pr-3">{otherItemValue(item)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function CorridorsSection({ legal }: { legal: QuoteLegalData }) {
  const hiddenFx = !legal.showFxSpread || !legal.showFxSource

  return (
    <div className="space-y-3">
      <h3 className="font-medium">Corridors</h3>
      <div className="space-y-0.5 text-sm">
        <p>Total corridors included: {legal.corridorCount}</p>
        <p>Countries: {legal.countryCount} countries</p>
        <p>Services: {legal.services.length > 0 ? legal.services.join(', ') : '—'}</p>
      </div>

      {legal.corridorRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No priced corridors yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th className="pb-2 pr-3">Country</th>
                <th className="pb-2 pr-3">Service</th>
                <th className="pb-2 pr-3">Transaction Type</th>
                <th className="pb-2 pr-3">Payout Currency</th>
                <th className="pb-2 pr-3">Payer</th>
                {legal.hasMultipleFundingCurrencies && (
                  <th className="pb-2 pr-3">Funding Currency</th>
                )}
                {legal.hasTiers && <th className="pb-2 pr-3">Tier</th>}
                <th className="pb-2 pr-3">Fee Currency</th>
                <th className="pb-2 pr-3">Fixed Fee</th>
                <th className="pb-2 pr-3">Variable Fee</th>
                {legal.hasFeeDiscount && <th className="pb-2 pr-3">Fee Discount</th>}
                {legal.showFxSpread && <th className="pb-2 pr-3">FX Spread</th>}
                {legal.showFxSource && <th className="pb-2 pr-3">FX Source</th>}
              </tr>
            </thead>
            <tbody>
              {legal.corridorRows.map((row, index) => (
                <tr key={index} className="border-b last:border-0">
                  <td className="py-1.5 pr-3 font-medium">{row.country}</td>
                  <td className="py-1.5 pr-3">{row.service}</td>
                  <td className="py-1.5 pr-3">{row.transactionType}</td>
                  <td className="py-1.5 pr-3">{row.payoutCurrency}</td>
                  <td className="py-1.5 pr-3">{row.payer}</td>
                  {legal.hasMultipleFundingCurrencies && (
                    <td className="py-1.5 pr-3">{row.fundingCurrency ?? '—'}</td>
                  )}
                  {legal.hasTiers && (
                    <td className="py-1.5 pr-3">{row.tier === null ? '—' : `Tier ${row.tier}`}</td>
                  )}
                  <td className="py-1.5 pr-3">{row.feeCurrency}</td>
                  <td className="py-1.5 pr-3">{row.fixedFee.toFixed(2)}</td>
                  <td className="py-1.5 pr-3">{row.variableFeePct.toFixed(2)}%</td>
                  {legal.hasFeeDiscount && (
                    <td className="py-1.5 pr-3">{row.feeDiscountPct.toFixed(2)}%</td>
                  )}
                  {legal.showFxSpread && (
                    <td className="py-1.5 pr-3">{(row.fxSpreadPct ?? 0).toFixed(2)}%</td>
                  )}
                  {legal.showFxSource && <td className="py-1.5 pr-3">{row.fxSource || '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hiddenFx && (
        <p className="text-xs text-muted-foreground">
          FX Spread / FX Source are left out of the contract when "Show in contract" is off on the
          Summary tab.
        </p>
      )}
    </div>
  )
}
