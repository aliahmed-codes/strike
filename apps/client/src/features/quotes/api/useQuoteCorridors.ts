import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { QuoteCorridor, QuoteCorridorInput } from '@strike/shared'
import { apiClient } from '@/lib/api-client'
import { quoteKeys } from './useQuotes'

export function useAddQuoteCorridor(quoteId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: QuoteCorridorInput) =>
      (await apiClient.post<QuoteCorridor>(`/quotes/${quoteId}/corridors`, input)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quoteKeys.detail(quoteId) })
    },
  })
}

export function useUpdateQuoteCorridor(quoteId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      corridorRowId,
      input,
    }: {
      corridorRowId: number
      input: Partial<QuoteCorridorInput>
    }) =>
      (await apiClient.patch<QuoteCorridor>(`/quotes/${quoteId}/corridors/${corridorRowId}`, input))
        .data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quoteKeys.detail(quoteId) })
    },
  })
}

export function useRemoveQuoteCorridor(quoteId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (corridorRowId: number) => {
      await apiClient.delete(`/quotes/${quoteId}/corridors/${corridorRowId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quoteKeys.detail(quoteId) })
    },
  })
}
