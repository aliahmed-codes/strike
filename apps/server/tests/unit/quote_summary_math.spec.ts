import { test } from '@japa/runner'
import {
  buildCorridorRegionSummary,
  countUniqueCurrencyPairs,
  type QuoteSummaryCorridor,
} from '@strike/shared'

function corridor(overrides: Partial<QuoteSummaryCorridor> = {}): QuoteSummaryCorridor {
  return {
    regionId: 1,
    regionName: 'Africa',
    countryId: 1,
    fundingCurrencyId: 1,
    payoutCurrencyId: 2,
    fixedFeeUsd: 1,
    appliedFxSpread: 0.5,
    yearlyVolumeUsd: 1_000_000,
    totalRevenue: 20_000,
    ...overrides,
  }
}

test.group('buildCorridorRegionSummary', () => {
  test('empty input returns empty rows and zeroed totals', ({ assert }) => {
    const { rows, totals } = buildCorridorRegionSummary([])
    assert.deepEqual(rows, [])
    assert.equal(totals.corridorCount, 0)
    assert.equal(totals.averageFeeUsd, 0)
    assert.equal(totals.averageFxSpreadPct, 0)
  })

  test('groups corridors by region and computes unweighted averages', ({ assert }) => {
    const { rows } = buildCorridorRegionSummary([
      corridor({ regionId: 1, regionName: 'Africa', countryId: 1, fixedFeeUsd: 1 }),
      corridor({ regionId: 1, regionName: 'Africa', countryId: 2, fixedFeeUsd: 3 }),
      corridor({ regionId: 2, regionName: 'Asia', countryId: 3, fixedFeeUsd: 10 }),
    ])

    const africa = rows.find((r) => r.regionId === 1)!
    assert.equal(africa.corridorCount, 2)
    assert.equal(africa.countryCount, 2)
    assert.equal(africa.averageFeeUsd, 2)

    const asia = rows.find((r) => r.regionId === 2)!
    assert.equal(asia.corridorCount, 1)
    assert.equal(asia.averageFeeUsd, 10)
  })

  test('a legitimate zero fee/spread is averaged as zero, not excluded', ({ assert }) => {
    const { totals } = buildCorridorRegionSummary([
      corridor({ fixedFeeUsd: 0, appliedFxSpread: 0 }),
      corridor({ fixedFeeUsd: 4, appliedFxSpread: 1 }),
    ])
    assert.equal(totals.averageFeeUsd, 2)
    assert.equal(totals.averageFxSpreadPct, 0.5)
    assert.equal(totals.corridorCount, 2)
  })

  test('totals are computed from the flattened list, not by re-averaging region rows', ({
    assert,
  }) => {
    const { totals } = buildCorridorRegionSummary([
      corridor({ regionId: 1, fixedFeeUsd: 1 }),
      corridor({ regionId: 1, fixedFeeUsd: 1 }),
      corridor({ regionId: 2, fixedFeeUsd: 10 }),
    ])
    // (1 + 1 + 10) / 3, not average of per-region averages ((1 + 10) / 2).
    assert.equal(totals.averageFeeUsd, 4)
  })

  test('a null region is kept as its own group, not dropped', ({ assert }) => {
    const { rows } = buildCorridorRegionSummary([corridor({ regionId: null, regionName: null })])
    assert.equal(rows.length, 1)
    assert.isNull(rows[0].regionId)
  })

  test('expected volume and projected revenue sum correctly', ({ assert }) => {
    const { totals } = buildCorridorRegionSummary([
      corridor({ yearlyVolumeUsd: 1_000_000, totalRevenue: 20_000 }),
      corridor({ yearlyVolumeUsd: 2_000_000, totalRevenue: 30_000 }),
    ])
    assert.equal(totals.expectedVolumeUsd, 3_000_000)
    assert.equal(totals.projectedRevenueUsd, 50_000)
  })
})

test.group('countUniqueCurrencyPairs', () => {
  test('counts distinct funding/payout pairs', ({ assert }) => {
    const count = countUniqueCurrencyPairs([
      { fundingCurrencyId: 1, payoutCurrencyId: 2 },
      { fundingCurrencyId: 1, payoutCurrencyId: 3 },
      { fundingCurrencyId: 2, payoutCurrencyId: 2 },
    ])
    assert.equal(count, 3)
  })

  test('deduplicates an identical pair', ({ assert }) => {
    const count = countUniqueCurrencyPairs([
      { fundingCurrencyId: 1, payoutCurrencyId: 2 },
      { fundingCurrencyId: 1, payoutCurrencyId: 2 },
    ])
    assert.equal(count, 1)
  })

  test('empty input returns zero', ({ assert }) => {
    assert.equal(countUniqueCurrencyPairs([]), 0)
  })
})
