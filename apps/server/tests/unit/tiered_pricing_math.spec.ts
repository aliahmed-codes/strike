import { test } from '@japa/runner'
import {
  computeTieredCorridorPricing,
  validateTierAllocation,
  type CorridorMasterData,
  type TieredCorridorPricingInputs,
} from '#services/quote_pricing_service'

const CLEAN_CORRIDOR: CorridorMasterData = {
  fxSource: 'Cost Plus',
  treasuryFxCostSpread: 0,
  costFixedUsd: 0,
  costVariablePct: 0,
  networkNeedApprovalRaw: 'No',
  internalRaw: 'None',
  centralBankRaw: 'None',
}

function baseInputs(
  overrides: Partial<TieredCorridorPricingInputs> = {}
): TieredCorridorPricingInputs {
  return {
    totalYearlyVolumeUsd: 1_000_000,
    atvUsd: 500,
    standardFixedFeeUsd: 1,
    standardVariableFeePct: 1,
    standardAppliedFxSpread: 1,
    feeDiscountPct: 0,
    tiers: [],
    transactionTypeCode: 'B2C',
    fundingCurrencyId: null,
    payoutCurrencyId: 1,
    opportunityType: null,
    corridor: CLEAN_CORRIDOR,
    ...overrides,
  }
}

test.group('validateTierAllocation', () => {
  test('accepts tiers that fit within the total volume', ({ assert }) => {
    const errors = validateTierAllocation(1_000_000, [
      {
        tierNumber: 1,
        yearlyVolumeUsd: 300_000,
        fixedFeeUsd: 0.5,
        variableFeePct: 0.5,
        appliedFxSpread: 0.5,
      },
      {
        tierNumber: 2,
        yearlyVolumeUsd: 200_000,
        fixedFeeUsd: 0.4,
        variableFeePct: 0.4,
        appliedFxSpread: 0.4,
      },
    ])
    assert.deepEqual(errors, [])
  })

  test('rejects tiers that sum to more than the total volume', ({ assert }) => {
    const errors = validateTierAllocation(1_000_000, [
      {
        tierNumber: 1,
        yearlyVolumeUsd: 700_000,
        fixedFeeUsd: 0.5,
        variableFeePct: 0.5,
        appliedFxSpread: 0.5,
      },
      {
        tierNumber: 2,
        yearlyVolumeUsd: 500_000,
        fixedFeeUsd: 0.4,
        variableFeePct: 0.4,
        appliedFxSpread: 0.4,
      },
    ])
    assert.isTrue(errors.some((e) => e.includes('exceeds')))
  })

  test('rejects a duplicate tier number', ({ assert }) => {
    const errors = validateTierAllocation(1_000_000, [
      {
        tierNumber: 1,
        yearlyVolumeUsd: 100_000,
        fixedFeeUsd: 0.5,
        variableFeePct: 0.5,
        appliedFxSpread: 0.5,
      },
      {
        tierNumber: 1,
        yearlyVolumeUsd: 100_000,
        fixedFeeUsd: 0.4,
        variableFeePct: 0.4,
        appliedFxSpread: 0.4,
      },
    ])
    assert.isTrue(errors.some((e) => e.includes('more than once')))
  })

  test('rejects an out-of-range tier number', ({ assert }) => {
    const errors = validateTierAllocation(1_000_000, [
      {
        tierNumber: 4,
        yearlyVolumeUsd: 100_000,
        fixedFeeUsd: 0.5,
        variableFeePct: 0.5,
        appliedFxSpread: 0.5,
      },
    ])
    assert.isTrue(errors.some((e) => e.includes('must be 1, 2, or 3')))
  })
})

test.group('computeTieredCorridorPricing', () => {
  test('with no tiers, behaves exactly like pricing the whole corridor at standard rates', ({
    assert,
  }) => {
    const result = computeTieredCorridorPricing(baseInputs())
    // Whole $1M at $1/txn (2000 txns via $500 ATV) + 1% variable + Cost Plus 1% spread
    // revenueFee = 2000*1 + 1_000_000*0.01 = 2000 + 10000 = 12000
    // fxMargin (Cost Plus) = 1_000_000 * 0.01 = 10000
    assert.equal(result.revenueFee, 12_000)
    assert.equal(result.fxMargin, 10_000)
    assert.equal(result.totalRevenue, 22_000)
    assert.equal(result.tiers.length, 0)
    assert.equal(result.standard.yearlyTransactions, 2000)
    // totalMargin = fxMargin(10_000) + marginFee(12_000, no cost data) = 22_000
    // marginFeePct (fee-only) = 12_000 / 1_000_000 * 100 = 1.2; marginPct (incl. FX) = 22_000 / 1_000_000 * 100 = 2.2
    assert.equal(result.marginFeePct, 1.2)
    assert.equal(result.marginPct, 2.2)
  })

  test('splits volume between a tier and the standard remainder', ({ assert }) => {
    const result = computeTieredCorridorPricing(
      baseInputs({
        tiers: [
          {
            tierNumber: 1,
            yearlyVolumeUsd: 400_000,
            fixedFeeUsd: 0.5,
            variableFeePct: 0.5,
            appliedFxSpread: 0.5,
          },
        ],
      })
    )
    // Standard slice gets the remaining 600,000
    assert.equal(result.tiers.length, 1)
    assert.equal(result.tiers[0].tierNumber, 1)
    assert.equal(result.totalVolumeUsd, 1_000_000)
    // Standard revenue: 600_000 vol, txns = ceil(600000/500)=1200 -> 1200*1 + 600000*0.01 = 1200+6000=7200
    // Tier1 revenue: 400_000 vol, txns=ceil(400000/500)=800 -> 800*0.5 + 400000*0.005 = 400+2000=2400
    assert.equal(result.revenueFee, 7_200 + 2_400)
  })

  test('derives each slice transaction count from volume / ATV', ({ assert }) => {
    const result = computeTieredCorridorPricing(
      baseInputs({
        atvUsd: 1000,
        tiers: [
          {
            tierNumber: 1,
            yearlyVolumeUsd: 250_000,
            fixedFeeUsd: 0,
            variableFeePct: 0,
            appliedFxSpread: 0,
          },
        ],
      })
    )
    assert.equal(result.tiers[0].yearlyTransactions, 250) // 250_000 / 1000
    assert.equal(result.standard.yearlyTransactions, 750) // 750_000 / 1000
    assert.equal(result.totalTransactions, 1000)
  })

  test('over-allocated tiers clamp the standard remainder to zero, not negative', ({ assert }) => {
    const result = computeTieredCorridorPricing(
      baseInputs({
        tiers: [
          {
            tierNumber: 1,
            yearlyVolumeUsd: 1_200_000,
            fixedFeeUsd: 0,
            variableFeePct: 0,
            appliedFxSpread: 0,
          },
        ],
      })
    )
    assert.equal(result.standard.yearlyTransactions, 0)
  })

  test('rolls up needs_approval from any slice, prefixed by tier label', ({ assert }) => {
    const result = computeTieredCorridorPricing(
      baseInputs({
        tiers: [
          {
            tierNumber: 1,
            yearlyVolumeUsd: 100_000,
            fixedFeeUsd: 0,
            variableFeePct: 0,
            appliedFxSpread: 0,
          },
        ],
        corridor: { ...CLEAN_CORRIDOR, networkNeedApprovalRaw: 'Yes' },
      })
    )
    assert.isTrue(result.needsApproval)
    assert.isTrue(result.needsNetworkApproval)
    assert.isTrue(result.approvalReasons.some((r) => r.startsWith('Standard:')))
    assert.isTrue(result.approvalReasons.some((r) => r.startsWith('Tier 1:')))
  })

  test('a healthy tiered corridor with clean data needs no approval', ({ assert }) => {
    const result = computeTieredCorridorPricing(
      baseInputs({
        tiers: [
          {
            tierNumber: 1,
            yearlyVolumeUsd: 300_000,
            fixedFeeUsd: 0.8,
            variableFeePct: 0.8,
            appliedFxSpread: 0.8,
          },
        ],
      })
    )
    assert.isFalse(result.needsApproval)
    assert.deepEqual(result.approvalReasons, [])
  })
})
