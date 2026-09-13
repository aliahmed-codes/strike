import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Region from '#models/region'
import Country from '#models/country'
import Currency from '#models/currency'
import UseCase from '#models/use_case'
import IntegrationType from '#models/integration_type'
import IcpNode from '#models/icp_node'
import PeggedRate from '#models/pegged_rate'
import Corridor from '#models/corridor'

/**
 * Real reference data pulled directly from the old app's live database
 * (regions, countries, and the full 1,272-row active corridor catalog —
 * exported as JSON files under `database/data/real_*.json` so seeding
 * doesn't depend on a live connection to that database) plus its
 * hardcoded UI option lists (use cases, integration types) and its ICP
 * hierarchy seeder (icp_nodes tree). This supersedes the smaller/older
 * `countrieslist.json` snapshot previously used here — that snapshot's
 * 132 countries and 8 regions didn't cover every country/currency the
 * real corridor catalog actually references. Safe to re-run — every
 * table is matched on a natural key, not ids.
 */

interface RealRegion {
  id: number
  name: string
}

interface RealCountry {
  isoCode: string
  name: string
  regionName: string
}

interface RealCorridor {
  countryCode: string
  currencyCode: string
  service: string
  transactionType: string
  payer: string
  receivingPartner: string
}

const CURRENCY_META: Record<
  string,
  {
    name: string
    decimals: number
    isSource: boolean
    isFunding: boolean
    isPayout: boolean
    isPegged: boolean
  }
> = {
  AED: {
    name: 'UAE Dirham',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: true,
  },
  AMD: {
    name: 'Armenian Dram',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  AOA: {
    name: 'Kwanza',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  ARS: {
    name: 'Argentine Peso',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  AUD: {
    name: 'Australian Dollar',
    decimals: 2,
    isSource: true,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  BDT: {
    name: 'Taka',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  BGN: {
    name: 'Bulgarian Lev',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  BHD: {
    name: 'Bahraini Dinar',
    decimals: 3,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: true,
  },
  BIF: {
    name: 'Burundi Franc',
    decimals: 0,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  BOB: {
    name: 'Boliviano',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  BRL: {
    name: 'Brazilian Real',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  BWP: {
    name: 'Pula',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  CAD: {
    name: 'Canadian Dollar',
    decimals: 2,
    isSource: true,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  CHF: {
    name: 'Swiss Franc',
    decimals: 2,
    isSource: true,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  CLP: {
    name: 'Chilean Peso',
    decimals: 0,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  CNY: {
    name: 'Yuan Renminbi',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  COP: {
    name: 'Colombian Peso',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  CRC: {
    name: 'Costa Rican Colon',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  CZK: {
    name: 'Czech Koruna',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  DKK: {
    name: 'Danish Krone',
    decimals: 2,
    isSource: true,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  DOP: {
    name: 'Dominican Peso',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  DZD: {
    name: 'Algerian Dinar',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  EGP: {
    name: 'Egyptian Pound',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  ETB: {
    name: 'Ethiopian Birr',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  EUR: {
    name: 'Euro',
    decimals: 2,
    isSource: true,
    isFunding: true,
    isPayout: true,
    isPegged: false,
  },
  FJD: {
    name: 'Fiji Dollar',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  GBP: {
    name: 'Pound Sterling',
    decimals: 2,
    isSource: true,
    isFunding: true,
    isPayout: true,
    isPegged: false,
  },
  GEL: {
    name: 'Lari',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  GHS: {
    name: 'Ghana Cedi',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  GMD: {
    name: 'Dalasi',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  GNF: {
    name: 'Guinean Franc',
    decimals: 0,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  GTQ: {
    name: 'Quetzal',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  HKD: {
    name: 'Hong Kong Dollar',
    decimals: 2,
    isSource: false,
    isFunding: true,
    isPayout: true,
    isPegged: false,
  },
  HNL: {
    name: 'Lempira',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  HTG: {
    name: 'Gourde',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  HUF: {
    name: 'Forint',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  IDR: {
    name: 'Rupiah',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  ILS: {
    name: 'New Israeli Sheqel',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  INR: {
    name: 'Indian Rupee',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  ISK: {
    name: 'Iceland Krona',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  JMD: {
    name: 'Jamaican Dollar',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  JOD: {
    name: 'Jordanian Dinar',
    decimals: 3,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: true,
  },
  JPY: {
    name: 'Yen',
    decimals: 0,
    isSource: true,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  KES: {
    name: 'Kenyan Shilling',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  KMF: {
    name: 'Comorian Franc',
    decimals: 0,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  KRW: {
    name: 'Won',
    decimals: 0,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  LBP: {
    name: 'Lebanese Pound',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  LKR: {
    name: 'Sri Lanka Rupee',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  LSL: {
    name: 'Loti',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  MAD: {
    name: 'Moroccan Dirham',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  MDL: {
    name: 'Moldovan Leu',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  MGA: {
    name: 'Malagasy Ariary',
    decimals: 0,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  MMK: {
    name: 'Kyat',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  MNT: {
    name: 'Tugrik',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  MRU: {
    name: 'Ouguiya',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  MWK: {
    name: 'Malawi Kwacha',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  MXN: {
    name: 'Mexican Peso',
    decimals: 2,
    isSource: true,
    isFunding: true,
    isPayout: true,
    isPegged: false,
  },
  MYR: {
    name: 'Malaysian Ringgit',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  MZN: {
    name: 'Mozambique Metical',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  NGN: {
    name: 'Naira',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  NIO: {
    name: 'Cordoba Oro',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  NOK: {
    name: 'Norwegian Krone',
    decimals: 2,
    isSource: true,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  NPR: {
    name: 'Nepalese Rupee',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  NZD: {
    name: 'New Zealand Dollar',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  OMR: {
    name: 'Rial Omani',
    decimals: 3,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: true,
  },
  PEN: {
    name: 'Sol',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  PHP: {
    name: 'Philippine Peso',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  PKR: {
    name: 'Pakistan Rupee',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  PLN: {
    name: 'Zloty',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  PYG: {
    name: 'Guarani',
    decimals: 0,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  QAR: {
    name: 'Qatari Rial',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: true,
  },
  RON: {
    name: 'Romanian Leu',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  RSD: {
    name: 'Serbian Dinar',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  RWF: {
    name: 'Rwanda Franc',
    decimals: 0,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  SAR: {
    name: 'Saudi Riyal',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: true,
  },
  SEK: {
    name: 'Swedish Krona',
    decimals: 2,
    isSource: true,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  SGD: {
    name: 'Singapore Dollar',
    decimals: 2,
    isSource: false,
    isFunding: true,
    isPayout: true,
    isPegged: false,
  },
  SLE: {
    name: 'Leone',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  SSP: {
    name: 'South Sudanese Pound',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  SZL: {
    name: 'Lilangeni',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  THB: {
    name: 'Baht',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  TND: {
    name: 'Tunisian Dinar',
    decimals: 3,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  TOP: {
    name: "Tongan Pa'anga",
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  TRY: {
    name: 'Turkish Lira',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  TWD: {
    name: 'New Taiwan Dollar',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  TZS: {
    name: 'Tanzanian Shilling',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  UAH: {
    name: 'Hryvnia',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  UGX: {
    name: 'Uganda Shilling',
    decimals: 0,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  USD: {
    name: 'US Dollar',
    decimals: 2,
    isSource: true,
    isFunding: true,
    isPayout: true,
    isPegged: false,
  },
  UYU: {
    name: 'Peso Uruguayo',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  VND: {
    name: 'Dong',
    decimals: 0,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  VUV: {
    name: 'Vatu',
    decimals: 0,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  WST: {
    name: 'Tala',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  XAF: {
    name: 'CFA Franc BEAC',
    decimals: 0,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  XOF: {
    name: 'CFA Franc BCEAO',
    decimals: 0,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  ZAR: {
    name: 'Rand',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
  ZMW: {
    name: 'Zambian Kwacha',
    decimals: 2,
    isSource: false,
    isFunding: false,
    isPayout: true,
    isPegged: false,
  },
}

const PEGGED_RATES_TO_USD: Record<string, number> = {
  SAR: 3.75,
  AED: 3.6725,
  QAR: 3.64,
  BHD: 0.376,
  OMR: 0.3845,
  JOD: 0.709,
}

// The 16 use cases exactly as hardcoded in the old app's Summary tab
// (`client/src/features/quotes/components/QuotingDetailsForm.tsx`).
const USE_CASES = [
  'Accept and Pay',
  "Accept APM's",
  'Pay Business payments',
  'Mass Payout',
  'Me2Me account top up',
  'Remittance',
  'Virtual account',
  'Global Accounts',
  'QR code payments',
  'Accept Business payments',
  'Account Top-Up',
  'Last Mile Payout',
  'Gambling account top up',
  'Gambling account withdrawl',
  'Insurance payouts',
  'Other',
]

// The ICP hierarchy tree exactly as seeded by the old app's
// `031_icp_hierarchy_seeder.ts` (source: "New Pricing Matrix.xlsx").
const ICP_TREE: Record<string, Record<string, string[]>> = {
  'Financial Institution': {
    'Bank': ['Tier 1 international bank', 'Regional bank / Credit union', 'Neobank / Digital bank'],
    'MTO': ['Global MTO', 'Regional MTO'],
    'Digital wallet': ['E-wallet', 'Telco-led mobile wallet'],
    'PSP': [
      'Payouts, Disbursements & Accounts PSP',
      'Universal PSP',
      'Card issuer PSP',
      'Invoice factoring PSP',
      'Cross-border specialist PSP',
      'BaaS',
      'Prepaid voucher / Stored-value provider',
      'Open banking PSP',
      'BNPL PSP',
    ],
    'Other NBFI': [
      'Insurance provider',
      'Investment fund',
      'Pension provider',
      'FX brokers',
      'Card networks / schemes',
    ],
  },
  'Platform': {
    'Marketplace': ['E-commerce marketplace', 'Gig economy platform', 'Online brokerage'],
    'Payroll': [
      'Payroll service provider',
      'Employer of Record (EOR)',
      'Contractor of Record (COR)',
    ],
    'Financial services technology': [
      'Core banking system',
      'Payment orchestrator / Gateway',
      'Financial messaging platform',
      'Payment & Treasury platform',
      'B2B financial services platform',
    ],
    'ISV / SaaS': [
      'Online Travel Agent (OTA)',
      'Property Management System (PMS)',
      'Enterprise Resource Planning (ERP)',
      'Accounts Payable platform',
      'Spend management',
      'Other ISV',
    ],
  },
  'Enterprise': {
    'Other enterprise': [
      'Retailer',
      'Shipping',
      'Hotel',
      'Airline',
      'Media',
      'Mining',
      'Business services',
      'Other logistics',
      'Other enterprise',
      'Hyperscaler',
    ],
    'Public sector, education and non-profit': [
      'Non-governmental organization (NGO)',
      'Educational institution',
      'Government entity',
    ],
  },
  'Unclassified': {
    Unclassified: ['Unclassified'],
  },
}

function slugCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function readJson<T>(filename: string): T {
  const dir = path.dirname(fileURLToPath(import.meta.url))
  return JSON.parse(fs.readFileSync(path.join(dir, '..', 'data', filename), 'utf-8'))
}

export default class extends BaseSeeder {
  async run() {
    const realRegions = readJson<RealRegion[]>('real_regions.json')
    const realCountries = readJson<RealCountry[]>('real_countries.json')
    const realCorridors = readJson<RealCorridor[]>('real_corridors.json')

    // 1. Regions (10, matching the live app's current regions table)
    const regions = await Region.updateOrCreateMany(
      'code',
      realRegions.map((r) => ({ code: slugCode(r.name).slice(0, 20), name: r.name }))
    )
    const regionByName = Object.fromEntries(regions.map((r) => [r.name, r]))

    // 2. Countries (206, real ISO alpha-3 codes, real region assignment)
    const countries = await Country.updateOrCreateMany(
      'isoCode3',
      realCountries.map((c) => ({
        isoCode3: c.isoCode,
        name: c.name,
        regionId: regionByName[c.regionName].id,
      }))
    )
    const countryByIso = Object.fromEntries(countries.map((c) => [c.isoCode3, c]))

    // 3. Currencies (every currency referenced by the real corridor catalog,
    // plus the old app's funding/source-currency lists and pegged rates)
    const currencies = await Currency.updateOrCreateMany(
      'isoCode3',
      Object.entries(CURRENCY_META).map(([isoCode3, meta]) => ({
        isoCode3,
        name: meta.name,
        decimalPlaces: meta.decimals,
        isSource: meta.isSource,
        isFunding: meta.isFunding,
        isPayout: meta.isPayout,
        isFee: meta.isFunding,
        isHard: meta.isFunding,
        isPegged: meta.isPegged,
      }))
    )
    const currencyByIso = Object.fromEntries(currencies.map((c) => [c.isoCode3, c]))

    // 4. Pegged rates
    await PeggedRate.updateOrCreateMany(
      'currencyId',
      Object.entries(PEGGED_RATES_TO_USD).map(([isoCode3, rateToUsd]) => ({
        currencyId: currencyByIso[isoCode3].id,
        rateToUsd,
        effectiveFrom: DateTime.fromISO('2026-01-01'),
        effectiveTo: null,
      }))
    )

    // 5. Use cases
    await UseCase.updateOrCreateMany(
      'code',
      USE_CASES.map((label) => ({ code: slugCode(label), label, isActive: true }))
    )

    // 6. Integration types (old app's hardcoded list, with real setup-fee tiers)
    await IntegrationType.updateOrCreateMany('name', [
      { name: 'New API Integration' },
      { name: 'Transfers with Thunes Business Hub' },
      { name: 'Middleware Integration' },
      { name: 'New Vertical & Corridor' },
      { name: 'New Corridor' },
    ])

    // 7. ICP hierarchy (4 L1 -> 12 L2 -> 52 L3 = 68 nodes)
    let l1Index = 0
    for (const [l1Name, l2Map] of Object.entries(ICP_TREE)) {
      l1Index += 1
      const l1Code = `L1_${l1Index}`
      const l1 = await IcpNode.updateOrCreate(
        { code: l1Code },
        { code: l1Code, name: l1Name, level: 1, parentId: null, isActive: true }
      )

      let l2Index = 0
      for (const [l2Name, l3Names] of Object.entries(l2Map)) {
        l2Index += 1
        const l2Code = `${l1Code}_L2_${l2Index}`
        const l2 = await IcpNode.updateOrCreate(
          { code: l2Code },
          { code: l2Code, name: l2Name, level: 2, parentId: l1.id, isActive: true }
        )

        let l3Index = 0
        for (const l3Name of l3Names) {
          l3Index += 1
          const l3Code = `${l2Code}_L3_${l3Index}`
          await IcpNode.updateOrCreate(
            { code: l3Code },
            { code: l3Code, name: l3Name, level: 3, parentId: l2.id, isActive: true }
          )
        }
      }
    }

    // 8. Corridors — the real, active corridor catalog. Deduped on the same
    // key the old app's own picker uses (country+service+transactionType+
    // payer+currency, NOT receiving partner) so two rows that differ only by
    // receiving partner collapse into one, exactly like the old app — first
    // occurrence wins, matching its `if (!seen.has(key))` dedup order.
    const corridorRowsByKey = new Map<
      string,
      {
        countryId: number
        serviceCode: string
        transactionTypeCode: string
        payerCode: string
        receivingPartner: string
        payoutCurrencyId: number
      }
    >()

    for (const row of realCorridors) {
      const country = countryByIso[row.countryCode]
      const currency = currencyByIso[row.currencyCode]
      if (!country || !currency) continue

      const key = [country.id, row.service, row.transactionType, row.payer, currency.id].join('|')
      if (corridorRowsByKey.has(key)) continue

      corridorRowsByKey.set(key, {
        countryId: country.id,
        serviceCode: row.service,
        transactionTypeCode: row.transactionType,
        payerCode: row.payer,
        receivingPartner: row.receivingPartner,
        payoutCurrencyId: currency.id,
      })
    }

    await Corridor.updateOrCreateMany(
      ['countryId', 'serviceCode', 'transactionTypeCode', 'payerCode', 'payoutCurrencyId'],
      Array.from(corridorRowsByKey.values())
    )
  }
}
