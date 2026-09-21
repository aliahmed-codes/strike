import type { QuoteStatus } from './quote.js'
import type { FeeType, McfType, OtherFeeConcept } from './setup_fee.js'

/** One row of the Final Quotation / Legal Contract corridor table (a tier row for tiered corridors). */
export interface LegalCorridorRow {
  country: string
  /** ISO 3-letter code, printed by the Fee Annex instead of the name. */
  countryCode: string
  service: string
  transactionType: string
  payoutCurrency: string
  payer: string
  /** Set only when the quote prices the same corridor under more than one funding currency. */
  fundingCurrency: string | null
  /** Tier number for a tiered corridor's row, null for a standard corridor. */
  tier: number | null
  /** Yearly principal volume in USD (the tier's own volume for a tier row). */
  yearlyVolumeUsd: number
  feeCurrency: string
  /** Fixed fee already converted from USD into the fee currency. */
  fixedFee: number
  variableFeePct: number
  feeDiscountPct: number
  /** Null when the quote's "show FX spread in contract" flag is off. */
  fxSpreadPct: number | null
  /** Null when the quote's "show FX source in contract" flag is off. */
  fxSource: string | null
}

export interface LegalOtherLineItem {
  label: string
  kind: 'money' | 'percentage' | 'text'
  amount: number | null
  text: string | null
}

export interface LegalCommitmentBlock {
  label: string
  /** First and last contract month the block covers (null end = to the end of the contract). */
  startMonth: number
  endMonth: number | null
  /** Monthly fee for a standard (fee-revenue based) block. */
  commitmentFee: number | null
  /** Committed monthly principal and rate for a principal-based block. */
  monthlyPrincipal: number | null
  ratePct: number | null
}

/** Every Other Fee concept with its saved amount — zeros included, so a waiver can be shown as $0. */
export type LegalOtherFees = Partial<
  Record<OtherFeeConcept, { amount: number; isPercentage: boolean; currencyCode: string | null }>
>

export interface LegalCommitment {
  type: McfType
  typeLabel: string
  blocks: LegalCommitmentBlock[]
  /** True when every block carries the same terms, so a document can print one line. */
  uniform: boolean
  waivedMonths: number
  /** Commitment fee for each contract month (index 0 = month 1), before waived months are shown as '-'. */
  monthlyFees: number[]
}

export interface LegalPaymentTerms {
  scheduleLabel: string
  milestones: { milestone: string; percentage: number }[]
  /** Blank on a full-payment schedule, like the old sheet. */
  joiningFeeBillingLabel: string | null
  mcfBillingStartLabel: string
  rebateEnabled: boolean
  rebateTypeLabel: string | null
}

/**
 * The canonical commercial-terms view the Legal tab and the Legal Contract
 * workbook both render — assembled once from saved data only.
 */
export interface QuoteLegalData {
  status: QuoteStatus
  isApproved: boolean
  /** Reasons a contract can't be generated yet; never replaced by a guessed default. */
  blockers: string[]
  quoteName: string
  prCode: string | null
  contractYears: number | null
  pricingModel: string | null
  fxModel: string | null
  feeCurrency: string | null
  fundingCurrencies: string[]
  sourceCurrencies: string[]
  oneOffFee: { feeType: FeeType; label: string; amount: number } | null
  otherLineItems: LegalOtherLineItem[]
  otherFees: LegalOtherFees
  showFxSpread: boolean
  showFxSource: boolean
  corridorRows: LegalCorridorRow[]
  corridorCount: number
  countryCount: number
  services: string[]
  hasTiers: boolean
  hasMultipleFundingCurrencies: boolean
  hasFeeDiscount: boolean
  commitment: LegalCommitment | null
  payment: LegalPaymentTerms | null
}
