import { test } from '@japa/runner'
import {
  computeQuotePnl,
  computePnlApprovalReasons,
  type PnlPricedCorridor,
  type PnlSetupFeeInputs,
} from '#services/quote_pnl_service'

function corridor(overrides: Partial<PnlPricedCorridor> = {}): PnlPricedCorridor {
  return {
    yearlyVolumeUsd: 1_000_000,
    yearlyTransactions: 10_000,
    revenueFee: 15_000,
    fxMargin: 5_000,
    marginFee: 15_000,
    totalMargin: 20_000,
    ...overrides,
  }
}

function setupFee(overrides: Partial<PnlSetupFeeInputs> = {}): PnlSetupFeeInputs {
  return {
    quotedPrice: 0,
    mcfType: 'standard',
    standardCommitmentFee: 0,
    commitmentFeeDiscountPct: 0,
    mcfPrincipalSlots: [],
    mcfBlockFees: [],
    waivedMonths: 0,
    contractLengthYears: 3,
    ...overrides,
  }
}

test.group('computeQuotePnl', () => {
  test('Year 1 aggregates corridor sums with real ratios', ({ assert }) => {
    const result = computeQuotePnl({
      corridors: [corridor()],
      setupFee: null,
      year2GrowthPct: 0,
      year3GrowthPct: 0,
    })

    assert.equal(result.year1.principal, 1_000_000)
    assert.equal(result.year1.transactions, 10_000)
    assert.equal(result.year1.atvUsd, 100)
    assert.equal(result.year1.feeRevenue, 15_000)
    assert.equal(result.year1.fxMargin, 5_000)
    assert.equal(result.year1.totalRevenue, 20_000)
    assert.equal(result.year1.totalMargin, 20_000)
    assert.equal(result.year1.takeRatePct, 2)
    assert.equal(result.year1.grossMarginPct, 100)
  })

  test('negative corridor margin is never replaced with a positive fallback (D3)', ({ assert }) => {
    const result = computeQuotePnl({
      corridors: [corridor({ revenueFee: 100, fxMargin: 0, marginFee: -20, totalMargin: -20 })],
      setupFee: null,
      year2GrowthPct: 0,
      year3GrowthPct: 0,
    })

    // Old app's bug: F + X + MF = 100 + 0 + (-20) = 80. Must NOT appear here.
    assert.equal(result.year1.totalMargin, -20)
    assert.notEqual(result.year1.totalMargin, 80)
  })

  test('an explicit 0% growth input keeps Year 2/3 flat, never a 15% default (D4)', ({
    assert,
  }) => {
    const result = computeQuotePnl({
      corridors: [corridor()],
      setupFee: null,
      year2GrowthPct: 0,
      year3GrowthPct: 0,
    })

    assert.equal(result.year2.principal, result.year1.principal)
    assert.equal(result.year3.principal, result.year1.principal)
    assert.equal(result.year2.feeRevenue, result.year1.feeRevenue)
  })

  test('growth compounds Year 2 over Year 1, and Year 3 over Year 2', ({ assert }) => {
    const result = computeQuotePnl({
      corridors: [corridor()],
      setupFee: null,
      year2GrowthPct: 10,
      year3GrowthPct: 20,
    })

    assert.equal(result.year2.principal, 1_100_000)
    assert.equal(result.year3.principal, 1_320_000)
  })

  test('the one-off setup fee applies to Year 1 revenue only', ({ assert }) => {
    const result = computeQuotePnl({
      corridors: [corridor()],
      setupFee: setupFee({ quotedPrice: 50_000 }),
      year2GrowthPct: 10,
      year3GrowthPct: 10,
    })

    assert.equal(result.year1.oneOffFee, 50_000)
    assert.equal(result.year2.oneOffFee, 0)
    assert.equal(result.year3.oneOffFee, 0)
    assert.equal(result.year1.totalRevenue, 20_000 + 50_000)
  })

  test('MCF commitment fee revenue is split into the correct year by its real month range, not guessed', ({
    assert,
  }) => {
    const result = computeQuotePnl({
      corridors: [corridor()],
      setupFee: setupFee({
        mcfBlockFees: [
          { blockKey: 'y1_h1', commitmentFee: 100 },
          { blockKey: 'y1_h2', commitmentFee: 100 },
          { blockKey: 'y2', commitmentFee: 200 },
          { blockKey: 'y3', commitmentFee: 300 },
        ],
      }),
      year2GrowthPct: 0,
      year3GrowthPct: 0,
    })

    // Year 1 = 6 months * 100 (h1) + 6 months * 100 (h2) = 1200
    assert.equal(result.year1.commitmentFeeRevenue, 1200)
    // Year 2 = 12 months * 200
    assert.equal(result.year2.commitmentFeeRevenue, 2400)
    // Year 3 = 12 months * 300
    assert.equal(result.year3.commitmentFeeRevenue, 3600)
  })

  test('MCF commitment fees never extrapolate past the actual contract length', ({ assert }) => {
    const result = computeQuotePnl({
      corridors: [corridor()],
      setupFee: setupFee({
        contractLengthYears: 1,
        mcfBlockFees: [
          { blockKey: 'y1_h1', commitmentFee: 100 },
          { blockKey: 'y1_h2', commitmentFee: 100 },
        ],
      }),
      year2GrowthPct: 0,
      year3GrowthPct: 0,
    })

    assert.equal(result.year1.commitmentFeeRevenue, 1200)
    // Contract is only 1 year — Year 2/3 must be 0, not the y1 blocks repeated or a fallback guess.
    assert.equal(result.year2.commitmentFeeRevenue, 0)
    assert.equal(result.year3.commitmentFeeRevenue, 0)
  })

  test('no setup fee means no one-off or commitment-fee revenue at all', ({ assert }) => {
    const result = computeQuotePnl({
      corridors: [corridor()],
      setupFee: null,
      year2GrowthPct: 0,
      year3GrowthPct: 0,
    })

    assert.equal(result.year1.oneOffFee, 0)
    assert.equal(result.year1.commitmentFeeRevenue, 0)
  })

  test('an empty corridor list produces zeroed, non-NaN results', ({ assert }) => {
    const result = computeQuotePnl({
      corridors: [],
      setupFee: null,
      year2GrowthPct: 10,
      year3GrowthPct: 10,
    })

    assert.equal(result.year1.principal, 0)
    assert.equal(result.year1.takeRatePct, 0)
    assert.equal(result.year1.grossMarginPct, 0)
    assert.equal(result.year1.atvUsd, 0)
    assert.isFalse(Number.isNaN(result.year1.marginPct))
  })
})

test.group('computePnlApprovalReasons', () => {
  test('flags a New Partner quote below the 60% GM threshold', ({ assert }) => {
    const reasons = computePnlApprovalReasons({
      opportunityType: 'New partner',
      hasB2BCorridor: false,
      year1GrossMarginPct: 50,
      year1MarginPct: 1,
      year1FxMargin: 100,
    })

    assert.isTrue(reasons.some((r) => r.includes('60%')))
  })

  test('does not flag GM for an unlisted opportunity type unless it is negative', ({ assert }) => {
    const clean = computePnlApprovalReasons({
      opportunityType: 'Renewal',
      hasB2BCorridor: false,
      year1GrossMarginPct: 10,
      year1MarginPct: 1,
      year1FxMargin: 100,
    })
    assert.isEmpty(clean)

    const negative = computePnlApprovalReasons({
      opportunityType: 'Renewal',
      hasB2BCorridor: false,
      year1GrossMarginPct: -5,
      year1MarginPct: 1,
      year1FxMargin: 100,
    })
    assert.isTrue(negative.some((r) => r.includes('negative')))
  })

  test('uses the B2B margin-percent threshold only when a B2B corridor is present', ({
    assert,
  }) => {
    const nonB2B = computePnlApprovalReasons({
      opportunityType: null,
      hasB2BCorridor: false,
      year1GrossMarginPct: 90,
      year1MarginPct: 0.3,
      year1FxMargin: 100,
    })
    assert.isTrue(nonB2B.some((r) => r.includes('0.4%')))

    const b2b = computePnlApprovalReasons({
      opportunityType: null,
      hasB2BCorridor: true,
      year1GrossMarginPct: 90,
      year1MarginPct: 0.3,
      year1FxMargin: 100,
    })
    assert.isEmpty(b2b)
  })

  test('flags a negative Year 1 FX margin', ({ assert }) => {
    const reasons = computePnlApprovalReasons({
      opportunityType: null,
      hasB2BCorridor: false,
      year1GrossMarginPct: 90,
      year1MarginPct: 1,
      year1FxMargin: -1,
    })

    assert.isTrue(reasons.some((r) => r.includes('FX margin is negative')))
  })
})
