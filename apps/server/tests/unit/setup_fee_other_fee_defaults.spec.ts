import { test } from '@japa/runner'
import {
  hasCommitmentFeeRamp,
  otherFeeDefault,
  otherFeeDiffersFromDefault,
} from '#services/setup_fee_pricing_service'

// These lock in the exact default amounts the frontend must seed its Other
// Fees form with — a mismatch here previously made the frontend always
// disagree with the backend about what "default" means for a New Partner
// quote, flagging real approvals on completely untouched fields.
test.group('otherFeeDefault', () => {
  test('New Partner has 7 non-zero defaults, 5 zero defaults', ({ assert }) => {
    assert.equal(otherFeeDefault('reversal_request', 'New partner'), 10)
    assert.equal(otherFeeDefault('proof_of_payment', 'New partner'), 10)
    assert.equal(otherFeeDefault('emergency_funding', 'New partner'), 0.3)
    assert.equal(otherFeeDefault('treasury_management', 'New partner'), 0.1)
    assert.equal(otherFeeDefault('business_hub_platform', 'New partner'), 500)
    assert.equal(otherFeeDefault('corridor_no_usage', 'New partner'), 200)
    assert.equal(otherFeeDefault('bulk_currency_conversion', 'New partner'), 200)

    assert.equal(otherFeeDefault('post_funding_penalty', 'New partner'), 0)
    assert.equal(otherFeeDefault('white_glove', 'New partner'), 0)
    assert.equal(otherFeeDefault('stablecoin_prefunding', 'New partner'), 0)
    assert.equal(otherFeeDefault('digital_asset_icp_setup', 'New partner'), 0)
    assert.equal(otherFeeDefault('currencies_for_treasury', 'New partner'), 0)
  })

  test('every other opportunity type defaults every concept to 0', ({ assert }) => {
    assert.equal(otherFeeDefault('reversal_request', 'Upsell'), 0)
    assert.equal(otherFeeDefault('business_hub_platform', 'Renewal'), 0)
    assert.equal(otherFeeDefault('corridor_no_usage', null), 0)
  })

  test('is case/whitespace insensitive on the opportunity type, matching the approval check', ({
    assert,
  }) => {
    assert.equal(otherFeeDefault('reversal_request', '  NEW PARTNER  '), 10)
  })
})

test.group('otherFeeDiffersFromDefault', () => {
  test('a fresh New Partner quote with every fee at its real default never differs', ({
    assert,
  }) => {
    const concepts = [
      'reversal_request',
      'proof_of_payment',
      'emergency_funding',
      'treasury_management',
      'business_hub_platform',
      'corridor_no_usage',
      'bulk_currency_conversion',
      'post_funding_penalty',
      'white_glove',
      'stablecoin_prefunding',
      'digital_asset_icp_setup',
      'currencies_for_treasury',
    ]
    for (const conceptCode of concepts) {
      const amount = otherFeeDefault(conceptCode, 'New partner')
      assert.isFalse(
        otherFeeDiffersFromDefault(conceptCode, amount, 'New partner'),
        `${conceptCode} should not differ when set to its own default (${amount})`
      )
    }
  })

  test('submitting 0 for a New Partner quote that never touched Other Fees is the real bug this fixes', ({
    assert,
  }) => {
    // This is exactly what the frontend used to send before it learned about
    // real per-concept defaults — it should now seed 10, not 0, for this one.
    assert.isTrue(otherFeeDiffersFromDefault('reversal_request', 0, 'New partner'))
  })

  test('tolerates floating-point rounding, matching the 0.01 tolerance used elsewhere', ({
    assert,
  }) => {
    assert.isFalse(otherFeeDiffersFromDefault('emergency_funding', 0.300001, 'New partner'))
  })
})

// Locks in the exact rule behind "Commitment fee ramps up/down across the
// contract" so the frontend's live indicator can never disagree with what
// the backend actually flags on save.
test.group('hasCommitmentFeeRamp', () => {
  test('no ramp when there are 0 or 1 period overrides', ({ assert }) => {
    assert.isFalse(hasCommitmentFeeRamp([]))
    assert.isFalse(hasCommitmentFeeRamp([{ blockKey: 'y1_h1', commitmentFee: 3000 }]))
  })

  test('no ramp when every override is the same amount', ({ assert }) => {
    assert.isFalse(
      hasCommitmentFeeRamp([
        { blockKey: 'y1_h1', commitmentFee: 5000 },
        { blockKey: 'y1_h2', commitmentFee: 5000 },
      ])
    )
  })

  test('a ramp when overrides differ', ({ assert }) => {
    assert.isTrue(
      hasCommitmentFeeRamp([
        { blockKey: 'y1_h1', commitmentFee: 3000 },
        { blockKey: 'y1_h2', commitmentFee: 7000 },
      ])
    )
  })

  test('tolerates floating-point rounding, matching the 0.01 tolerance used elsewhere', ({
    assert,
  }) => {
    assert.isFalse(
      hasCommitmentFeeRamp([
        { blockKey: 'y1_h1', commitmentFee: 5000 },
        { blockKey: 'y1_h2', commitmentFee: 5000.001 },
      ])
    )
  })
})
