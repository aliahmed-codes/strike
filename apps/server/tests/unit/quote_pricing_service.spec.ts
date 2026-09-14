import { test } from '@japa/runner'
import {
  computeCorridorPricing,
  computeQuoteTotals,
  type CorridorMasterData,
  type CorridorPricingInputs,
} from '#services/quote_pricing_service'

/** A corridor with real master data present and clean (no network restrictions). */
const CLEAN_CORRIDOR: CorridorMasterData = {
  fxSource: 'Cost Plus',
  treasuryFxCostSpread: 0,
  costFixedUsd: 0,
  costVariablePct: 0,
  networkNeedApprovalRaw: 'No',
  internalRaw: 'None',
  centralBankRaw: 'None',
}

function baseInputs(overrides: Partial<CorridorPricingInputs> = {}): CorridorPricingInputs {
  return {
    yearlyVolumeUsd: 1_000_000,
    yearlyTransactions: 10_000,
    fixedFeeUsd: 0.5,
    variableFeePct: 1,
    appliedFxSpread: 0.5,
    feeDiscountPct: 0,
    transactionTypeCode: 'B2C',
    fundingCurrencyId: null,
    payoutCurrencyId: 1,
    opportunityType: null,
    corridor: CLEAN_CORRIDOR,
    ...overrides,
  }
}

test.group('computeCorridorPricing', () => {
  test('computes revenue, margin, and take rate from volume/fee inputs', ({ assert }) => {
    const result = computeCorridorPricing(baseInputs())

    // variableRevenue = 1_000_000 * 1% = 10_000
    // fixedRevenue = 10_000 * 0.5 = 5_000
    // revenueFee = 15_000 (no discount)
    // fxSource is Cost Plus -> fxMargin = 1_000_000 * 0.5% = 5_000
    // totalRevenue = 20_000; no cost data -> marginFee = revenueFee -> totalMargin = 20_000
    assert.equal(result.revenueFee, 15_000)
    assert.equal(result.fxMargin, 5_000)
    assert.equal(result.totalRevenue, 20_000)
    assert.equal(result.totalMargin, 20_000)
    assert.equal(result.takeRatePct, 2) // 20_000 / 1_000_000 * 100
  })

  test('applies the fee discount to the fee-based revenue only', ({ assert }) => {
    const result = computeCorridorPricing(
      baseInputs({
        yearlyTransactions: 0,
        fixedFeeUsd: 0,
        appliedFxSpread: 0,
        feeDiscountPct: 50,
      })
    )

    // variableRevenue = 10_000, halved by the 50% discount
    assert.equal(result.revenueFee, 5_000)
  })

  test('returns zero rates when volume is zero, without dividing by zero', ({ assert }) => {
    const result = computeCorridorPricing(
      baseInputs({ yearlyVolumeUsd: 0, yearlyTransactions: 0, fixedFeeUsd: 0, appliedFxSpread: 1 })
    )

    assert.equal(result.takeRatePct, 0)
    assert.equal(result.marginPct, 0)
  })

  test('FX margin is zero when funding and payout currency match (non-Cost-Plus)', ({ assert }) => {
    const result = computeCorridorPricing(
      baseInputs({
        fundingCurrencyId: 7,
        payoutCurrencyId: 7,
        corridor: { ...CLEAN_CORRIDOR, fxSource: 'Reuters Bid rates' },
      })
    )
    assert.equal(result.fxMargin, 0)
  })

  test('FX margin nets the treasury FX cost against the spread outside Cost Plus', ({ assert }) => {
    const result = computeCorridorPricing(
      baseInputs({
        appliedFxSpread: 1, // 1% = 0.01 fraction
        corridor: { ...CLEAN_CORRIDOR, fxSource: 'Reuters Bid rates', treasuryFxCostSpread: 0.002 },
      })
    )
    // fxMargin = 1_000_000 * (0.01 - 0.002) = 8_000
    assert.equal(result.fxMargin, 8_000)
  })

  test('margin fee subtracts the real cost basis from revenue', ({ assert }) => {
    const result = computeCorridorPricing(
      baseInputs({
        appliedFxSpread: 0,
        corridor: {
          ...CLEAN_CORRIDOR,
          costFixedUsd: 0.1, // per transaction
          costVariablePct: 0.002, // fraction of volume
        },
      })
    )
    // revenueFee = 15_000; cost = 10_000*0.1 + 1_000_000*0.002 = 1_000 + 2_000 = 3_000
    assert.equal(result.marginFee, 12_000)
  })

  test('flags needs_financial_approval when the fee discount exceeds the threshold', ({
    assert,
  }) => {
    const result = computeCorridorPricing(baseInputs({ feeDiscountPct: 40 }))

    assert.isTrue(result.needsFinancialApproval)
    assert.isTrue(result.financialApprovalReasons.some((r) => r.includes('Fee discount')))
  })

  test('flags needs_financial_approval when gross margin is negative for a non-flagged opportunity type', ({
    assert,
  }) => {
    const result = computeCorridorPricing(
      baseInputs({
        yearlyVolumeUsd: 1_000,
        yearlyTransactions: 10,
        fixedFeeUsd: 0.5,
        variableFeePct: 0,
        appliedFxSpread: 0,
        corridor: { ...CLEAN_CORRIDOR, costFixedUsd: 10 }, // cost far exceeds the $5 revenue
      })
    )

    assert.isTrue(result.needsFinancialApproval)
    assert.isTrue(result.financialApprovalReasons.some((r) => r.includes('Gross margin')))
  })

  test('uses the New Partner 60% gross-margin threshold', ({ assert }) => {
    const result = computeCorridorPricing(
      baseInputs({ opportunityType: 'New Partner', appliedFxSpread: 0 })
    )
    // grossMarginPct here is 100% (no cost data) - well above 60%, so this
    // should NOT be flagged; confirms the threshold is being read correctly.
    assert.isFalse(result.financialApprovalReasons.some((r) => r.includes('Gross margin')))
  })

  test('B2B transaction type always requires financial approval', ({ assert }) => {
    const result = computeCorridorPricing(baseInputs({ transactionTypeCode: 'B2B' }))
    assert.isTrue(result.needsFinancialApproval)
    assert.isTrue(result.financialApprovalReasons.some((r) => r.includes('B2B')))
  })

  test('flags needs_network_approval from the corridor catalog Need Approval flag', ({
    assert,
  }) => {
    const result = computeCorridorPricing(
      baseInputs({ corridor: { ...CLEAN_CORRIDOR, networkNeedApprovalRaw: 'Yes' } })
    )
    assert.isTrue(result.needsNetworkApproval)
    assert.isTrue(result.networkApprovalReasons.some((r) => r.includes('Need Approval')))
  })

  test('flags needs_network_approval from an Internal restriction', ({ assert }) => {
    const result = computeCorridorPricing(
      baseInputs({ corridor: { ...CLEAN_CORRIDOR, internalRaw: 'NETWORK' } })
    )
    assert.isTrue(result.needsNetworkApproval)
    assert.isTrue(result.networkApprovalReasons.some((r) => r.includes('Internal restriction')))
  })

  test('flags needs_network_approval when no master data exists for the corridor', ({ assert }) => {
    const result = computeCorridorPricing(
      baseInputs({
        corridor: {
          fxSource: null,
          treasuryFxCostSpread: null,
          costFixedUsd: null,
          costVariablePct: null,
          networkNeedApprovalRaw: null,
          internalRaw: null,
          centralBankRaw: null,
        },
      })
    )
    assert.isTrue(result.needsNetworkApproval)
    assert.isTrue(result.networkApprovalReasons.some((r) => r.includes('not available')))
  })

  test('does not flag needs_approval for a healthy, clean corridor', ({ assert }) => {
    const result = computeCorridorPricing(baseInputs())

    assert.isFalse(result.needsFinancialApproval)
    assert.isFalse(result.needsNetworkApproval)
    assert.isFalse(result.needsApproval)
    assert.deepEqual(result.approvalReasons, [])
  })
})

test.group('computeQuoteTotals', () => {
  test('sums revenue/margin/volume across corridors and computes weighted rates', ({ assert }) => {
    const totals = computeQuoteTotals([
      {
        totalRevenue: 20_000,
        totalMargin: 20_000,
        yearlyVolumeUsd: 1_000_000,
        yearlyTransactions: 10_000,
        needsApproval: false,
      },
      {
        totalRevenue: 10_000,
        totalMargin: 5_000,
        yearlyVolumeUsd: 500_000,
        yearlyTransactions: 5_000,
        needsApproval: true,
      },
      // A corridor that hasn't been priced yet (never computed).
      {
        totalRevenue: null,
        totalMargin: null,
        yearlyVolumeUsd: 0,
        yearlyTransactions: 0,
        needsApproval: false,
      },
    ])

    assert.equal(totals.totalRevenue, 30_000)
    assert.equal(totals.totalMargin, 25_000)
    assert.equal(totals.totalVolumeUsd, 1_500_000)
    assert.equal(totals.totalTransactions, 15_000)
    assert.equal(totals.corridorCount, 3)
    assert.equal(totals.corridorsNeedingApproval, 1)
    // averageTakeRatePct = 30_000 / 1_500_000 * 100
    assert.equal(totals.averageTakeRatePct, 2)
  })

  test('returns zeros for a quote with no corridors', ({ assert }) => {
    const totals = computeQuoteTotals([])

    assert.equal(totals.totalRevenue, 0)
    assert.equal(totals.corridorCount, 0)
    assert.equal(totals.averageTakeRatePct, 0)
  })
})
