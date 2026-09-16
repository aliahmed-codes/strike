import db from '@adonisjs/lucid/services/db'

/**
 * Powers the "Corridors to Offer" picker, matching the old app's real
 * behavior exactly (verified against its `CorridorsToOffer.tsx`):
 *
 * - Region is a one-way top-level filter: picking a region narrows every
 *   other panel, but the Region panel's own counts are never narrowed by
 *   anything (not even by other filters) — they always reflect the full
 *   eligible set.
 * - The other five panels (Country, Service, Transaction Type, Payout
 *   Currency, Payer) form a fully mutual facet: each one's counts are
 *   narrowed by every *other* active filter (region included), but never
 *   by its own.
 * - Every panel always lists every value that exists anywhere in the
 *   eligible set — a value with 0 matches under the current filters still
 *   appears (with count 0) so the UI can show it disabled rather than
 *   removing it.
 * - "Hide USD SWIFT" excludes any corridor whose payer contains "swift
 *   wire transfer" from every count (including Region's).
 * - When the quote's use cases include "Last Mile Payout" or "Account
 *   Top-Up", the old app restricts the entire picker to a fixed allow-list
 *   of countries (a compliance rule, not a data-quality one) — that's why
 *   e.g. Pakistan is invisible there for those use cases even though the
 *   underlying corridor data has it.
 */

// Old app's "Jayanth's whitelist" for the Last Mile Payout / Account Top-Up
// use cases — EEA+EFTA, Hong Kong, and a handful of LatAm/Africa/Asia
// countries, expressed as ISO alpha-3 codes (name-matching is too fragile —
// e.g. this dataset spells Bolivia "Bolivia (Plurinational State of)").
const RESTRICTED_USE_CASE_ALLOWED_COUNTRY_CODES = [
  'AUT',
  'BEL',
  'BGR',
  'HRV',
  'CYP',
  'CZE',
  'DNK',
  'EST',
  'FIN',
  'FRA',
  'DEU',
  'GRC',
  'HUN',
  'ISL',
  'IRL',
  'ITA',
  'LVA',
  'LTU',
  'LIE',
  'LUX',
  'MLT',
  'NLD',
  'NOR',
  'POL',
  'PRT',
  'ROU',
  'SVK',
  'SVN',
  'ESP',
  'SWE',
  'CHE',
  'HKG',
  'ARG',
  'BOL',
  'BRA',
  'CHL',
  'MEX',
  'PER',
  'KEN',
  'ZAF',
  'IDN',
  'PHL',
]

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

export interface FacetOption {
  value: string | number
  label: string
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

/**
 * The full value universe: every corridor restricted only by the use-case
 * country allow-list (if active). Deliberately ignores "Hide USD SWIFT" and
 * every dimension filter — this is what master option lists are built from,
 * so a value never disappears from a panel, only its count changes.
 */
function universeQuery(filters: CorridorFacetFilters) {
  const query = db
    .from('corridors')
    .join('countries', 'corridors.country_id', 'countries.id')
    .join('regions', 'countries.region_id', 'regions.id')
    .join('currencies', 'corridors.payout_currency_id', 'currencies.id')

  if (filters.restrictToUseCaseAllowedCountries) {
    query.whereIn('countries.iso_code_3', RESTRICTED_USE_CASE_ALLOWED_COUNTRY_CODES)
  }

  return query
}

/** The universe narrowed by "Hide USD SWIFT" only — used for counts that ignore every dimension filter (Region). */
function swiftFilteredUniverseQuery(filters: CorridorFacetFilters) {
  const query = universeQuery(filters)
  if (filters.hideUsdSwift) {
    query.whereRaw("corridors.payer_code NOT ILIKE '%swift wire transfer%'")
  }
  return query
}

/** The universe narrowed by "Hide USD SWIFT" plus every active dimension filter except `exclude` (or all of them, if omitted). */
function narrowedQuery(filters: CorridorFacetFilters, exclude?: keyof CorridorFacetFilters) {
  const query = swiftFilteredUniverseQuery(filters)

  if (filters.regionIds?.length && exclude !== 'regionIds') {
    query.whereIn('countries.region_id', filters.regionIds)
  }
  if (filters.countryIds?.length && exclude !== 'countryIds') {
    query.whereIn('corridors.country_id', filters.countryIds)
  }
  if (filters.serviceCodes?.length && exclude !== 'serviceCodes') {
    query.whereIn('corridors.service_code', filters.serviceCodes)
  }
  if (filters.transactionTypeCodes?.length && exclude !== 'transactionTypeCodes') {
    query.whereIn('corridors.transaction_type_code', filters.transactionTypeCodes)
  }
  if (filters.payoutCurrencyIds?.length && exclude !== 'payoutCurrencyIds') {
    query.whereIn('corridors.payout_currency_id', filters.payoutCurrencyIds)
  }
  if (filters.payerCodes?.length && exclude !== 'payerCodes') {
    query.whereIn('corridors.payer_code', filters.payerCodes)
  }

  return query
}

interface Row {
  value: string | number
  label: string
  count: string | number
}

/** Merges a dimension's full value universe with its (possibly partial) narrowed counts, defaulting missing ones to 0. */
function mergeWithMaster(master: Row[], counted: Row[]): FacetOption[] {
  const countByValue = new Map(counted.map((row) => [row.value, Number(row.count)]))
  return master
    .map((row) => ({ value: row.value, label: row.label, count: countByValue.get(row.value) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

async function dimensionFacet(
  filters: CorridorFacetFilters,
  dimension: keyof CorridorFacetFilters,
  valueColumn: string,
  labelColumn: string
): Promise<FacetOption[]> {
  const [master, counted] = await Promise.all([
    universeQuery(filters)
      .select(`${valueColumn} as value`, `${labelColumn} as label`)
      .groupBy(valueColumn, labelColumn) as unknown as Promise<Row[]>,
    narrowedQuery(filters, dimension)
      .select(`${valueColumn} as value`, `${labelColumn} as label`)
      .count('* as count')
      .groupBy(valueColumn, labelColumn) as unknown as Promise<Row[]>,
  ])

  return mergeWithMaster(master, counted)
}

async function regionFacet(filters: CorridorFacetFilters): Promise<FacetOption[]> {
  // Region ignores every dimension filter, including its own — it always
  // reflects the full eligible set (matching the old app's "independent of
  // all other filter selections" region-count rule). "Hide USD SWIFT" still
  // applies, since that skip happens globally in the old app too.
  const rows = (await swiftFilteredUniverseQuery(filters)
    .select('regions.id as value', 'regions.name as label')
    .count('* as count')
    .groupBy('regions.id', 'regions.name')) as unknown as Row[]

  return rows
    .map((row) => ({ value: row.value, label: row.label, count: Number(row.count) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

/**
 * A hard cap on how many corridors a single filter selection can list/add at
 * once — the old app has no equivalent guard at all (ticking one big country
 * instantly renders/would-add every matching corridor, unbounded). Matching
 * this old-app data model without this cap would just reproduce that risk.
 */
export const MAX_MATCHING_CORRIDORS = 200

/**
 * The actual corridor ids matching the current filters (not just a count) —
 * powers "Bulk Add by Filter". Capped at MAX_MATCHING_CORRIDORS; the caller
 * is expected to also show `totalMatched` (from computeCorridorFacets) so
 * the UI can warn when the true match count exceeds what's listed.
 */
export async function listMatchingCorridorIds(filters: CorridorFacetFilters): Promise<number[]> {
  const rows = (await narrowedQuery(filters)
    .select('corridors.id')
    .orderBy('corridors.id')
    .limit(MAX_MATCHING_CORRIDORS)) as unknown as { id: number }[]
  return rows.map((r) => r.id)
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
    narrowedQuery(filters).count('* as count').first(),
    regionFacet(filters),
    dimensionFacet(filters, 'countryIds', 'countries.id', 'countries.name'),
    dimensionFacet(filters, 'serviceCodes', 'corridors.service_code', 'corridors.service_code'),
    dimensionFacet(
      filters,
      'transactionTypeCodes',
      'corridors.transaction_type_code',
      'corridors.transaction_type_code'
    ),
    dimensionFacet(filters, 'payoutCurrencyIds', 'currencies.id', 'currencies.iso_code_3'),
    dimensionFacet(filters, 'payerCodes', 'corridors.payer_code', 'corridors.payer_code'),
  ])

  return {
    totalAvailable: Number(totalAvailable!.count),
    totalMatched: Number(totalMatched!.count),
    regions,
    countries,
    services,
    transactionTypes,
    payoutCurrencies,
    payers,
  }
}
