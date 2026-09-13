import { useQuery } from '@tanstack/react-query'
import { mockPaymentMetrics, type PaymentMetrics } from '../data/mock-dashboard-data'

/**
 * MOCK — see mock-dashboard-data.ts. Replace the queryFn with a real
 * `apiClient.get('/dashboard/payment-metrics')` once that endpoint exists
 * (FEATURES.md item #4/#6); the return type is already what it should be.
 */
export function useDashboardMetrics() {
  return useQuery<PaymentMetrics>({
    queryKey: ['dashboard', 'payment-metrics'],
    queryFn: () => new Promise((resolve) => setTimeout(() => resolve(mockPaymentMetrics), 400)),
  })
}
