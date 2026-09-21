import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { fileNameFromDisposition, unwrapBlobError } from '@/lib/download-blob'

export interface FeeAnnexVersion {
  version: number
  name: string
  content: string
  modifiedByName: string | null
  createdAt: string
  isStale: boolean
}

export interface FeeAnnexResponse {
  annex: FeeAnnexVersion | null
  suggestedName: string
  hasSetupFee: boolean
}

interface FillOrImportResult {
  content: string
  warnings: string[]
}

export const feeAnnexKeys = {
  detail: (quoteId: number) => ['quote-fee-annex', quoteId] as const,
}

export function useFeeAnnex(quoteId: number | null) {
  return useQuery({
    queryKey: feeAnnexKeys.detail(quoteId ?? -1),
    queryFn: async () =>
      (await apiClient.get<FeeAnnexResponse>(`/quotes/${quoteId}/fee-annex`)).data,
    enabled: quoteId !== null,
  })
}

export function useSaveFeeAnnex(quoteId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { name: string; content: string }) =>
      (
        await apiClient.put<{ annex: FeeAnnexVersion; changed: boolean }>(
          `/quotes/${quoteId}/fee-annex`,
          payload
        )
      ).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: feeAnnexKeys.detail(quoteId) })
    },
  })
}

/** Fills a document from the quote's current data without saving it (used for the initial fill and Refresh). */
export function useFillFeeAnnex(quoteId: number) {
  return useMutation({
    mutationFn: async (content: string) =>
      (
        await apiClient.post<FillOrImportResult>(`/quotes/${quoteId}/fee-annex/fill`, { content })
      ).data,
  })
}

export function useImportFeeAnnexTemplate(quoteId: number) {
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      return (
        await apiClient.post<FillOrImportResult & { fileName: string }>(
          `/quotes/${quoteId}/fee-annex/import`,
          formData
        )
      ).data
    },
  })
}

function useDownloadFeeAnnex(quoteId: number, format: 'pdf' | 'docx') {
  const mime =
    format === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  return useMutation({
    mutationFn: async () => {
      try {
        const response = await apiClient.get<Blob>(`/quotes/${quoteId}/fee-annex/${format}`, {
          responseType: 'blob',
          headers: { Accept: mime },
        })
        return {
          blob: response.data,
          fileName: fileNameFromDisposition(
            response.headers['content-disposition'],
            `Fee Annex.${format}`
          ),
        }
      } catch (error) {
        throw await unwrapBlobError(error)
      }
    },
  })
}

export function useDownloadFeeAnnexPdf(quoteId: number) {
  return useDownloadFeeAnnex(quoteId, 'pdf')
}

export function useDownloadFeeAnnexDocx(quoteId: number) {
  return useDownloadFeeAnnex(quoteId, 'docx')
}
