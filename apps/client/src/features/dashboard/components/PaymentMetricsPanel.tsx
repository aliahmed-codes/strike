import { Skeleton } from '@/components/ui/skeleton'
import { useDashboardMetrics } from '../api/useDashboardMetrics'
import { DashboardPanel } from './DashboardPanel'
import { ProgressBar } from './ProgressBar'
import { StatTile } from './StatTile'

const currency = (n: number) => `$${Math.round(n).toLocaleString()}`

export function PaymentMetricsPanel() {
  const { data, isLoading } = useDashboardMetrics()

  if (isLoading || !data) {
    return (
      <DashboardPanel title="Payment Metrics">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-40" />
        <Skeleton className="h-32" />
      </DashboardPanel>
    )
  }

  const maxRevenue = Math.max(...data.revenueBreakdown.map((r) => r.amount))
  const revenueBarColors = ['bg-blue-500', 'bg-emerald-500', 'bg-blue-500', 'bg-emerald-500']

  return (
    <DashboardPanel title="Payment Metrics">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label="Total Volume"
          value={data.totalVolume}
          format={currency}
          caption="All corridors, last 12 months"
        />
        <StatTile
          label="Total Transactions"
          value={data.totalTransactions}
          caption="All corridors, last 12 months"
        />
        <StatTile
          label="ATV"
          value={data.averageTransactionValue}
          format={currency}
          caption="Average Transaction Value"
        />
        <StatTile
          label="FX Margin"
          value={data.fxMargin}
          format={currency}
          caption="Revenue from FX spread"
          accent="positive"
        />
        <StatTile
          label="FX Margin %"
          value={data.fxMarginPercent}
          format={(n) => `${n.toFixed(1)}%`}
          caption="% of total revenue"
          accent="positive"
        />
        <StatTile
          label="Take Rate"
          value={data.takeRatePercent}
          format={(n) => `${n.toFixed(2)}%`}
          caption="Revenue per unit of volume"
          accent="info"
        />
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">Revenue Breakdown</h3>
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          {data.revenueBreakdown.map((item, i) => (
            <ProgressBar
              key={item.label}
              label={item.label}
              valueLabel={currency(item.amount)}
              percent={(item.amount / maxRevenue) * 100}
              barClassName={revenueBarColors[i % revenueBarColors.length]}
            />
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">Performance by Region</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th className="pb-2 font-medium">Region</th>
                <th className="pb-2 font-medium">Volume</th>
                <th className="pb-2 font-medium">Transactions</th>
                <th className="pb-2 text-right font-medium">Growth</th>
              </tr>
            </thead>
            <tbody>
              {data.performanceByRegion.map((row) => (
                <tr key={row.region} className="border-b last:border-0">
                  <td className="py-2.5 font-medium">{row.region}</td>
                  <td className="py-2.5">{currency(row.volume)}</td>
                  <td className="py-2.5">{row.transactions.toLocaleString()}</td>
                  <td className="py-2.5 text-right font-medium text-emerald-600">
                    +{row.growthPercent}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardPanel>
  )
}
