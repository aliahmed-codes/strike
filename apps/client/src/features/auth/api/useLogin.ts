import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AuthSession, LoginPayload } from '@strike/shared'
import { apiClient } from '@/lib/api-client'
import { setToken } from '@/lib/token-storage'
import { authKeys } from './query-keys'

export function useLogin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: LoginPayload) => {
      const { data } = await apiClient.post<AuthSession>('/auth/login', payload)
      return data
    },
    onSuccess: (data) => {
      setToken(data.token)
      queryClient.setQueryData(authKeys.me, data.user)
    },
  })
}
