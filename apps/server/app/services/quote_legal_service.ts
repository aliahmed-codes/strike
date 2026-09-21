import {
  FEE_TYPE_OPTIONS,
  FX_MODEL_LABELS,
  JOINING_FEE_BILLING_TYPE_OPTIONS,
  MCF_BILLING_START_OPTIONS,
  OTHER_FEE_META,
  PAYMENT_SCHEDULE_OPTIONS,
  PRICING_STRATEGY_LABELS,
  REBATE_TYPE_OPTIONS,
  blockKeyForMonth,
  computeSetupFeeTotals,
  labelFor,
  monthlyCommitmentFeeSchedule,
  usdToFeeCurrencyAmount,
  type FeeConversionCurrency,
  type FxModel,
  type LegalCommitment,
  type LegalCommitmentBlock,
  type LegalCorridorRow,
  type LegalOtherFees,
  type LegalOtherLineItem,
  type LegalPaymentTerms,
  type OtherFeeConcept,
  type PricingStrategy,
  type QuoteLegalData,
} from '@strike/shared'
import type Quote from '#models/quote'
import type Currency from '#models/currency'
import type QuoteSetupFee from '#models/quote_setup_fee'
import { loadSetupFeeInputs } from '#services/quote_pnl_service'

const round3 = (n: number) => Math.round(n * 1000) / 1000

function toConversionCurrency(currency: Currency): FeeConversionCurrency {
  return {
    isoCode3: currency.isoCode3,
    feeConversionRateToUsd:
      currency.feeConversionRateToUsd === null ? null : Number(currency.feeConversionRateToUsd),
  }
}

/** Old sheet labels: first half-year, second half-year, then one block per contract year. */
function blockLabel(blockKey: string): string {
  if (blockKey === 'y1_h1') return 'Months 1-6'
  if (blockKey === 'y1_h2') return 'Months 7-12'
  const year = Number(blockKey.replace('y', ''))
  return `Months ${(year - 1) * 12 + 1}-${year * 12}`
}

function blockMonths(blockKey: string): { startMonth: number; endMonth: number } {
  if (blockKey === 'y1_h1') return { startMonth: 1, endMonth: 6 }
  if (blockKey === 'y1_h2') return { startMonth: 7, endMonth: 12 }
  const year = Number(blockKey.replace('y', ''))
  return { startMonth: (year - 1) * 12 + 1, endMonth: year * 12 }
}

function buildOtherFees(setupFee: QuoteSetupFee): LegalOtherFees {
  const fees: LegalOtherFees = {}
  for (const fee of setupFee.otherFees) {
    fees[fee.conceptCode as OtherFeeConcept] = {
      amount: Number(fee.amount),
      isPercentage: fee.isPercentage,
      currencyCode: fee.currency?.isoCode3 ?? null,
    }
  }
  return fees
}

function buildCommitment(
  setupFee: QuoteSetupFee,
  monthlyFees: number[],
  finalCommitmentFee: number
) {
  const type = setupFee.mcfType
  let blocks: LegalCommitmentBlock[]

  if (type === 'principal') {
    blocks = setupFee.mcfPrincipalSlots
      .filter((slot) => slot.startMonth <= monthlyFees.length)
      .map((slot) => ({
        label: slot.endMonth
          ? `Months ${slot.startMonth}-${slot.endMonth}`
          : `Month ${slot.startMonth} onwards`,
        startMonth: slot.startMonth,
        endMonth: slot.endMonth ?? null,
        commitmentFee: null,
        monthlyPrincipal: Number(slot.monthlyPrincipal),
        ratePct: Number(slot.ratePct),
      }))
  } else {
    const feeByKey = new Map(
      setupFee.mcfBlockFees.map((block) => [block.blockKey, Number(block.commitmentFee)])
    )
    const keys: string[] = []
    for (let month = 1; month <= monthlyFees.length; month += 1) {
      const key = blockKeyForMonth(month)
      if (!keys.includes(key)) keys.push(key)
    }
    blocks = keys.map((key) => ({
      label: blockLabel(key),
      ...blockMonths(key),
      commitmentFee: feeByKey.get(key) ?? finalCommitmentFee,
      monthlyPrincipal: null,
      ratePct: null,
    }))
  }

  const commitment: LegalCommitment = {
    type,
    typeLabel: type === 'principal' ? 'Volume / Principal Based' : 'Fee Revenue Based',
    blocks,
    uniform:
      blocks.length > 0 &&
      blocks.every(
        (block) =>
          block.commitmentFee === blocks[0].commitmentFee &&
          block.monthlyPrincipal === blocks[0].monthlyPrincipal &&
          block.ratePct === blocks[0].ratePct
      ),
    waivedMonths: setupFee.waivedMonths,
    monthlyFees,
  }
  return commitment
}

function buildPayment(setupFee: QuoteSetupFee): LegalPaymentTerms {
  const isCustom = setupFee.paymentSchedule === 'custom'
  return {
    scheduleLabel: labelFor(PAYMENT_SCHEDULE_OPTIONS, setupFee.paymentSchedule),
    milestones: isCustom
      ? setupFee.paymentMilestones.map((m) => ({
          milestone: m.milestone,
          percentage: Number(m.percentage),
        }))
      : [],
    joiningFeeBillingLabel: isCustom
      ? labelFor(JOINING_FEE_BILLING_TYPE_OPTIONS, setupFee.joiningFeeBillingType)
      : null,
    mcfBillingStartLabel: labelFor(MCF_BILLING_START_OPTIONS, setupFee.mcfBillingStart),
    rebateEnabled: setupFee.rebateIncentive,
    rebateTypeLabel:
      setupFee.rebateIncentive && setupFee.rebateType
        ? labelFor(REBATE_TYPE_OPTIONS, setupFee.rebateType)
        : null,
  }
}

/** Zero-priced items are dropped, like the old sheet; a treasury fee's currency follows as its own line. */
function buildOtherLineItems(setupFee: QuoteSetupFee): LegalOtherLineItem[] {
  const items: LegalOtherLineItem[] = []
  for (const fee of setupFee.otherFees) {
    const amount = Number(fee.amount)
    if (!Number.isFinite(amount) || amount === 0) continue
    const meta = OTHER_FEE_META[fee.conceptCode as OtherFeeConcept]
    items.push({
      label: meta?.label ?? fee.conceptCode,
      kind: fee.isPercentage ? 'percentage' : 'money',
      amount,
      text: null,
    })
    if (fee.conceptCode === 'treasury_management' && fee.currency) {
      items.push({
        label: `${meta.label} Currency`,
        kind: 'text',
        amount: null,
        text: fee.currency.isoCode3,
      })
    }
  }
  return items
}

export async function buildLegalData(quote: Quote): Promise<QuoteLegalData> {
  await quote.load('defaultFeeCurrency')
  await quote.load('fundingCurrency')
  await quote.load('fundingCurrencies')
  await quote.load('sourceCurrency')
  await quote.load('sourceCurrencies')
  await quote.load('corridors', (q) => {
    q.withScopes((s) => s.priced())
    q.preload('corridor', (cq) => cq.preload('country').preload('payoutCurrency'))
    q.preload('fundingCurrency')
    q.preload('tiers', (tq) => tq.orderBy('tierNumber', 'asc'))
  })
  const setupFee = await quote
    .related('setupFee')
    .query()
    .preload('paymentMilestones', (q) => q.orderBy('sortOrder', 'asc'))
    .preload('mcfPrincipalSlots', (q) => q.orderBy('slotIndex', 'asc'))
    .preload('mcfBlockFees')
    .preload('otherFees', (q) => q.preload('currency'))
    .first()

  const blockers: string[] = []
  const feeCurrency = quote.defaultFeeCurrency ?? null
  // The Summary tab saves funding currencies as a list and the source currency
  // as a single value; each falls back to the other storage so neither form is missed.
  const fundingCurrencies =
    quote.fundingCurrencies.length > 0
      ? quote.fundingCurrencies.map((c) => c.isoCode3)
      : quote.fundingCurrency
        ? [quote.fundingCurrency.isoCode3]
        : []
  const sourceCurrencies = quote.sourceCurrency
    ? [quote.sourceCurrency.isoCode3]
    : quote.sourceCurrencies.map((c) => c.isoCode3)

  if (quote.contractLengthYears === null)
    blockers.push('Contract length is not set on the Summary tab.')
  if (!feeCurrency) blockers.push('Fee currency is not set on the Summary tab.')
  if (fundingCurrencies.length === 0)
    blockers.push('Funding currency is not set on the Summary tab.')
  if (sourceCurrencies.length === 0) blockers.push('Source currency is not set on the Summary tab.')
  if (!quote.fxModel) blockers.push('FX model is not set on the Summary tab.')
  if (!quote.selectedPricingStrategy)
    blockers.push('Pricing strategy is not set on the Summary tab.')
  if (!setupFee) blockers.push('No Setup Fee has been saved yet.')
  if (quote.corridors.length === 0) blockers.push('No priced corridors are saved yet.')

  const conversionCurrency = feeCurrency ? toConversionCurrency(feeCurrency) : undefined
  const rows: LegalCorridorRow[] = []
  let missingRate = false

  const fundingCurrencyIdsByCorridor = new Map<number, Set<number | null>>()
  for (const row of quote.corridors) {
    const set = fundingCurrencyIdsByCorridor.get(row.corridorId) ?? new Set<number | null>()
    set.add(row.fundingCurrencyId)
    fundingCurrencyIdsByCorridor.set(row.corridorId, set)
  }
  const hasMultipleFundingCurrencies = [...fundingCurrencyIdsByCorridor.values()].some(
    (set) => set.size > 1
  )

  for (const row of quote.corridors) {
    const catalog = row.corridor
    const terms =
      row.pricingModel === 'tiered' && row.tiers.length > 0
        ? row.tiers.map((tier) => ({
            tier: tier.tierNumber,
            yearlyVolumeUsd: Number(tier.yearlyVolumeUsd),
            fixedFeeUsd: Number(tier.fixedFeeUsd),
            variableFeePct: Number(tier.variableFeePct),
            appliedFxSpread: Number(tier.appliedFxSpread),
          }))
        : [
            {
              tier: null,
              yearlyVolumeUsd: Number(row.yearlyVolumeUsd),
              fixedFeeUsd: Number(row.fixedFeeUsd),
              variableFeePct: Number(row.variableFeePct),
              appliedFxSpread: Number(row.appliedFxSpread),
            },
          ]

    for (const term of terms) {
      const converted = usdToFeeCurrencyAmount(term.fixedFeeUsd, conversionCurrency)
      if (converted === null && conversionCurrency) missingRate = true
      rows.push({
        country: catalog.country.name,
        countryCode: catalog.country.isoCode3,
        service: catalog.serviceCode,
        transactionType: catalog.transactionTypeCode,
        payoutCurrency: catalog.payoutCurrency.isoCode3,
        payer: catalog.payerCode,
        fundingCurrency: hasMultipleFundingCurrencies
          ? (row.fundingCurrency?.isoCode3 ?? null)
          : null,
        tier: term.tier,
        yearlyVolumeUsd: term.yearlyVolumeUsd,
        feeCurrency: feeCurrency?.isoCode3 ?? '',
        fixedFee: converted === null ? 0 : round3(converted),
        variableFeePct: term.variableFeePct,
        feeDiscountPct: Number(row.feeDiscountPct),
        fxSpreadPct: quote.showFxSpreadInContract ? term.appliedFxSpread : null,
        fxSource: quote.showFxSourceInContract ? (catalog.fxSource ?? '') : null,
      })
    }
  }

  if (missingRate && feeCurrency) {
    blockers.push(
      `No conversion rate is configured for the fee currency ${feeCurrency.isoCode3}, so fixed fees can't be shown in it.`
    )
  }

  rows.sort(
    (a, b) =>
      a.country.localeCompare(b.country) ||
      a.service.localeCompare(b.service) ||
      a.transactionType.localeCompare(b.transactionType) ||
      a.payoutCurrency.localeCompare(b.payoutCurrency) ||
      a.payer.localeCompare(b.payer) ||
      (a.fundingCurrency ?? '').localeCompare(b.fundingCurrency ?? '') ||
      (a.tier ?? 0) - (b.tier ?? 0)
  )

  let commitment: LegalCommitment | null = null
  let payment: LegalPaymentTerms | null = null
  let otherLineItems: LegalOtherLineItem[] = []
  let otherFees: LegalOtherFees = {}
  let oneOffFee: QuoteLegalData['oneOffFee'] = null

  if (setupFee) {
    const inputs = await loadSetupFeeInputs(quote)
    if (inputs && quote.contractLengthYears !== null) {
      const { fees } = monthlyCommitmentFeeSchedule(inputs)
      commitment = buildCommitment(setupFee, fees, computeSetupFeeTotals(inputs).finalCommitmentFee)
    }
    payment = buildPayment(setupFee)
    otherLineItems = buildOtherLineItems(setupFee)
    otherFees = buildOtherFees(setupFee)
    const amount = Number(setupFee.quotedPrice)
    oneOffFee = {
      feeType: setupFee.feeType,
      label: labelFor(FEE_TYPE_OPTIONS, setupFee.feeType),
      amount,
    }
  }

  return {
    status: quote.status,
    isApproved: quote.status === 'approved',
    blockers,
    quoteName: quote.name,
    prCode: quote.partnerPrCode,
    contractYears: quote.contractLengthYears === null ? null : Number(quote.contractLengthYears),
    pricingModel: quote.selectedPricingStrategy
      ? PRICING_STRATEGY_LABELS[quote.selectedPricingStrategy as PricingStrategy]
      : null,
    fxModel: quote.fxModel ? FX_MODEL_LABELS[quote.fxModel as FxModel] : null,
    feeCurrency: feeCurrency?.isoCode3 ?? null,
    fundingCurrencies,
    sourceCurrencies,
    oneOffFee,
    otherLineItems,
    otherFees,
    showFxSpread: quote.showFxSpreadInContract,
    showFxSource: quote.showFxSourceInContract,
    corridorRows: rows,
    corridorCount: quote.corridors.length,
    countryCount: new Set(rows.map((r) => r.country)).size,
    services: [...new Set(rows.map((r) => r.service))].sort(),
    hasTiers: rows.some((r) => r.tier !== null),
    hasMultipleFundingCurrencies,
    hasFeeDiscount: rows.some((r) => r.feeDiscountPct > 0),
    commitment,
    payment,
  }
}
