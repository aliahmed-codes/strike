import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useCorridorStatus } from '../api/useCorridorStatus'
import { DashboardPanel } from './DashboardPanel'
import { ProgressBar } from './ProgressBar'
import { StatTile } from './StatTile'

const currency = (n: number) => `$${Math.round(n).toLocaleString()}`

export function CorridorStatusPanel() {
  const { data, isLoading } = useCorridorStatus()

  if (isLoading || !data) {
    return (
      <DashboardPanel title="Corridor Status">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-40" />
        <Skeleton className="h-32" />
      </DashboardPanel>
    )
  }

  return (
    <DashboardPanel title="Corridor Status">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Active Corridors" value={data.activeCorridors} />
        <StatTile label="Pending Activation" value={data.pendingActivation} />
        <StatTile label="Service Types" value={data.serviceTypes} />
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">Top Corridors by Volume</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th className="pb-2 font-medium">Region</th>
                <th className="pb-2 font-medium">Country</th>
                <th className="pb-2 font-medium">Service</th>
                <th className="pb-2 font-medium">Volume</th>
                <th className="pb-2 text-right font-medium">Growth</th>
              </tr>
            </thead>
            <tbody>
              {data.topCorridors.map((row) => (
                <tr key={`${row.region}-${row.country}`} className="border-b last:border-0">
                  <td className="py-2.5 font-medium">{row.region}</td>
                  <td className="py-2.5">{row.country}</td>
                  <td className="py-2.5">{row.service}</td>
                  <td className="py-2.5">{currency(row.volume)}</td>
                  <td className="py-2.5 text-right font-medium text-emerald-600">
                    +{row.growthPercent}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">Recent Activations</h3>
        <div className="space-y-3">
          {data.recentActivations.map((row) => (
            <div
              key={`${row.country}-${row.service}`}
              className="flex items-center justify-between text-sm"
            >
              <p className="font-medium">
                {row.country} <span className="font-normal text-muted-foreground">- {row.service}</span>
              </p>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground">{row.date}</span>
                <Badge
                  className={
                    row.status === 'active'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                  }
                >
                  {row.status === 'active' ? 'Active' : 'Pending'}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">Service Distribution</h3>
        <div className="space-y-4">
          {data.serviceDistribution.map((item) => (
            <ProgressBar
              key={item.label}
              label={item.label}
              valueLabel={`${item.percent}%`}
              percent={item.percent}
            />
          ))}
        </div>
      </div>
    </DashboardPanel>
  )
}
