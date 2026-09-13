import type { HttpContext } from '@adonisjs/core/http'
import Region from '#models/region'
import Country from '#models/country'
import Currency from '#models/currency'
import UseCase from '#models/use_case'
import IntegrationType from '#models/integration_type'
import IcpNode from '#models/icp_node'
import Corridor from '#models/corridor'
import { computeCorridorFacets } from '#services/corridor_facet_service'

export default class ReferenceDataController {
  async regions() {
    return Region.query().orderBy('name')
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

    const query = Corridor.query().preload('country').preload('payoutCurrency')

    if (countryId) query.where('countryId', countryId)
    if (serviceCode) query.where('serviceCode', serviceCode)
    if (transactionTypeCode) query.where('transactionTypeCode', transactionTypeCode)

    return query.orderBy('id')
  }

  async corridorFacets({ request }: HttpContext) {
    const {
      regionIds,
      countryIds,
      serviceCodes,
      transactionTypeCodes,
      payoutCurrencyIds,
      payerCodes,
      hideUsdSwift,
      restrictToUseCaseAllowedCountries,
    } = request.qs()

    const toNumberList = (value: unknown) =>
      typeof value === 'string' && value.length > 0
        ? value
            .split(',')
            .map(Number)
            .filter((n) => !Number.isNaN(n))
        : undefined
    const toStringList = (value: unknown) =>
      typeof value === 'string' && value.length > 0 ? value.split(',') : undefined

    return computeCorridorFacets({
      regionIds: toNumberList(regionIds),
      countryIds: toNumberList(countryIds),
      serviceCodes: toStringList(serviceCodes),
      transactionTypeCodes: toStringList(transactionTypeCodes),
      payoutCurrencyIds: toNumberList(payoutCurrencyIds),
      payerCodes: toStringList(payerCodes),
      hideUsdSwift: hideUsdSwift === 'true',
      restrictToUseCaseAllowedCountries: restrictToUseCaseAllowedCountries === 'true',
    })
  }
}
