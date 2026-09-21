import { useQuery } from '@tanstack/react-query'
import type { RegionSummaryRow } from '@strike/shared'
import { apiClient } from '@/lib/api-client'
import type { QuotePnlResponse } from './useQuotePnl'

export interface QuoteSummaryResponse {
  partner: {
    name: string
    regionName: string | null
    countryName: string | null
    partnerType: string | null
    ownerName: string
    prCode: string | null
  }
  contract: {
    contractLengthYears: number | null
    uniqueCurrencyPairCount: number
    totalCorridorRowCount: number
    monthlyCommitmentFee: number | null
    waivedMonths: number | null
    totalContractValue: number | null
  }
  setupFee: {
    feeType: 'setup' | 'network' | null
    quotedPrice: number | null
    totalContractValue: number | null
    year1CommittedRevenue: number | null
    finalCommitmentFee: number | null
    paymentSchedule: 'full' | 'custom' | null
    // Only populated for a custom schedule, already in saved order.
    paymentMilestones: { milestone: string; percentage: number; description: string | null }[]
  }
  financialProjections: QuotePnlResponse
  corridorProjections: Record<
    'year1' | 'year2' | 'year3',
    { volume: number; transactions: number; revenue: number }
  >
  corridorsByRegion: RegionSummaryRow[]
  corridorsByRegionTotals: RegionSummaryRow
  completeness: {
    corridorCount: number
    hasSetupFee: boolean
    partnerRegionMissing: boolean
    partnerCountryMissing: boolean
  }
}

export const quoteSummaryKeys = {
  detail: (quoteId: number) => ['quote-summary', quoteId] as const,
}

export function useQuoteSummary(quoteId: number | null) {
  return useQuery({
    queryKey: quoteSummaryKeys.detail(quoteId ?? -1),
    queryFn: async () =>
      (await apiClient.get<QuoteSummaryResponse>(`/quotes/${quoteId}/summary`)).data,
    enabled: quoteId !== null,
  })
}
