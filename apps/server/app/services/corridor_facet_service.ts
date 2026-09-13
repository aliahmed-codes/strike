import db from '@adonisjs/lucid/services/db'

/**
 * Powers the "Corridors to Offer" picker: for each filter dimension, how
 * many corridors match if every *other* active filter is applied (so
 * picking a region narrows the country/service/etc. counts, but a
 * dimension's own counts reflect what's available if you changed just
 * that one).
 */
export interface CorridorFacetFilters {
  regionId?: number
  countryId?: number
  serviceCode?: string
  transactionTypeCode?: string
  payoutCurrencyId?: number
  payerCode?: string
}

export interface FacetOption {
  value: string | number
  count: number
}

export interface CorridorFacets {
  totalAvailable: number
  totalMatched: number
  regions: FacetOption[]
  countries: FacetOption[]
  services: FacetOption[]
  transactionTypes: FacetOption[]
  payoutCurrencies: FacetOption[]
  payers: FacetOption[]
}

function filteredQuery(filters: CorridorFacetFilters, exclude?: keyof CorridorFacetFilters) {
  const query = db.from('corridors').join('countries', 'corridors.country_id', 'countries.id')

  if (filters.regionId && exclude !== 'regionId') {
    query.where('countries.region_id', filters.regionId)
  }
  if (filters.countryId && exclude !== 'countryId') {
    query.where('corridors.country_id', filters.countryId)
  }
  if (filters.serviceCode && exclude !== 'serviceCode') {
    query.where('corridors.service_code', filters.serviceCode)
  }
  if (filters.transactionTypeCode && exclude !== 'transactionTypeCode') {
    query.where('corridors.transaction_type_code', filters.transactionTypeCode)
  }
  if (filters.payoutCurrencyId && exclude !== 'payoutCurrencyId') {
    query.where('corridors.payout_currency_id', filters.payoutCurrencyId)
  }
  if (filters.payerCode && exclude !== 'payerCode') {
    query.where('corridors.payer_code', filters.payerCode)
  }

  return query
}

function toOptions(rows: { value: string | number; count: string | number }[]): FacetOption[] {
  return rows.map((row) => ({ value: row.value, count: Number(row.count) }))
}

export async function computeCorridorFacets(
  filters: CorridorFacetFilters
): Promise<CorridorFacets> {
  const [
    totalAvailable,
    totalMatched,
    regions,
    countries,
    services,
    transactionTypes,
    payoutCurrencies,
    payers,
  ] = await Promise.all([
    db.from('corridors').count('* as count').first(),
    filteredQuery(filters).count('* as count').first(),
    filteredQuery(filters, 'regionId')
      .select('countries.region_id as value')
      .count('* as count')
      .groupBy('countries.region_id'),
    filteredQuery(filters, 'countryId')
      .select('corridors.country_id as value')
      .count('* as count')
      .groupBy('corridors.country_id'),
    filteredQuery(filters, 'serviceCode')
      .select('corridors.service_code as value')
      .count('* as count')
      .groupBy('corridors.service_code'),
    filteredQuery(filters, 'transactionTypeCode')
      .select('corridors.transaction_type_code as value')
      .count('* as count')
      .groupBy('corridors.transaction_type_code'),
    filteredQuery(filters, 'payoutCurrencyId')
      .select('corridors.payout_currency_id as value')
      .count('* as count')
      .groupBy('corridors.payout_currency_id'),
    filteredQuery(filters, 'payerCode')
      .select('corridors.payer_code as value')
      .count('* as count')
      .groupBy('corridors.payer_code'),
  ])

  return {
    totalAvailable: Number(totalAvailable!.count),
    totalMatched: Number(totalMatched!.count),
    regions: toOptions(regions),
    countries: toOptions(countries),
    services: toOptions(services),
    transactionTypes: toOptions(transactionTypes),
    payoutCurrencies: toOptions(payoutCurrencies),
    payers: toOptions(payers),
  }
}
