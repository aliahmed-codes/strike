import { useQuery } from '@tanstack/react-query'
import type {
  Corridor,
  CorridorFacets,
  Country,
  Currency,
  IcpNode,
  IntegrationType,
  Region,
  UseCase,
} from '@strike/shared'
import { apiClient } from '@/lib/api-client'

export const referenceKeys = {
  regions: ['reference', 'regions'] as const,
  countries: ['reference', 'countries'] as const,
  currencies: ['reference', 'currencies'] as const,
  useCases: ['reference', 'use-cases'] as const,
  integrationTypes: ['reference', 'integration-types'] as const,
  icpNodes: ['reference', 'icp-nodes'] as const,
  corridors: (filters?: Record<string, string | number>) =>
    ['reference', 'corridors', filters ?? {}] as const,
  corridorFacets: (filters: string) =>
    ['reference', 'corridors', 'facets', filters] as const,
  matchingCorridors: (filters: string) =>
    ['reference', 'corridors', 'matching', filters] as const,
}

export function useRegions() {
  return useQuery({
    queryKey: referenceKeys.regions,
    queryFn: async () => (await apiClient.get<Region[]>('/reference/regions')).data,
  })
}

export function useCountries() {
  return useQuery({
    queryKey: referenceKeys.countries,
    queryFn: async () => (await apiClient.get<Country[]>('/reference/countries')).data,
  })
}

export function useCurrencies() {
  return useQuery({
    queryKey: referenceKeys.currencies,
    queryFn: async () => (await apiClient.get<Currency[]>('/reference/currencies')).data,
  })
}

export function useUseCases() {
  return useQuery({
    queryKey: referenceKeys.useCases,
    queryFn: async () => (await apiClient.get<UseCase[]>('/reference/use-cases')).data,
  })
}

export function useIntegrationTypes() {
  return useQuery({
    queryKey: referenceKeys.integrationTypes,
    queryFn: async () => (await apiClient.get<IntegrationType[]>('/reference/integration-types')).data,
  })
}

export function useIcpNodes() {
  return useQuery({
    queryKey: referenceKeys.icpNodes,
    queryFn: async () => (await apiClient.get<IcpNode[]>('/reference/icp-nodes')).data,
  })
}

export interface CorridorCatalogFilters {
  countryId?: number
  serviceCode?: string
  transactionTypeCode?: string
}

export function useCorridorCatalog(filters: CorridorCatalogFilters = {}) {
  return useQuery({
    queryKey: referenceKeys.corridors(filters as Record<string, string | number>),
    queryFn: async () =>
      (await apiClient.get<Corridor[]>('/reference/corridors', { params: filters })).data,
  })
}

export interface CorridorFacetFilters {
  regionIds?: number[]
  countryIds?: number[]
  serviceCodes?: string[]
  transactionTypeCodes?: string[]
  payoutCurrencyIds?: number[]
  payerCodes?: string[]
  hideUsdSwift?: boolean
  restrictToUseCaseAllowedCountries?: boolean
}

function serializeFacetFilters(filters: CorridorFacetFilters): string {
  const params = new URLSearchParams()
  for (const key of [
    'regionIds',
    'countryIds',
    'serviceCodes',
    'transactionTypeCodes',
    'payoutCurrencyIds',
    'payerCodes',
  ] as const) {
    for (const value of filters[key] ?? []) params.append(`${key}[]`, String(value))
  }
  if (filters.hideUsdSwift) params.set('hideUsdSwift', 'true')
  if (filters.restrictToUseCaseAllowedCountries) params.set('restrictToUseCaseAllowedCountries', 'true')
  return params.toString()
}

export function useCorridorFacets(filters: CorridorFacetFilters = {}) {
  const params = serializeFacetFilters(filters)
  return useQuery({
    queryKey: referenceKeys.corridorFacets(params),
    queryFn: async ({ signal }) =>
      (await apiClient.get<CorridorFacets>(`/reference/corridors/facets?${params}`, { signal })).data,
  })
}

/** Powers "Bulk Add by Filter" — the actual matching corridors (capped server-side), not just facet counts. */
export function useMatchingCorridors(filters: CorridorFacetFilters, enabled: boolean) {
  const params = serializeFacetFilters(filters)
  return useQuery({
    queryKey: referenceKeys.matchingCorridors(params),
    queryFn: async ({ signal }) =>
      (await apiClient.get<{ corridors: Corridor[] }>(`/reference/corridors/matching?${params}`, { signal }))
        .data.corridors,
    enabled,
  })
}
