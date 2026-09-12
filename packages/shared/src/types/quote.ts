export type QuoteStatus = 'draft' | 'submitted' | 'approved' | 'rejected'

export type PricingModel = 'flat' | 'volume_tiered'

export interface VolumeTier {
  /** Inclusive lower bound of yearly volume for this tier. */
  fromVolume: number
  /** Exclusive upper bound; null means "and above". */
  toVolume: number | null
  fixedFee: number
  variableFeePercent: number
}

export interface QuoteCorridorInput {
  originCountry: string
  destinationCountry: string
  payoutCurrency: string
  pricingModel: PricingModel
  fixedFee: number
  variableFeePercent: number
  fxSpreadPercent: number
  averageTransactionValue: number
  yearlyVolume: number
  tiers?: VolumeTier[]
}

export interface QuoteCorridor extends QuoteCorridorInput {
  id: string
  quoteId: string
  yearlyRevenue: number
  yearlyMargin: number
  takeRatePercent: number
}

export interface Quote {
  id: string
  name: string
  status: QuoteStatus
  ownerId: string
  createdAt: string
  updatedAt: string
  corridors: QuoteCorridor[]
  totalYearlyRevenue: number
  totalYearlyMargin: number
}

export interface CreateQuotePayload {
  name: string
  corridors: QuoteCorridorInput[]
}
