import { test } from '@japa/runner'
import User from '#models/user'
import Region from '#models/region'
import Country from '#models/country'
import Currency from '#models/currency'
import Corridor from '#models/corridor'
import Quote from '#models/quote'
import IcpNode from '#models/icp_node'
import CountryTier from '#models/country_tier'
import RegionPressure from '#models/region_pressure'
import GridFeeAdjustment from '#models/grid_fee_adjustment'

/**
 * End-to-end coverage for Market-Based Pricing (MBP) wired into the "add
 * corridor" API — the pure matching logic itself is covered in
 * tests/unit/mbp_pricing_service.spec.ts. This file builds a Denmark-shaped
 * fixture (region pressure + country tier + grid rule) and exercises it
 * through the real HTTP endpoints, per docs/old-app-reference's worked
 * example.
 */

async function createUserWithToken() {
  const user = await User.create({
    firstName: 'Test',
    lastName: 'User',
    email: `${Math.random().toString(36).slice(2)}@example.com`,
    password: 'password123',
    role: 'sales',
  })
  const token = await User.accessTokens.create(user)
  return { user, token: token.value!.release() }
}

/** A region + country + currency + corridor, shaped like the real Denmark/Europe/B2B example, with a unique suffix so parallel tests never collide. */
async function createMbpFixture(suffix: string) {
  const region = await Region.create({ code: `MBP${suffix}`, name: `MBP Region ${suffix}` })
  const country = await Country.create({
    isoCode3: `M${suffix}`.slice(0, 3).padEnd(3, 'X'),
    name: `MBP Country ${suffix}`,
    regionId: region.id,
  })
  const partnerCountry = await Country.create({
    isoCode3: `P${suffix}`.slice(0, 3).padEnd(3, 'X'),
    name: `MBP Partner Country ${suffix}`,
    regionId: region.id,
  })
  const currency = await Currency.create({
    isoCode3: `C${suffix}`.slice(0, 3).padEnd(3, 'X'),
    name: `MBP Currency ${suffix}`,
    decimalPlaces: 2,
    isSource: true,
    isFunding: true,
    isPayout: true,
    isFee: true,
    isHard: true,
    isPegged: false,
  })
  const corridor = await Corridor.create({
    countryId: country.id,
    serviceCode: 'bank_account',
    transactionTypeCode: 'B2B',
    payerCode: 'test_payer',
    receivingPartner: 'test_partner',
    payoutCurrencyId: currency.id,
    fxSource: 'Reuters Bid rates',
    treasuryFxCostSpread: 0.001,
    costFixedUsd: 0,
    costVariablePct: 0,
    networkNeedApprovalRaw: 'No',
    internalRaw: 'None',
    centralBankRaw: 'None',
    stdFixedFeeUsd: 1.3,
    stdVariableFeePct: 0,
  })
  const icpL1 = await IcpNode.create({
    code: `MBP_L1_${suffix}`,
    name: `MBP Platform ${suffix}`,
    level: 1,
    parentId: null,
    isActive: true,
  })

  await CountryTier.create({ countryId: country.id, tier: 'G10' })
  await RegionPressure.create({ regionId: region.id, transactionType: 'B2B', pressureLevel: 'High' })
  await GridFeeAdjustment.create({
    regionPressure: 'High',
    corridorTier: 'G10',
    icpNodeIdL1: icpL1.id,
    transactionType: 'B2B',
    fixedFeeUsd: 5,
    fxSpreadAdjustmentBps: 20,
    minimumFxSpreadAdjustmentBps: 15,
  })

  return { region, country, partnerCountry, currency, corridor, icpL1 }
}

test.group('Market-Based Pricing', () => {
  test('adding a corridor with a matching MBP grid rule uses the MBP fee, not the raw catalog fee', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const { partnerCountry, corridor, icpL1 } = await createMbpFixture('1')
    const quote = await Quote.create({
      name: 'MBP Quote',
      ownerId: user.id,
      status: 'draft',
      partnerCountryId: partnerCountry.id,
      icpLevel1Id: icpL1.id,
    })

    const response = await client
      .post(`/quotes/${quote.id}/corridors`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        corridorId: corridor.id,
        // Matches the catalog fee exactly — an MBP-unaware caller's natural
        // default, so the server is free to apply its own MBP default.
        fixedFeeUsd: 1.3,
        yearlyVolumeUsd: 0,
        yearlyTransactions: 0,
        variableFeePct: 0,
        appliedFxSpread: 0,
      })

    response.assertStatus(201)
    assert.equal(response.body().fixedFeeUsd, 5)
    assert.isFalse(response.body().fixedFeeManuallySet)
  })

  test('no partner region/ICP set on the quote: falls back to the plain catalog fee, unchanged', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const { corridor } = await createMbpFixture('2')
    const quote = await Quote.create({ name: 'No MBP Context Quote', ownerId: user.id, status: 'draft' })

    const response = await client
      .post(`/quotes/${quote.id}/corridors`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        corridorId: corridor.id,
        fixedFeeUsd: 1.3,
        yearlyVolumeUsd: 0,
        yearlyTransactions: 0,
        variableFeePct: 0,
        appliedFxSpread: 0,
      })

    response.assertStatus(201)
    assert.equal(response.body().fixedFeeUsd, 1.3)
  })

  test('a manually-set fee is not silently replaced by a later, unrelated save', async ({ client, assert }) => {
    const { token, user } = await createUserWithToken()
    const { partnerCountry, corridor, icpL1 } = await createMbpFixture('3')
    const quote = await Quote.create({
      name: 'Manual Override Quote',
      ownerId: user.id,
      status: 'draft',
      partnerCountryId: partnerCountry.id,
      icpLevel1Id: icpL1.id,
    })

    const created = await client
      .post(`/quotes/${quote.id}/corridors`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        corridorId: corridor.id,
        fixedFeeUsd: 1.3,
        yearlyVolumeUsd: 0,
        yearlyTransactions: 0,
        variableFeePct: 0,
        appliedFxSpread: 0,
      })
    created.assertStatus(201)
    assert.equal(created.body().fixedFeeUsd, 5) // MBP applied on create, as above

    // The user explicitly types their own fee over the MBP default.
    const manualEdit = await client
      .patch(`/quotes/${quote.id}/corridors/${created.body().id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ fixedFeeUsd: 9.99 })
    manualEdit.assertStatus(200)
    assert.equal(manualEdit.body().fixedFeeUsd, 9.99)
    assert.isTrue(manualEdit.body().fixedFeeManuallySet)

    // A later save that doesn't touch the fee (e.g. a discount change) must
    // not silently recompute it back to the MBP/catalog value.
    const unrelatedSave = await client
      .patch(`/quotes/${quote.id}/corridors/${created.body().id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ feeDiscountPct: 5 })
    unrelatedSave.assertStatus(200)
    assert.equal(unrelatedSave.body().fixedFeeUsd, 9.99)
    assert.isTrue(unrelatedSave.body().fixedFeeManuallySet)
  })
})
