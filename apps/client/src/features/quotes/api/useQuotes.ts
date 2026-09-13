import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Quote, QuoteFields, QuoteListItem, QuoteShowResponse } from '@strike/shared'
import { apiClient } from '@/lib/api-client'

export const quoteKeys = {
  list: ['quotes'] as const,
  detail: (id: number) => ['quotes', id] as const,
}

export function useQuotesList() {
  return useQuery({
    queryKey: quoteKeys.list,
    queryFn: async () => (await apiClient.get<QuoteListItem[]>('/quotes')).data,
  })
}

export function useQuote(id: number | null) {
  return useQuery({
    queryKey: quoteKeys.detail(id ?? -1),
    queryFn: async () => (await apiClient.get<QuoteShowResponse>(`/quotes/${id}`)).data,
    enabled: id !== null,
  })
}

export function useCreateQuote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (fields: QuoteFields) => (await apiClient.post<Quote>('/quotes', fields)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quoteKeys.list })
    },
  })
}

export function useUpdateQuote(id: number | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (fields: Partial<QuoteFields>) =>
      (await apiClient.patch<Quote>(`/quotes/${id}`, fields)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quoteKeys.list })
      if (id !== null) queryClient.invalidateQueries({ queryKey: quoteKeys.detail(id) })
    },
  })
}

export function useDeleteQuote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/quotes/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quoteKeys.list })
    },
  })
}
