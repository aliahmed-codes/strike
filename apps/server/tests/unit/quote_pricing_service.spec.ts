import { test } from '@japa/runner'
import { computeCorridorPricing, computeQuoteTotals } from '#services/quote_pricing_service'

test.group('computeCorridorPricing', () => {
  test('computes revenue, margin, and take rate from volume/fee inputs', ({ assert }) => {
    const result = computeCorridorPricing({
      yearlyVolumeUsd: 1_000_000,
      yearlyTransactions: 10_000,
      fixedFeeUsd: 0.5,
      variableFeePct: 1,
      appliedFxSpread: 0.5,
      feeDiscountPct: 0,
    })

    // variableRevenue = 1_000_000 * 1% = 10_000
    // fixedRevenue = 10_000 * 0.5 = 5_000
    // revenueFee = 15_000 (no discount)
    // fxMargin = 1_000_000 * 0.5% = 5_000
    // totalRevenue = 20_000
    assert.equal(result.revenueFee, 15_000)
    assert.equal(result.fxMargin, 5_000)
    assert.equal(result.totalRevenue, 20_000)
    assert.equal(result.totalMargin, 20_000)
    assert.equal(result.takeRatePct, 2) // 20_000 / 1_000_000 * 100
  })

  test('applies the fee discount to the fee-based revenue only', ({ assert }) => {
    const result = computeCorridorPricing({
      yearlyVolumeUsd: 1_000_000,
      yearlyTransactions: 0,
      fixedFeeUsd: 0,
      variableFeePct: 1,
      appliedFxSpread: 0,
      feeDiscountPct: 50,
    })

    // variableRevenue = 10_000, halved by the 50% discount
    assert.equal(result.revenueFee, 5_000)
  })

  test('returns zero rates when volume is zero, without dividing by zero', ({ assert }) => {
    const result = computeCorridorPricing({
      yearlyVolumeUsd: 0,
      yearlyTransactions: 0,
      fixedFeeUsd: 0,
      variableFeePct: 1,
      appliedFxSpread: 1,
      feeDiscountPct: 0,
    })

    assert.equal(result.takeRatePct, 0)
    assert.equal(result.marginPct, 0)
  })

  test('flags needs_approval when the fee discount exceeds the threshold', ({ assert }) => {
    const result = computeCorridorPricing({
      yearlyVolumeUsd: 1_000_000,
      yearlyTransactions: 0,
      fixedFeeUsd: 0,
      variableFeePct: 1,
      appliedFxSpread: 1,
      feeDiscountPct: 40,
    })

    assert.isTrue(result.needsApproval)
    assert.isTrue(result.approvalReasons.some((r) => r.includes('Fee discount')))
  })

  test('flags needs_approval when gross margin is below the threshold', ({ assert }) => {
    const result = computeCorridorPricing({
      yearlyVolumeUsd: 1_000_000,
      yearlyTransactions: 0,
      fixedFeeUsd: 0,
      variableFeePct: 0,
      appliedFxSpread: 0,
      feeDiscountPct: 0,
    })

    // Zero revenue -> grossMarginPct is 0, below the 20% threshold.
    assert.isTrue(result.needsApproval)
    assert.isTrue(result.approvalReasons.some((r) => r.includes('Gross margin')))
  })

  test('does not flag needs_approval for a healthy corridor', ({ assert }) => {
    const result = computeCorridorPricing({
      yearlyVolumeUsd: 1_000_000,
      yearlyTransactions: 10_000,
      fixedFeeUsd: 0.5,
      variableFeePct: 1,
      appliedFxSpread: 0.5,
      feeDiscountPct: 0,
    })

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
