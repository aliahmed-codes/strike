import { test } from '@japa/runner'
import {
  computeMbpAdjustment,
  matchesTransactionType,
  type MbpMatchContext,
  type MbpReferenceData,
} from '#services/mbp_pricing_service'

/** Denmark's real IDs are irrelevant — only the relationships between them matter for the matcher. */
const EUROPE_REGION_ID = 1
const PLATFORM_ICP_L1_ID = 28
const FINANCIAL_SERVICES_TECH_ICP_L2_ID = 29
const PAYMENT_ORCHESTRATOR_ICP_L3_ID = 30
const DENMARK_COUNTRY_ID = 100

function emptyData(overrides: Partial<MbpReferenceData> = {}): MbpReferenceData {
  return {
    countryTiers: [],
    regionPressures: [],
    icpSensitivities: [],
    decisionMatrix: [],
    gridFeeAdjustments: [],
    strategicOverrides: [],
    ...overrides,
  }
}

function baseContext(overrides: Partial<MbpMatchContext> = {}): MbpMatchContext {
  return {
    regionId: EUROPE_REGION_ID,
    icpLevel1Id: PLATFORM_ICP_L1_ID,
    icpLevel2Id: FINANCIAL_SERVICES_TECH_ICP_L2_ID,
    icpLevel3Id: PAYMENT_ORCHESTRATOR_ICP_L3_ID,
    countryId: DENMARK_COUNTRY_ID,
    transactionTypeCode: 'B2B',
    ...overrides,
  }
}

/** The exact real-world data behind the Denmark corridor (see docs/old-app-reference). */
const DENMARK_DATA = emptyData({
  countryTiers: [{ countryId: DENMARK_COUNTRY_ID, tier: 'G10' }],
  regionPressures: [{ regionId: EUROPE_REGION_ID, transactionType: 'B2B', pressureLevel: 'High' }],
  gridFeeAdjustments: [
    {
      id: 2,
      regionPressure: 'High',
      corridorTier: 'G10',
      icpNodeIdL1: PLATFORM_ICP_L1_ID,
      transactionType: 'B2B',
      fixedFeeUsd: 5,
      fxSpreadAdjustmentBps: 20,
      minimumFxSpreadAdjustmentBps: 15,
    },
  ],
})

test.group('computeMbpAdjustment', () => {
  test('Denmark worked example: grid rule wins, $5.00 fee and 15bps minimum-spread bump', ({ assert }) => {
    const result = computeMbpAdjustment(baseContext(), DENMARK_DATA)

    assert.isNotNull(result)
    assert.equal(result!.source, 'grid')
    assert.equal(result!.matchedRuleId, 2)
    assert.equal(result!.fixedFeeUsdOverride, 5)
    assert.isNull(result!.fixedFeeAdjustmentPct)
    assert.equal(result!.fxSpreadAdjustmentBps, 20)
    assert.equal(result!.minimumFxSpreadAdjustmentBps, 15)
  })

  test('no grid match falls back to the decision-matrix percentage adjustment', ({ assert }) => {
    const data = emptyData({
      countryTiers: [{ countryId: DENMARK_COUNTRY_ID, tier: 'G10' }],
      regionPressures: [{ regionId: EUROPE_REGION_ID, transactionType: 'B2B', pressureLevel: 'High' }],
      icpSensitivities: [
        { icpNodeIdL3: PAYMENT_ORCHESTRATOR_ICP_L3_ID, transactionType: 'B2B', sensitivity: 'High' },
      ],
      decisionMatrix: [
        {
          id: 1,
          icpSensitivity: 'High',
          regionPressure: 'High',
          pricingDecision: 'Strong Decrease',
          feeAdjustmentPercent: -30,
          fxSpreadAdjustmentBps: -5,
        },
      ],
      // No grid row at all for this context.
    })

    const result = computeMbpAdjustment(baseContext(), data)

    assert.isNotNull(result)
    assert.equal(result!.source, 'decision_matrix')
    assert.isNull(result!.fixedFeeUsdOverride)
    assert.equal(result!.fixedFeeAdjustmentPct, -30)
    assert.equal(result!.fxSpreadAdjustmentBps, -5)
    assert.equal(result!.reason, 'Strong Decrease')
  })

  test('no ICP category selected on the quote returns null (plain catalog values apply)', ({ assert }) => {
    const result = computeMbpAdjustment(baseContext({ icpLevel1Id: null }), DENMARK_DATA)
    assert.isNull(result)
  })

  test('no partner region set on the quote returns null', ({ assert }) => {
    const result = computeMbpAdjustment(baseContext({ regionId: null }), DENMARK_DATA)
    assert.isNull(result)
  })

  test('a country with no tier row returns null rather than crashing', ({ assert }) => {
    const result = computeMbpAdjustment(baseContext({ countryId: 999_999 }), DENMARK_DATA)
    assert.isNull(result)
  })

  test('region pressure exists but no ICP sensitivity row matches: returns null, not a wrong decision-matrix row', ({
    assert,
  }) => {
    const data = emptyData({
      countryTiers: [{ countryId: DENMARK_COUNTRY_ID, tier: 'G10' }],
      regionPressures: [{ regionId: EUROPE_REGION_ID, transactionType: 'B2B', pressureLevel: 'High' }],
      decisionMatrix: [
        {
          id: 1,
          icpSensitivity: 'High',
          regionPressure: 'High',
          pricingDecision: 'Strong Decrease',
          feeAdjustmentPercent: -30,
          fxSpreadAdjustmentBps: -5,
        },
      ],
      // icpSensitivities deliberately left empty.
    })

    assert.isNull(computeMbpAdjustment(baseContext(), data))
  })

  test('a "standard"-mode strategic override replaces the fee directly and beats the grid rule', ({ assert }) => {
    const data = emptyData({
      ...DENMARK_DATA,
      strategicOverrides: [
        {
          id: 10,
          countryId: DENMARK_COUNTRY_ID,
          currencyId: null,
          regionId: null,
          transactionType: null,
          icpNodeIdL1: null,
          icpNodeIdL2: null,
          icpNodeIdL3: null,
          overrideMode: 'standard',
          feeAdjustmentPercent: null,
          fxSpreadAdjustmentBps: null,
          fixedFeeUsd: 0.8,
          fxSpread: 1,
          minimumFxSpread: 0.2,
          reason: 'Denmark is part of top corridors',
          priority: 8,
          isActive: true,
          effectiveFrom: null,
          effectiveTo: null,
        },
      ],
    })

    const result = computeMbpAdjustment(baseContext(), data)

    assert.isNotNull(result)
    assert.equal(result!.source, 'strategic_override')
    assert.equal(result!.matchedRuleId, 10)
    assert.equal(result!.fixedFeeUsdOverride, 0.8)
    assert.isNull(result!.fixedFeeAdjustmentPct)
    // Standard-mode overrides replace the spread/minimum directly, in percent (not bps).
    assert.equal(result!.fxSpreadOverride, 1)
    assert.equal(result!.minimumFxSpreadOverride, 0.2)
    // The grid row's $5.00 never gets consulted.
    assert.notEqual(result!.fixedFeeUsdOverride, 5)
  })

  test('an "adjustment"-mode strategic override applies a percentage on top instead of replacing', ({ assert }) => {
    const data = emptyData({
      strategicOverrides: [
        {
          id: 11,
          countryId: DENMARK_COUNTRY_ID,
          currencyId: null,
          regionId: null,
          transactionType: null,
          icpNodeIdL1: null,
          icpNodeIdL2: null,
          icpNodeIdL3: null,
          overrideMode: 'adjustment',
          feeAdjustmentPercent: -15,
          fxSpreadAdjustmentBps: 10,
          fixedFeeUsd: null,
          fxSpread: null,
          minimumFxSpread: null,
          reason: 'Regional promotion',
          priority: 5,
          isActive: true,
          effectiveFrom: null,
          effectiveTo: null,
        },
      ],
    })

    const result = computeMbpAdjustment(baseContext(), data)

    assert.isNotNull(result)
    assert.equal(result!.source, 'strategic_override')
    assert.isNull(result!.fixedFeeUsdOverride)
    assert.equal(result!.fixedFeeAdjustmentPct, -15)
    assert.equal(result!.fxSpreadAdjustmentBps, 10)
  })

  test('among multiple matching overrides, the higher-priority one wins', ({ assert }) => {
    const lowPriority = {
      id: 20,
      countryId: DENMARK_COUNTRY_ID,
      currencyId: null,
      regionId: null,
      transactionType: null,
      icpNodeIdL1: null,
      icpNodeIdL2: null,
      icpNodeIdL3: null,
      overrideMode: 'standard' as const,
      feeAdjustmentPercent: null,
      fxSpreadAdjustmentBps: null,
      fixedFeeUsd: 1,
      fxSpread: null,
      minimumFxSpread: null,
      reason: 'Low priority',
      priority: 1,
      isActive: true,
      effectiveFrom: null,
      effectiveTo: null,
    }
    const highPriority = { ...lowPriority, id: 21, fixedFeeUsd: 2, reason: 'High priority', priority: 9 }

    const result = computeMbpAdjustment(baseContext(), emptyData({ strategicOverrides: [lowPriority, highPriority] }))

    assert.equal(result!.matchedRuleId, 21)
    assert.equal(result!.fixedFeeUsdOverride, 2)
  })

  test('an expired override (effectiveTo in the past) is excluded even though every other field matches', ({
    assert,
  }) => {
    const expired = {
      id: 30,
      countryId: DENMARK_COUNTRY_ID,
      currencyId: null,
      regionId: null,
      transactionType: null,
      icpNodeIdL1: null,
      icpNodeIdL2: null,
      icpNodeIdL3: null,
      overrideMode: 'standard' as const,
      feeAdjustmentPercent: null,
      fxSpreadAdjustmentBps: null,
      fixedFeeUsd: 1,
      fxSpread: null,
      minimumFxSpread: null,
      reason: 'Expired',
      priority: 100,
      isActive: true,
      effectiveFrom: null,
      effectiveTo: new Date('2020-01-01'),
    }

    const result = computeMbpAdjustment(
      baseContext({ asOfDate: new Date('2026-01-01') }),
      emptyData({ ...DENMARK_DATA, strategicOverrides: [expired] })
    )

    // The expired override is skipped, so the grid rule underneath still applies.
    assert.equal(result!.source, 'grid')
    assert.equal(result!.fixedFeeUsdOverride, 5)
  })

  test('wildcard transaction-type matching: "B2X" matches B2B/B2C but not C2C, "C2X/B2C" matches both segments', ({
    assert,
  }) => {
    assert.isTrue(matchesTransactionType('B2X', 'B2B'))
    assert.isTrue(matchesTransactionType('B2X', 'B2C'))
    assert.isFalse(matchesTransactionType('B2X', 'C2C'))
    assert.isFalse(matchesTransactionType('B2X', 'B2BX')) // wrong length
    assert.isTrue(matchesTransactionType('C2X/B2C', 'C2C'))
    assert.isTrue(matchesTransactionType('C2X/B2C', 'C2B'))
    assert.isTrue(matchesTransactionType('C2X/B2C', 'B2C'))
    assert.isFalse(matchesTransactionType('C2X/B2C', 'B2B'))
  })
})
