import { useMutation, useQuery } from '@tanstack/react-query'
import type { QuoteLegalData } from '@strike/shared'
import { apiClient } from '@/lib/api-client'
import { fileNameFromDisposition, unwrapBlobError } from '@/lib/download-blob'

export const quoteLegalKeys = {
  detail: (quoteId: number) => ['quote-legal', quoteId] as const,
}

export function useQuoteLegal(quoteId: number | null) {
  return useQuery({
    queryKey: quoteLegalKeys.detail(quoteId ?? -1),
    queryFn: async () => (await apiClient.get<QuoteLegalData>(`/quotes/${quoteId}/legal`)).data,
    enabled: quoteId !== null,
  })
}

export function useDownloadLegalContract(quoteId: number) {
  return useMutation({
    mutationFn: async () => {
      try {
        const response = await apiClient.get<Blob>(`/quotes/${quoteId}/documents/legal-contract`, {
          responseType: 'blob',
        })
        return {
          blob: response.data,
          fileName: fileNameFromDisposition(
            response.headers['content-disposition'],
            'Legal Contract.xlsx'
          ),
        }
      } catch (error) {
        throw await unwrapBlobError(error)
      }
    },
  })
}
