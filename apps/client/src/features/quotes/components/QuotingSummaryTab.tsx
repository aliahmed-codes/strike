import { AlertTriangle } from 'lucide-react'
import { useQuoteSummary, type QuoteSummaryResponse } from '../api/useQuoteSummary'
import { CollapsibleSection } from './CollapsibleSection'

const money = (n: number | null) =>
  n === null ? '—' : `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
const wholeDollars = (n: number) => `$${Math.round(n).toLocaleString()}`

export function QuotingSummaryTab({ quoteId }: { quoteId: number | null }) {
  if (quoteId === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-24 text-center">
        <h2 className="text-lg font-semibold">Save the draft first</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          The Quoting Summary rolls up a saved pricing request. Click "Save Draft" above, then come
          back to this tab.
        </p>
      </div>
    )
  }

  return <QuotingSummaryTabContent quoteId={quoteId} />
}

function QuotingSummaryTabContent({ quoteId }: { quoteId: number }) {
  const { data: summary, isLoading } = useQuoteSummary(quoteId)

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading summary…</p>
  }
  if (summary === undefined) {
    return <p className="text-sm text-destructive">Couldn't load the summary for this quote.</p>
  }

  const { partner, contract, setupFee, completeness } = summary
  const corridorCount = completeness.corridorCount
  const missing = [
    completeness.partnerCountryMissing && "Partner country isn't set — add it on the Summary tab.",
    completeness.partnerRegionMissing &&
      !completeness.partnerCountryMissing &&
      "Partner region couldn't be determined.",
    !completeness.hasSetupFee && 'No Setup Fee has been saved yet.',
  ].filter((message): message is string => typeof message === 'string')

  return (
    <div className="space-y-6">
      {corridorCount > 0 ? (
        <p className="text-sm text-muted-foreground">
          A summary of the pricing quote for {partner.name}, including setup fees, commitment fees
          and projected revenue, based on {corridorCount} saved corridor
          {corridorCount !== 1 ? 's' : ''}.
        </p>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center">
          <h2 className="text-lg font-semibold">No priced corridors yet</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            To see financial projections and the regional analysis, go to the Pricing tab, add
            corridors and click "Save Edited Corridors". Only saved corridors with a yearly volume
            above zero are included.
          </p>
        </div>
      )}

      {missing.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">This summary is incomplete:</p>
            <ul className="mt-1 list-disc pl-5">
              {missing.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CollapsibleSection title="Partner Information" defaultOpen>
          <div className="grid grid-cols-2 gap-4">
            <SummaryStat label="Partner Name" value={partner.name} />
            <SummaryStat label="Region" value={partner.regionName ?? '—'} />
            <SummaryStat label="Country" value={partner.countryName ?? '—'} />
            <SummaryStat label="Partner Type" value={partner.partnerType ?? '—'} />
            <SummaryStat label="Opportunity Owner" value={partner.ownerName} />
            <SummaryStat label="PR Code" value={partner.prCode ?? 'N/A'} />
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Contract Details" defaultOpen>
          <div className="grid grid-cols-2 gap-4">
            <SummaryStat
              label="Contract Length"
              value={
                contract.contractLengthYears === null ? '—' : `${contract.contractLengthYears} year(s)`
              }
            />
            <SummaryStat
              label="Currency Pairs"
              value={contract.uniqueCurrencyPairCount.toLocaleString()}
            />
            <SummaryStat
              label="Total Corridors"
              value={contract.totalCorridorRowCount.toLocaleString()}
            />
            <SummaryStat label="Monthly Commitment" value={money(contract.monthlyCommitmentFee)} />
            <SummaryStat
              label="Waived Months"
              value={contract.waivedMonths === null ? '—' : String(contract.waivedMonths)}
            />
            <SummaryStat label="Total Contract Value" value={money(contract.totalContractValue)} />
          </div>
        </CollapsibleSection>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CollapsibleSection title="Setup Fees" defaultOpen>
          {completeness.hasSetupFee ? (
            <SetupFeeSection setupFee={setupFee} />
          ) : (
            <p className="text-sm text-muted-foreground">No Setup Fee has been saved yet.</p>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Financial Projections" defaultOpen>
          <ProjectionsTable
            projections={summary.corridorProjections}
            contractLengthYears={contract.contractLengthYears}
          />
        </CollapsibleSection>
      </div>

      <CollapsibleSection title="Corridor Summary by Region" defaultOpen>
        {corridorCount > 0 ? (
          <RegionTable
            rows={summary.corridorsByRegion}
            totals={summary.corridorsByRegionTotals}
          />
        ) : (
          <p className="text-sm text-muted-foreground">No priced corridors yet.</p>
        )}
      </CollapsibleSection>
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs text-muted-foreground uppercase">{label}</p>
    </div>
  )
}

function SetupFeeSection({ setupFee }: { setupFee: QuoteSummaryResponse['setupFee'] }) {
  const isNetwork = setupFee.feeType === 'network'
  const milestones = setupFee.paymentMilestones.filter((m) => m.milestone && m.percentage > 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <SummaryStat
          label={isNetwork ? 'Network Joining Fee' : 'Set Up Fee'}
          value={money(setupFee.quotedPrice)}
        />
        <SummaryStat
          label={`Total ${isNetwork ? 'Network Joining' : 'Setup'} Fee`}
          value={money(setupFee.quotedPrice)}
        />
        <SummaryStat
          label="Payment Terms"
          value={setupFee.paymentSchedule === 'custom' ? 'Custom Payment Schedule' : 'Due upon signature (100%)'}
        />
      </div>
      {milestones.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Payment Milestones
          </p>
          <ul className="space-y-1 text-sm">
            {milestones.map((m, index) => (
              <li key={index} className="flex justify-between border-b py-1 last:border-0">
                <span>{m.milestone}</span>
                <span className="font-medium">
                  {m.percentage}%{m.description && ` (${m.description})`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

const HEAD_ROW = 'border-b text-left text-xs tracking-wide text-muted-foreground uppercase'
const TOTAL_ROW = 'border-t font-bold'

function ProjectionsTable({
  projections,
  contractLengthYears,
}: {
  projections: QuoteSummaryResponse['corridorProjections']
  contractLengthYears: number | null
}) {
  // Only the committed years are shown (at most 3), and the total is labelled
  // with that same count — the old screen labelled it with the full contract
  // length while summing at most 3 years.
  const yearCount = Math.max(1, Math.min(3, Math.ceil(contractLengthYears ?? 3)))
  const rows = (['year1', 'year2', 'year3'] as const).slice(0, yearCount).map((key) => projections[key])

  const total = rows.reduce(
    (sum, row) => ({
      volume: sum.volume + row.volume,
      transactions: sum.transactions + row.transactions,
      revenue: sum.revenue + row.revenue,
    }),
    { volume: 0, transactions: 0, revenue: 0 }
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className={HEAD_ROW}>
            <th className="pb-2 pr-3">Year</th>
            <th className="pb-2 pr-3">Volume</th>
            <th className="pb-2 pr-3">Transactions</th>
            <th className="pb-2 pr-3">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b">
              <td className="py-1.5 pr-3 font-medium">Year {index + 1}</td>
              <td className="py-1.5 pr-3">{wholeDollars(row.volume)}</td>
              <td className="py-1.5 pr-3">{Math.round(row.transactions).toLocaleString()}</td>
              <td className="py-1.5 pr-3">{wholeDollars(row.revenue)}</td>
            </tr>
          ))}
          <tr className={TOTAL_ROW}>
            <td className="py-1.5 pr-3">{yearCount}-Year Total</td>
            <td className="py-1.5 pr-3">{wholeDollars(total.volume)}</td>
            <td className="py-1.5 pr-3">{Math.round(total.transactions).toLocaleString()}</td>
            <td className="py-1.5 pr-3">{wholeDollars(total.revenue)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted-foreground">
        Corridor revenue only — see the P&amp;L tab for setup and commitment fees.
      </p>
    </div>
  )
}

function RegionTable({
  rows,
  totals,
}: {
  rows: QuoteSummaryResponse['corridorsByRegion']
  totals: QuoteSummaryResponse['corridorsByRegionTotals']
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className={HEAD_ROW}>
            <th className="pb-2 pr-3">Region</th>
            <th className="pb-2 pr-3">Countries</th>
            <th className="pb-2 pr-3">Corridors</th>
            <th className="pb-2 pr-3">Avg. Fee (USD)</th>
            <th className="pb-2 pr-3">Avg. FX Spread (%)</th>
            <th className="pb-2 pr-3">Expected Volume</th>
            <th className="pb-2 pr-3">Projected Revenue</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.regionId ?? 'unknown'} className="border-b">
              <td className="py-1.5 pr-3 font-medium">{row.regionName ?? 'Unknown'}</td>
              <td className="py-1.5 pr-3">{row.countryCount}</td>
              <td className="py-1.5 pr-3">{row.corridorCount}</td>
              <td className="py-1.5 pr-3">${row.averageFeeUsd.toFixed(2)}</td>
              <td className="py-1.5 pr-3">{row.averageFxSpreadPct.toFixed(2)}%</td>
              <td className="py-1.5 pr-3">{money(row.expectedVolumeUsd)}</td>
              <td className="py-1.5 pr-3">{money(row.projectedRevenueUsd)}</td>
            </tr>
          ))}
          <tr className={TOTAL_ROW}>
            <td className="py-1.5 pr-3">Total</td>
            <td className="py-1.5 pr-3">{totals.countryCount}</td>
            <td className="py-1.5 pr-3">{totals.corridorCount}</td>
            <td className="py-1.5 pr-3" />
            <td className="py-1.5 pr-3" />
            <td className="py-1.5 pr-3">{money(totals.expectedVolumeUsd)}</td>
            <td className="py-1.5 pr-3">{money(totals.projectedRevenueUsd)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
