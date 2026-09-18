import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QuotePnlResult } from '@strike/shared'
import { apiClient } from '@/lib/api-client'

export interface QuotePnlResponse {
  inputs: { year2GrowthPct: number; year3GrowthPct: number }
  years: QuotePnlResult
  completeness: { corridorCount: number; hasSetupFee: boolean }
  needsApproval: boolean
  approvalReasons: string[]
}

export interface UpdateQuotePnlFields {
  year2GrowthPct: number
  year3GrowthPct: number
}

export const quotePnlKeys = {
  detail: (quoteId: number) => ['pnl', quoteId] as const,
}

export function useQuotePnl(quoteId: number | null) {
  return useQuery({
    queryKey: quotePnlKeys.detail(quoteId ?? -1),
    queryFn: async () => (await apiClient.get<QuotePnlResponse>(`/quotes/${quoteId}/pnl`)).data,
    enabled: quoteId !== null,
  })
}

export function useUpdateQuotePnl(quoteId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (fields: UpdateQuotePnlFields) =>
      (await apiClient.put<QuotePnlResponse>(`/quotes/${quoteId}/pnl`, fields)).data,
    onSuccess: (data) => {
      queryClient.setQueryData(quotePnlKeys.detail(quoteId), data)
    },
  })
}
