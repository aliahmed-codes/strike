import { test } from '@japa/runner'
import {
  feeCurrencyToUsd,
  labelFor,
  usdToFeeCurrencyAmount,
  FEE_TYPE_OPTIONS,
  PAYMENT_SCHEDULE_OPTIONS,
} from '@strike/shared'

const usd = { isoCode3: 'USD', feeConversionRateToUsd: null }
const eur = { isoCode3: 'EUR', feeConversionRateToUsd: 0.9 }
const noRate = { isoCode3: 'XYZ', feeConversionRateToUsd: null }

test.group('fee currency math', () => {
  test('USD needs no rate', ({ assert }) => {
    assert.equal(usdToFeeCurrencyAmount(10, usd), 10)
    assert.equal(feeCurrencyToUsd(10, usd), 10)
  })

  test('converts with the static rate in both directions', ({ assert }) => {
    assert.equal(usdToFeeCurrencyAmount(10, eur), 9)
    assert.closeTo(feeCurrencyToUsd(9, eur) ?? 0, 10, 1e-9)
  })

  test('a currency with no rate returns null, never a 1:1 guess', ({ assert }) => {
    assert.isNull(usdToFeeCurrencyAmount(10, noRate))
    assert.isNull(feeCurrencyToUsd(10, noRate))
  })

  test('a missing currency returns null', ({ assert }) => {
    assert.isNull(usdToFeeCurrencyAmount(10, undefined))
    assert.isNull(feeCurrencyToUsd(10, undefined))
  })
})

test.group('setup fee labels', () => {
  test('labelFor returns the shared wording', ({ assert }) => {
    assert.equal(labelFor(FEE_TYPE_OPTIONS, 'network'), 'Network Joining Fee')
    assert.equal(labelFor(PAYMENT_SCHEDULE_OPTIONS, 'full'), 'On Contract Signature - 100%')
  })
})
