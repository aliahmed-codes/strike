import { useQuery } from '@tanstack/react-query'
import type { AuthUser } from '@strike/shared'
import { apiClient } from '@/lib/api-client'
import { getToken } from '@/lib/token-storage'
import { authKeys } from './query-keys'

export function useMe() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: async () => {
      const { data } = await apiClient.get<AuthUser>('/auth/me')
      return data
    },
    enabled: Boolean(getToken()),
    retry: false,
  })
}
