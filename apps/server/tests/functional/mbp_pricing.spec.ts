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
        // Matches what MBP currently says exactly — an MBP-aware caller's
        // natural default (see `seedQuoteCorridorFromCatalog`), so the
        // server recognizes this as "not manually overridden."
        fixedFeeUsd: 5,
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
        fixedFeeUsd: 5, // matches the live MBP answer — not manual yet
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

    // "Use MBP fee": re-syncing the row to exactly the current MBP answer
    // is recognized as following MBP again, not a fresh manual override —
    // this is what lets a "Use MBP fee" button work correctly.
    const resynced = await client
      .patch(`/quotes/${quote.id}/corridors/${created.body().id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ fixedFeeUsd: 5 })
    resynced.assertStatus(200)
    assert.equal(resynced.body().fixedFeeUsd, 5)
    assert.isFalse(resynced.body().fixedFeeManuallySet)
  })

  test('GET /quotes/:id includes a live MBP result per saved corridor, recomputed fresh on every fetch', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const { partnerCountry, corridor, icpL1 } = await createMbpFixture('4')
    const quote = await Quote.create({
      name: 'Live MBP Quote',
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
        fixedFeeUsd: 5,
        yearlyVolumeUsd: 0,
        yearlyTransactions: 0,
        variableFeePct: 0,
        appliedFxSpread: 0,
      })
    created.assertStatus(201)

    const shown = await client.get(`/quotes/${quote.id}`).header('Authorization', `Bearer ${token}`)
    shown.assertStatus(200)
    const shownCorridor = shown.body().quote.corridors.find((c: { id: number }) => c.id === created.body().id)
    assert.isDefined(shownCorridor)
    assert.isNotNull(shownCorridor.mbp)
    assert.equal(shownCorridor.mbp.source, 'grid')
    assert.equal(shownCorridor.mbp.fixedFeeUsdOverride, 5)
  })

  test('matching-corridors preview includes MBP when a quoteId is given, and enforces quote access', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const { token: otherToken } = await createUserWithToken()
    const { region, partnerCountry, corridor, icpL1 } = await createMbpFixture('5')
    const quote = await Quote.create({
      name: 'Preview MBP Quote',
      ownerId: user.id,
      status: 'draft',
      partnerCountryId: partnerCountry.id,
      icpLevel1Id: icpL1.id,
    })

    const withQuote = await client
      .get(`/reference/corridors/matching?regionIds=${region.id}&quoteId=${quote.id}`)
      .header('Authorization', `Bearer ${token}`)
    withQuote.assertStatus(200)
    const previewCorridor = withQuote.body().corridors.find((c: { id: number }) => c.id === corridor.id)
    assert.isDefined(previewCorridor)
    assert.isNotNull(previewCorridor.mbp)
    assert.equal(previewCorridor.mbp.source, 'grid')
    assert.equal(previewCorridor.mbp.fixedFeeUsdOverride, 5)

    // Without a quoteId, the preview is plain catalog data — no MBP.
    const withoutQuote = await client
      .get(`/reference/corridors/matching?regionIds=${region.id}`)
      .header('Authorization', `Bearer ${token}`)
    withoutQuote.assertStatus(200)
    assert.isNull(withoutQuote.body().corridors.find((c: { id: number }) => c.id === corridor.id).mbp)

    // A user who doesn't own the quote (and isn't admin) can't preview MBP against it.
    const forbidden = await client
      .get(`/reference/corridors/matching?regionIds=${region.id}&quoteId=${quote.id}`)
      .header('Authorization', `Bearer ${otherToken}`)
    forbidden.assertStatus(403)
  })
})
