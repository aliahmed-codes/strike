import { useQuery } from '@tanstack/react-query'
import { mockCorridorStatus, type CorridorStatus } from '../data/mock-dashboard-data'

/**
 * MOCK — see mock-dashboard-data.ts. Replace the queryFn with a real
 * `apiClient.get('/dashboard/corridor-status')` once the corridor catalog
 * exists (FEATURES.md item #6); the return type is already what it should be.
 */
export function useCorridorStatus() {
  return useQuery<CorridorStatus>({
    queryKey: ['dashboard', 'corridor-status'],
    queryFn: () => new Promise((resolve) => setTimeout(() => resolve(mockCorridorStatus), 400)),
  })
}
