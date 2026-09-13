import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { CorridorStatusPanel } from '../components/CorridorStatusPanel'
import { PaymentMetricsPanel } from '../components/PaymentMetricsPanel'

export function DashboardPage() {
  const navigate = useNavigate()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your pricing operations</p>
        </div>
        <Button onClick={() => navigate('/pricing-requests')}>Create Pricing Request</Button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <PaymentMetricsPanel />
        <CorridorStatusPanel />
      </div>
    </div>
  )
}
