import type {
  FeeType,
  JoiningFeeBillingType,
  McfBillingStart,
  McfType,
  OtherFeeConcept,
  PaymentSchedule,
  RebateType,
} from '../types/setup_fee.js'
import type { FxModel, PricingStrategy } from '../types/quote.js'

/** One place for the wording the Setup Fee tab, Summary tab and Legal documents all show, so they cannot drift. */
export const FEE_TYPE_OPTIONS: { value: FeeType; label: string }[] = [
  { value: 'setup', label: 'Set Up Fee' },
  { value: 'network', label: 'Network Joining Fee' },
]
export const PAYMENT_SCHEDULE_OPTIONS: { value: PaymentSchedule; label: string }[] = [
  { value: 'full', label: 'On Contract Signature - 100%' },
  { value: 'custom', label: 'Custom' },
]
export const JOINING_FEE_BILLING_TYPE_OPTIONS: { value: JoiningFeeBillingType; label: string }[] = [
  { value: 'at_signing', label: 'At Contract Signing' },
  { value: 'non_standard', label: 'Non-Standard Terms' },
]
export const MCF_TYPE_OPTIONS: { value: McfType; label: string }[] = [
  { value: 'standard', label: 'Fee Revenue Based (Standard)' },
  { value: 'principal', label: 'Volume / Principal Based' },
]
export const MCF_BILLING_START_OPTIONS: { value: McfBillingStart; label: string }[] = [
  { value: 'at_signing', label: 'At Contract Signing' },
  { value: 'at_go_live', label: 'At Go-Live' },
  { value: 'non_standard', label: 'Other / Non-Standard' },
]
export const REBATE_TYPE_OPTIONS: { value: RebateType; label: string }[] = [
  { value: 'volume', label: 'Volume Amount Based' },
  { value: 'revenue', label: 'Revenue Amount Based' },
  { value: 'transaction_count', label: 'Transaction Count Based' },
  { value: 'other', label: 'Other' },
]

/**
 * Concept label + whether it's a percentage — fixed per concept, matching the
 * old app's real fields. Whether a concept needs a currency comes from
 * otherFeeRequiresCurrency in setup_fee_math, not from here.
 */
export const OTHER_FEE_META: Record<OtherFeeConcept, { label: string; isPercentage: boolean }> = {
  reversal_request: { label: 'Service Request Fee (Reversal Request)', isPercentage: false },
  proof_of_payment: { label: 'Service Request Fee (Proof of Payment)', isPercentage: false },
  emergency_funding: { label: 'Emergency Funding Fee', isPercentage: true },
  treasury_management: { label: 'Treasury Management Fee', isPercentage: true },
  business_hub_platform: { label: 'Business Hub Platform Fee', isPercentage: false },
  post_funding_penalty: { label: 'Post-Funding Line Penalty Fee', isPercentage: true },
  corridor_no_usage: { label: 'Corridor No-Usage Fee', isPercentage: false },
  white_glove: { label: 'White-Glove Service', isPercentage: false },
  stablecoin_prefunding: { label: 'Stablecoin Pre-funding Set-up Fee', isPercentage: false },
  digital_asset_icp_setup: { label: 'Digital Asset ICP Setup Fee', isPercentage: false },
  bulk_currency_conversion: { label: 'Bulk Currency Conversion', isPercentage: false },
  currencies_for_treasury: { label: 'Currencies For Treasury Management Fee', isPercentage: false },
}

export const FX_MODEL_LABELS: Record<FxModel, string> = {
  traditional_fx: 'Traditional FX',
  trading_desk: 'Trading Desk',
  both_models: 'Both Models',
}

export const PRICING_STRATEGY_LABELS: Record<PricingStrategy, string> = {
  corridor_pricing: 'Corridor Pricing',
  flat_fee: 'Flat Fee',
  volume_based: 'Volume-Based',
  tiered_pricing: 'Tiered Pricing',
}

export function labelFor<T extends string>(
  options: { value: T; label: string }[],
  value: T
): string {
  return options.find((option) => option.value === value)?.label ?? value
}
