export type QuoteStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'closed'

export interface Region {
  id: number
  code: string
  name: string
}

export interface Country {
  id: number
  isoCode3: string
  name: string
  regionId: number
  region?: Region
}

export interface Currency {
  id: number
  isoCode3: string
  name: string
  decimalPlaces: number
  isSource: boolean
  isFunding: boolean
  isPayout: boolean
  isFee: boolean
  isHard: boolean
  isPegged: boolean
}

export interface UseCase {
  id: number
  code: string
  label: string
  isActive: boolean
}

export interface IntegrationType {
  id: number
  name: string
}

export interface IcpNode {
  id: number
  code: string
  name: string
  level: number
  parentId: number | null
  isActive: boolean
}

export interface Corridor {
  id: number
  countryId: number
  country?: Country
  serviceCode: string
  transactionTypeCode: string
  payerCode: string
  receivingPartner: string
  payoutCurrencyId: number
  payoutCurrency?: Currency
  fxSource: string | null
  treasuryFxCostSpread: number | null
  costFixedUsd: number | null
  costVariablePct: number | null
  networkNeedApprovalRaw: string | null
  internalRaw: string | null
  centralBankRaw: string | null
}

export interface QuoteCorridorInput {
  corridorId: number
  fundingCurrencyId?: number | null
  atvUsd?: number
  yearlyVolumeUsd: number
  yearlyTransactions: number
  fixedFeeUsd: number
  variableFeePct: number
  appliedFxSpread: number
  feeDiscountPct?: number
}

export interface QuoteCorridor extends QuoteCorridorInput {
  id: number
  quoteId: number
  revenueFee: number | null
  fxMargin: number | null
  fxMarginPct: number | null
  marginFee: number | null
  totalRevenue: number | null
  totalMargin: number | null
  marginPct: number | null
  grossMarginPct: number | null
  takeRatePct: number | null
  computedAt: string | null
  needsApproval: boolean
  approvalReasons: string[] | null
  needsFinancialApproval: boolean
  financialApprovalReasons: string[] | null
  needsNetworkApproval: boolean
  networkApprovalReasons: string[] | null
  corridor?: Corridor
  fundingCurrency?: Currency
}

export type FxModel = 'traditional_fx' | 'trading_desk' | 'both_models'
export type PricingStrategy = 'corridor_pricing' | 'flat_fee' | 'volume_based' | 'tiered_pricing'
export type FxPricingOption = 'fx_spread' | 'revenue_share'

/** Everything a user can set on a quote's header — the create/update payload shape. */
export interface QuoteFields {
  name: string
  opportunityType?: string | null
  partnerCountryId?: number | null
  useCaseIds?: number[]
  integrationTypeId?: number | null
  icpLevel1Id?: number | null
  icpLevel2Id?: number | null
  icpLevel3Id?: number | null
  contractLengthYears?: number | null
  partnerPrCode?: string | null
  showFxSourceInContract?: boolean
  showFxSpreadInContract?: boolean
  fxModel?: FxModel | null
  selectedPricingStrategy?: PricingStrategy | null
  selectedFxPricing?: FxPricingOption | null
  fundingCurrencyId?: number | null
  fundingCurrencyIds?: number[]
  sourceCurrencyId?: number | null
  sourceCurrencyIds?: number[]
  defaultFeeCurrencyId?: number | null
}

export interface Quote extends QuoteFields {
  id: number
  status: QuoteStatus
  ownerId: number
  createdAt: string
  updatedAt: string
  owner?: { id: number; firstName: string; lastName: string; email: string }
  partnerCountry?: Country | null
  useCases?: UseCase[]
  integrationType?: IntegrationType | null
  icpLevel1?: IcpNode | null
  icpLevel2?: IcpNode | null
  icpLevel3?: IcpNode | null
  fundingCurrency?: Currency | null
  fundingCurrencies?: Currency[]
  sourceCurrency?: Currency | null
  sourceCurrencies?: Currency[]
  defaultFeeCurrency?: Currency | null
  corridors?: QuoteCorridor[]
}

export interface QuoteListItem {
  id: number
  name: string
  status: QuoteStatus
  ownerId: number
  createdAt: string
  updatedAt: string
  corridorCount?: number
}

export interface QuoteTotals {
  totalRevenue: number
  totalMargin: number
  totalVolumeUsd: number
  totalTransactions: number
  averageTakeRatePct: number
  weightedGrossMarginPct: number
  corridorCount: number
  corridorsNeedingApproval: number
}

export interface QuoteShowResponse {
  quote: Quote
  totals: QuoteTotals
}

export interface CorridorFacetOption {
  value: string | number
  label: string
  count: number
}

export interface CorridorFacets {
  totalAvailable: number
  totalMatched: number
  regions: CorridorFacetOption[]
  countries: CorridorFacetOption[]
  services: CorridorFacetOption[]
  transactionTypes: CorridorFacetOption[]
  payoutCurrencies: CorridorFacetOption[]
  payers: CorridorFacetOption[]
}
