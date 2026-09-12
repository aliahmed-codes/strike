import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { clearToken } from '@/lib/token-storage'
import { authKeys } from './query-keys'

export function useLogout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      await apiClient.post('/auth/logout')
    },
    onSettled: () => {
      clearToken()
      queryClient.setQueryData(authKeys.me, null)
    },
  })
}
