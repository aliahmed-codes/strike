import type { HttpContext } from '@adonisjs/core/http'
import Region from '#models/region'
import Country from '#models/country'
import Currency from '#models/currency'
import UseCase from '#models/use_case'
import IntegrationType from '#models/integration_type'
import IcpNode from '#models/icp_node'
import Corridor from '#models/corridor'
import Quote from '#models/quote'
import { canAccessQuote } from '#services/quote_access_service'
import { computeMbpForCorridors, fetchAllMbpReferenceData } from '#services/mbp_pricing_service'
import { corridorFacetFiltersValidator } from '#validators/quote'
import {
  computeCorridorFacets,
  listMatchingCorridorIds,
  type CorridorFacetFilters,
} from '#services/corridor_facet_service'

function toFilterList(value: unknown): unknown {
  if (typeof value === 'string') return value.length > 0 ? value.split(',') : undefined
  return value
}

async function parseFacetFilters(qs: Record<string, unknown>): Promise<CorridorFacetFilters> {
  const {
    regionIds,
    countryIds,
    serviceCodes,
    transactionTypeCodes,
    payoutCurrencyIds,
    payerCodes,
    hideUsdSwift,
    restrictToUseCaseAllowedCountries,
  } = qs

  return corridorFacetFiltersValidator.validate({
    regionIds: toFilterList(regionIds),
    countryIds: toFilterList(countryIds),
    serviceCodes: toFilterList(serviceCodes),
    transactionTypeCodes: toFilterList(transactionTypeCodes),
    payoutCurrencyIds: toFilterList(payoutCurrencyIds),
    payerCodes: toFilterList(payerCodes),
    hideUsdSwift: hideUsdSwift === '' ? undefined : hideUsdSwift,
    restrictToUseCaseAllowedCountries:
      restrictToUseCaseAllowedCountries === '' ? undefined : restrictToUseCaseAllowedCountries,
  })
}

export default class ReferenceDataController {
  async regions() {
    // Only regions that actually have at least one country assigned — the
    // regions table carries a few legacy/superseded rows (e.g. "Asia",
    // "Middle east", "Central&South America") that no country references
    // any more. The old app's region picker is derived live from corridor
    // data, so it never offers a region with nothing under it; mirror that
    // here instead of surfacing dead options with an empty country list.
    return Region.query().has('countries').orderBy('name')
  }

  async countries() {
    return Country.query().orderBy('name')
  }

  async currencies() {
    return Currency.query().orderBy('isoCode3')
  }

  async useCases() {
    return UseCase.query().where('isActive', true).orderBy('label')
  }

  async integrationTypes() {
    return IntegrationType.query().orderBy('name')
  }

  async icpNodes() {
    return IcpNode.query().where('isActive', true).orderBy('level').orderBy('name')
  }

  async corridors({ request }: HttpContext) {
    const { countryId, serviceCode, transactionTypeCode } = request.qs()

    const query = Corridor.query()
      .preload('country', (q) => q.preload('region'))
      .preload('payoutCurrency')

    if (countryId) query.where('countryId', countryId)
    if (serviceCode) query.where('serviceCode', serviceCode)
    if (transactionTypeCode) query.where('transactionTypeCode', transactionTypeCode)

    return query.orderBy('id')
  }

  async corridorFacets({ request }: HttpContext) {
    return computeCorridorFacets(await parseFacetFilters(request.qs()))
  }

  /**
   * Powers "Bulk Add by Filter" — the actual list of individual corridors
   * matching the current facet filters (not just counts), so the user can
   * pick specific ones (or "select all") to add in one action. See
   * FEATURES.md's Bulk Add by Filter scope for why this exists instead of
   * copying the old app's filter-is-the-data model.
   */
  async matchingCorridors({ auth, request, response }: HttpContext) {
    const filters = await parseFacetFilters(request.qs())
    const ids = await listMatchingCorridorIds(filters)
    if (ids.length === 0) {
      return { corridors: [] }
    }
    const corridors = await Corridor.query()
      .whereIn('id', ids)
      .preload('country', (q) => q.preload('region'))
      .preload('payoutCurrency')
      .orderBy('id')

    // Optional: preview each matched corridor's Market-Based Pricing
    // result before it's ever added to the quote — "Corridors to Offer"
    // passes its own quoteId so the preview list can show the same fee a
    // user would actually get by adding it. Read-only, so a submitted/
    // approved quote can still be previewed even though it's no longer
    // editable — only ownership/access is checked, not editability.
    const { quoteId } = request.qs()
    if (quoteId) {
      const quote = await Quote.query().where('id', quoteId).preload('partnerCountry').first()
      if (!quote) {
        return response.notFound({ message: 'Quote not found' })
      }
      const user = auth.getUserOrFail()
      if (!canAccessQuote(user, quote)) {
        return response.forbidden({ message: 'You do not have access to this quote' })
      }
      const mbpData = await fetchAllMbpReferenceData()
      const mbpByCorridorId = computeMbpForCorridors(corridors, quote, mbpData)
      for (const corridor of corridors) {
        corridor.$extras.mbp = mbpByCorridorId.get(corridor.id) ?? null
      }
    }

    return { corridors }
  }
}
