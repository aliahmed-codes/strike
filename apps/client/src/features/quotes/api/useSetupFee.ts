import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SetupFee, SetupFeeFields, SetupFeeResponse } from '@strike/shared'
import { apiClient } from '@/lib/api-client'

export const setupFeeKeys = {
  detail: (quoteId: number) => ['setup-fee', quoteId] as const,
}

export function useSetupFee(quoteId: number | null) {
  return useQuery({
    queryKey: setupFeeKeys.detail(quoteId ?? -1),
    queryFn: async () =>
      (await apiClient.get<SetupFeeResponse>(`/quotes/${quoteId}/setup-fee`)).data.setupFee,
    enabled: quoteId !== null,
  })
}

export function useUpdateSetupFee(quoteId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (fields: SetupFeeFields) =>
      (
        await apiClient.put<{ setupFee: SetupFee }>(`/quotes/${quoteId}/setup-fee`, fields)
      ).data.setupFee,
    onSuccess: (setupFee) => {
      queryClient.setQueryData(setupFeeKeys.detail(quoteId), setupFee)
    },
  })
}
