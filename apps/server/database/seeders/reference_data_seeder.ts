import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import Region from '#models/region'
import Country from '#models/country'
import Currency from '#models/currency'
import UseCase from '#models/use_case'
import IntegrationType from '#models/integration_type'
import IcpNode from '#models/icp_node'
import PeggedRate from '#models/pegged_rate'
import Corridor from '#models/corridor'

/**
 * Real reference data recovered from the old project's database
 * (priceframe-gm2.sql's "v2" schema — a cleaner redesign attempt found
 * inside the old dump). It's a small dev/test dataset, not a full
 * production corridor catalog, but it's real data rather than invented
 * placeholders. Safe to re-run (matches on natural keys, not ids).
 */
export default class extends BaseSeeder {
  async run() {
    const regions = await Region.updateOrCreateMany('code', [
      { code: 'APAC', name: 'Asia Pacific' },
      { code: 'EUR', name: 'Europe' },
      { code: 'NA', name: 'North America' },
    ])
    const regionByCode = Object.fromEntries(regions.map((r) => [r.code, r]))

    const countries = await Country.updateOrCreateMany('isoCode2', [
      { isoCode2: 'PK', name: 'Pakistan', regionId: regionByCode.APAC.id },
      { isoCode2: 'GB', name: 'United Kingdom', regionId: regionByCode.EUR.id },
      { isoCode2: 'US', name: 'United States', regionId: regionByCode.NA.id },
    ])
    const countryByCode = Object.fromEntries(countries.map((c) => [c.isoCode2, c]))

    const currencies = await Currency.updateOrCreateMany('isoCode3', [
      {
        isoCode3: 'USD',
        name: 'US Dollar',
        decimalPlaces: 2,
        isSource: true,
        isFunding: true,
        isPayout: true,
        isFee: true,
        isHard: true,
        isPegged: false,
      },
      {
        isoCode3: 'EUR',
        name: 'Euro',
        decimalPlaces: 2,
        isSource: true,
        isFunding: true,
        isPayout: true,
        isFee: true,
        isHard: true,
        isPegged: false,
      },
      {
        isoCode3: 'PKR',
        name: 'Pakistani Rupee',
        decimalPlaces: 2,
        isSource: false,
        isFunding: false,
        isPayout: true,
        isFee: false,
        isHard: false,
        isPegged: false,
      },
      {
        isoCode3: 'AED',
        name: 'UAE Dirham',
        decimalPlaces: 2,
        isSource: false,
        isFunding: false,
        isPayout: true,
        isFee: false,
        isHard: false,
        isPegged: true,
      },
    ])
    const currencyByCode = Object.fromEntries(currencies.map((c) => [c.isoCode3, c]))

    await UseCase.updateOrCreateMany('code', [
      { code: 'accept_business_payments', label: 'Accept Business payments', isActive: true },
      { code: 'accept_and_pay', label: 'Accept and Pay', isActive: true },
      { code: 'payout_disbursement', label: 'Payout / Disbursement', isActive: true },
    ])

    await IntegrationType.updateOrCreateMany('name', [
      { name: 'New API Integration' },
      { name: 'Transfers with Thunes Business Hub' },
      { name: 'Middleware Integration' },
      { name: 'New Vertical & Corridor' },
      { name: 'New Corridor' },
    ])

    const fi = await IcpNode.updateOrCreate(
      { code: 'FI' },
      { code: 'FI', name: 'Financial Institution', level: 1, parentId: null, isActive: true }
    )
    const fiBank = await IcpNode.updateOrCreate(
      { code: 'FI_BANK' },
      { code: 'FI_BANK', name: 'Bank', level: 2, parentId: fi.id, isActive: true }
    )
    await IcpNode.updateOrCreate(
      { code: 'FI_BANK_NEOBANK' },
      {
        code: 'FI_BANK_NEOBANK',
        name: 'Neobank / Digital Bank',
        level: 3,
        parentId: fiBank.id,
        isActive: true,
      }
    )

    await PeggedRate.updateOrCreateMany('currencyId', [
      {
        currencyId: currencyByCode.AED.id,
        rateToUsd: 3.6725,
        effectiveFrom: DateTime.fromISO('2026-09-10'),
        effectiveTo: null,
      },
    ])

    await Corridor.updateOrCreateMany(
      ['countryId', 'serviceCode', 'transactionTypeCode', 'payerCode', 'payoutCurrencyId'],
      [
        {
          countryId: countryByCode.PK.id,
          serviceCode: 'mobile_wallet',
          transactionTypeCode: 'b2c',
          payerCode: 'easypaisa_pakistan',
          payoutCurrencyId: currencyByCode.PKR.id,
        },
        {
          countryId: countryByCode.PK.id,
          serviceCode: 'bank_account',
          transactionTypeCode: 'c2c',
          payerCode: 'all_banks_pakistan_swift',
          payoutCurrencyId: currencyByCode.USD.id,
        },
        {
          countryId: countryByCode.GB.id,
          serviceCode: 'bank_account',
          transactionTypeCode: 'b2b',
          payerCode: 'all_banks_uk_faster_payment',
          payoutCurrencyId: currencyByCode.EUR.id,
        },
        {
          countryId: countryByCode.US.id,
          serviceCode: 'card',
          transactionTypeCode: 'c2b',
          payerCode: 'visa_cards_us',
          payoutCurrencyId: currencyByCode.USD.id,
        },
      ]
    )
  }
}
