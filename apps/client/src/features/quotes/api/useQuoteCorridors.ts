import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QuoteCorridor, QuoteCorridorInput } from '@strike/shared'
import { apiClient } from '@/lib/api-client'
import { quoteKeys } from './useQuotes'

interface BulkCorridorResult {
  deletedIds?: number[]
  restoredIds?: number[]
  notFoundIds: number[]
}

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
      queryClient.invalidateQueries({ queryKey: quoteKeys.deletedCorridors(quoteId) })
    },
  })
}

export function useDeletedQuoteCorridors(quoteId: number) {
  return useQuery({
    queryKey: quoteKeys.deletedCorridors(quoteId),
    queryFn: async () =>
      (await apiClient.get<QuoteCorridor[]>(`/quotes/${quoteId}/corridors/deleted`)).data,
  })
}

export function useBulkDeleteQuoteCorridors(quoteId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (corridorIds: number[]) =>
      (
        await apiClient.post<BulkCorridorResult>(`/quotes/${quoteId}/corridors/bulk-delete`, {
          corridorIds,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quoteKeys.detail(quoteId) })
      queryClient.invalidateQueries({ queryKey: quoteKeys.deletedCorridors(quoteId) })
    },
  })
}

export function useBulkRestoreQuoteCorridors(quoteId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (corridorIds: number[]) =>
      (
        await apiClient.post<BulkCorridorResult>(`/quotes/${quoteId}/corridors/bulk-restore`, {
          corridorIds,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quoteKeys.detail(quoteId) })
      queryClient.invalidateQueries({ queryKey: quoteKeys.deletedCorridors(quoteId) })
    },
  })
}
