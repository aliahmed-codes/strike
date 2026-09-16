import { test } from '@japa/runner'
import User from '#models/user'
import Region from '#models/region'
import Country from '#models/country'
import Currency from '#models/currency'
import Corridor from '#models/corridor'
import Quote from '#models/quote'
import UseCase from '#models/use_case'
import IcpNode from '#models/icp_node'

async function createUserWithToken(role: 'admin' | 'sales' | 'viewer' = 'sales') {
  const user = await User.create({
    firstName: 'Test',
    lastName: 'User',
    email: `${Math.random().toString(36).slice(2)}@example.com`,
    password: 'password123',
    role,
  })
  const token = await User.accessTokens.create(user)
  return { user, token: token.value!.release() }
}

async function createCorridor() {
  const region = await Region.create({ code: 'TST', name: 'Test Region' })
  const country = await Country.create({ isoCode3: 'ZZL', name: 'Testland', regionId: region.id })
  const currency = await Currency.create({
    isoCode3: 'ZZZ',
    name: 'Test Currency',
    decimalPlaces: 2,
    isSource: true,
    isFunding: true,
    isPayout: true,
    isFee: true,
    isHard: true,
    isPegged: false,
  })
  return Corridor.create({
    countryId: country.id,
    serviceCode: 'bank_account',
    transactionTypeCode: 'b2b',
    payerCode: 'test_payer',
    receivingPartner: 'test_partner',
    payoutCurrencyId: currency.id,
    // Clean master data (no network restrictions) so tests exercise pricing
    // math, not the "no catalog data — verify manually" network-approval path.
    fxSource: 'Cost Plus',
    treasuryFxCostSpread: 0,
    costFixedUsd: 0,
    costVariablePct: 0,
    networkNeedApprovalRaw: 'No',
    internalRaw: 'None',
    centralBankRaw: 'None',
  })
}

test.group('Quotes: create/list/show', () => {
  test('rejects unauthenticated requests', async ({ client }) => {
    const response = await client.post('/quotes').json({ name: 'Test Quote' })
    response.assertStatus(401)
  })

  test('creates a quote owned by the current user, defaulting to draft', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()

    const response = await client
      .post('/quotes')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Habib Bank' })

    response.assertStatus(201)
    response.assertBodyContains({ name: 'Habib Bank', status: 'draft', ownerId: user.id })
    assert.exists(response.body().id)
  })

  test('rejects a quote with no name', async ({ client }) => {
    const { token } = await createUserWithToken()

    const response = await client
      .post('/quotes')
      .header('Authorization', `Bearer ${token}`)
      .json({})

    response.assertStatus(422)
  })

  test("lists only the current user's quotes unless they are an admin", async ({
    client,
    assert,
  }) => {
    const { token: ownerToken, user: owner } = await createUserWithToken()
    const { token: otherToken } = await createUserWithToken()

    await Quote.create({ name: 'Owned Quote', ownerId: owner.id, status: 'draft' })

    const ownerResponse = await client
      .get('/quotes')
      .header('Authorization', `Bearer ${ownerToken}`)
    ownerResponse.assertStatus(200)
    assert.lengthOf(ownerResponse.body(), 1)

    const otherResponse = await client
      .get('/quotes')
      .header('Authorization', `Bearer ${otherToken}`)
    otherResponse.assertStatus(200)
    assert.lengthOf(otherResponse.body(), 0)
  })

  test('an admin can list every quote', async ({ client, assert }) => {
    const { user: owner } = await createUserWithToken()
    const { token: adminToken } = await createUserWithToken('admin')

    await Quote.create({ name: "Someone Else's Quote", ownerId: owner.id, status: 'draft' })

    const response = await client.get('/quotes').header('Authorization', `Bearer ${adminToken}`)
    response.assertStatus(200)
    assert.lengthOf(response.body(), 1)
  })

  test('returns 404 for a quote that does not exist', async ({ client }) => {
    const { token } = await createUserWithToken()
    const response = await client.get('/quotes/999999').header('Authorization', `Bearer ${token}`)
    response.assertStatus(404)
  })

  test("returns 403 when viewing another user's quote", async ({ client }) => {
    const { user: owner } = await createUserWithToken()
    const { token: otherToken } = await createUserWithToken()
    const quote = await Quote.create({ name: 'Private Quote', ownerId: owner.id, status: 'draft' })

    const response = await client
      .get(`/quotes/${quote.id}`)
      .header('Authorization', `Bearer ${otherToken}`)
    response.assertStatus(403)
  })

  test('show returns the quote with computed totals', async ({ client, assert }) => {
    const { token } = await createUserWithToken()
    const created = await client
      .post('/quotes')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Faysal Bank' })

    const response = await client
      .get(`/quotes/${created.body().id}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.equal(response.body().quote.name, 'Faysal Bank')
    assert.equal(response.body().totals.corridorCount, 0)
  })
})

test.group('Quotes: multi-value fields (use cases, currencies, ICP)', () => {
  async function createTwoCurrencies() {
    const usd = await Currency.create({
      isoCode3: 'US1',
      name: 'Test USD',
      decimalPlaces: 2,
      isSource: true,
      isFunding: true,
      isPayout: true,
      isFee: true,
      isHard: true,
      isPegged: false,
    })
    const eur = await Currency.create({
      isoCode3: 'EU1',
      name: 'Test EUR',
      decimalPlaces: 2,
      isSource: true,
      isFunding: true,
      isPayout: true,
      isFee: true,
      isHard: true,
      isPegged: false,
    })
    return [usd, eur]
  }

  test('creating a quote syncs multiple funding/source currencies and use cases', async ({
    client,
    assert,
  }) => {
    const { token } = await createUserWithToken()
    const [usd, eur] = await createTwoCurrencies()
    const useCase1 = await UseCase.create({ code: 'uc1', label: 'Use Case 1', isActive: true })
    const useCase2 = await UseCase.create({ code: 'uc2', label: 'Use Case 2', isActive: true })

    const response = await client
      .post('/quotes')
      .header('Authorization', `Bearer ${token}`)
      .json({
        name: 'Multi Currency Quote',
        fundingCurrencyIds: [usd.id, eur.id],
        sourceCurrencyIds: [usd.id],
        useCaseIds: [useCase1.id, useCase2.id],
      })

    response.assertStatus(201)
    assert.lengthOf(response.body().fundingCurrencies, 2)
    assert.lengthOf(response.body().sourceCurrencies, 1)
    assert.lengthOf(response.body().useCases, 2)
  })

  test('updating a quote replaces its currency/use-case selections', async ({ client, assert }) => {
    const { token, user } = await createUserWithToken()
    const [usd, eur] = await createTwoCurrencies()
    const quote = await Quote.create({ name: 'Quote', ownerId: user.id, status: 'draft' })
    await quote.related('fundingCurrencies').sync([usd.id, eur.id])

    const response = await client
      .patch(`/quotes/${quote.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ fundingCurrencyIds: [eur.id] })

    response.assertStatus(200)
    assert.lengthOf(response.body().fundingCurrencies, 1)
    assert.equal(response.body().fundingCurrencies[0].id, eur.id)
  })

  test('stores the 3 independent ICP levels', async ({ client, assert }) => {
    const { token } = await createUserWithToken()
    const level1 = await IcpNode.create({
      code: 'L1-TEST',
      name: 'Level 1',
      level: 1,
      isActive: true,
    })
    const level2 = await IcpNode.create({
      code: 'L2-TEST',
      name: 'Level 2',
      level: 2,
      parentId: level1.id,
      isActive: true,
    })

    const created = await client
      .post('/quotes')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'ICP Quote', icpLevel1Id: level1.id, icpLevel2Id: level2.id })
    created.assertStatus(201)

    const response = await client
      .get(`/quotes/${created.body().id}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.equal(response.body().quote.icpLevel1.id, level1.id)
    assert.equal(response.body().quote.icpLevel2.id, level2.id)
    assert.isNull(response.body().quote.icpLevel3Id)
  })
})

test.group('Quotes: update/delete', () => {
  test('updates a draft quote', async ({ client }) => {
    const { token, user } = await createUserWithToken()
    const quote = await Quote.create({ name: 'Old Name', ownerId: user.id, status: 'draft' })

    const response = await client
      .patch(`/quotes/${quote.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'New Name' })

    response.assertStatus(200)
    response.assertBodyContains({ name: 'New Name' })
  })

  test('refuses to update a non-draft quote', async ({ client }) => {
    const { token, user } = await createUserWithToken()
    const quote = await Quote.create({ name: 'Submitted', ownerId: user.id, status: 'submitted' })

    const response = await client
      .patch(`/quotes/${quote.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'New Name' })

    response.assertStatus(409)
  })

  test('deletes a draft quote', async ({ client }) => {
    const { token, user } = await createUserWithToken()
    const quote = await Quote.create({ name: 'To Delete', ownerId: user.id, status: 'draft' })

    const response = await client
      .delete(`/quotes/${quote.id}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(204)
  })

  test('refuses to delete a non-draft quote', async ({ client }) => {
    const { token, user } = await createUserWithToken()
    const quote = await Quote.create({ name: 'Approved', ownerId: user.id, status: 'approved' })

    const response = await client
      .delete(`/quotes/${quote.id}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(409)
  })
})

test.group('Quote corridors', () => {
  test('adds a corridor to a quote and computes pricing on the backend', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const quote = await Quote.create({ name: 'Quote', ownerId: user.id, status: 'draft' })
    const corridor = await createCorridor()

    const response = await client
      .post(`/quotes/${quote.id}/corridors`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        corridorId: corridor.id,
        yearlyVolumeUsd: 1_000_000,
        yearlyTransactions: 10_000,
        fixedFeeUsd: 0.5,
        variableFeePct: 1,
        appliedFxSpread: 0.5,
      })

    response.assertStatus(201)
    assert.equal(response.body().totalRevenue, 20_000)
    assert.equal(response.body().needsApproval, false)
  })

  test('rejects adding the same corridor to a quote twice', async ({ client }) => {
    const { token, user } = await createUserWithToken()
    const quote = await Quote.create({ name: 'Quote', ownerId: user.id, status: 'draft' })
    const corridor = await createCorridor()

    const payload = {
      corridorId: corridor.id,
      yearlyVolumeUsd: 1_000_000,
      yearlyTransactions: 10_000,
      fixedFeeUsd: 0.5,
      variableFeePct: 1,
      appliedFxSpread: 0.5,
    }

    await client
      .post(`/quotes/${quote.id}/corridors`)
      .header('Authorization', `Bearer ${token}`)
      .json(payload)
    const response = await client
      .post(`/quotes/${quote.id}/corridors`)
      .header('Authorization', `Bearer ${token}`)
      .json(payload)

    response.assertStatus(409)
  })

  test('allows the same corridor twice for two different funding currencies', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const quote = await Quote.create({ name: 'Quote', ownerId: user.id, status: 'draft' })
    const corridor = await createCorridor()
    const eur = await Currency.create({
      isoCode3: 'EUR',
      name: 'Euro',
      decimalPlaces: 2,
      isSource: true,
      isFunding: true,
      isPayout: true,
      isFee: true,
      isHard: true,
      isPegged: false,
    })
    const gbp = await Currency.create({
      isoCode3: 'GBP',
      name: 'Pound Sterling',
      decimalPlaces: 2,
      isSource: true,
      isFunding: true,
      isPayout: true,
      isFee: true,
      isHard: true,
      isPegged: false,
    })

    const base = {
      corridorId: corridor.id,
      yearlyVolumeUsd: 1_000_000,
      yearlyTransactions: 10_000,
      fixedFeeUsd: 0.5,
      variableFeePct: 1,
      appliedFxSpread: 0.5,
    }

    const eurRow = await client
      .post(`/quotes/${quote.id}/corridors`)
      .header('Authorization', `Bearer ${token}`)
      .json({ ...base, fundingCurrencyId: eur.id })
    const gbpRow = await client
      .post(`/quotes/${quote.id}/corridors`)
      .header('Authorization', `Bearer ${token}`)
      .json({ ...base, fundingCurrencyId: gbp.id })

    eurRow.assertStatus(201)
    gbpRow.assertStatus(201)
    assert.notEqual(eurRow.body().id, gbpRow.body().id)
    assert.equal(eurRow.body().fundingCurrencyId, eur.id)
    assert.equal(gbpRow.body().fundingCurrencyId, gbp.id)
  })

  test('rejects the same corridor added twice for the same funding currency', async ({
    client,
  }) => {
    const { token, user } = await createUserWithToken()
    const quote = await Quote.create({ name: 'Quote', ownerId: user.id, status: 'draft' })
    const corridor = await createCorridor()
    const eur = await Currency.create({
      isoCode3: 'EUR',
      name: 'Euro',
      decimalPlaces: 2,
      isSource: true,
      isFunding: true,
      isPayout: true,
      isFee: true,
      isHard: true,
      isPegged: false,
    })

    const payload = {
      corridorId: corridor.id,
      fundingCurrencyId: eur.id,
      yearlyVolumeUsd: 1_000_000,
      yearlyTransactions: 10_000,
      fixedFeeUsd: 0.5,
      variableFeePct: 1,
      appliedFxSpread: 0.5,
    }

    await client
      .post(`/quotes/${quote.id}/corridors`)
      .header('Authorization', `Bearer ${token}`)
      .json(payload)
    const response = await client
      .post(`/quotes/${quote.id}/corridors`)
      .header('Authorization', `Bearer ${token}`)
      .json(payload)

    response.assertStatus(409)
  })

  test("cannot change a corridor row's funding currency once it is saved", async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const quote = await Quote.create({ name: 'Quote', ownerId: user.id, status: 'draft' })
    const corridor = await createCorridor()
    const eur = await Currency.create({
      isoCode3: 'EUR',
      name: 'Euro',
      decimalPlaces: 2,
      isSource: true,
      isFunding: true,
      isPayout: true,
      isFee: true,
      isHard: true,
      isPegged: false,
    })
    const gbp = await Currency.create({
      isoCode3: 'GBP',
      name: 'Pound Sterling',
      decimalPlaces: 2,
      isSource: true,
      isFunding: true,
      isPayout: true,
      isFee: true,
      isHard: true,
      isPegged: false,
    })

    const created = await client
      .post(`/quotes/${quote.id}/corridors`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        corridorId: corridor.id,
        fundingCurrencyId: eur.id,
        yearlyVolumeUsd: 1_000_000,
        yearlyTransactions: 10_000,
        fixedFeeUsd: 0.5,
        variableFeePct: 1,
        appliedFxSpread: 0.5,
      })

    // Sending fundingCurrencyId on PATCH is silently ignored (not a
    // validation error) — it's simply not a field this endpoint accepts.
    const response = await client
      .patch(`/quotes/${quote.id}/corridors/${created.body().id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ fundingCurrencyId: gbp.id, yearlyVolumeUsd: 2_000_000 })

    response.assertStatus(200)
    assert.equal(response.body().fundingCurrencyId, eur.id)
    assert.equal(response.body().yearlyVolumeUsd, 2_000_000)
  })

  test('rejects a corridor id that does not exist in the catalog', async ({ client }) => {
    const { token, user } = await createUserWithToken()
    const quote = await Quote.create({ name: 'Quote', ownerId: user.id, status: 'draft' })

    const response = await client
      .post(`/quotes/${quote.id}/corridors`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        corridorId: 999999,
        yearlyVolumeUsd: 1_000_000,
        yearlyTransactions: 10_000,
        fixedFeeUsd: 0.5,
        variableFeePct: 1,
        appliedFxSpread: 0.5,
      })

    response.assertStatus(422)
  })

  test('flags a corridor as needing approval when the discount is too high', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const quote = await Quote.create({ name: 'Quote', ownerId: user.id, status: 'draft' })
    const corridor = await createCorridor()

    const response = await client
      .post(`/quotes/${quote.id}/corridors`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        corridorId: corridor.id,
        yearlyVolumeUsd: 1_000_000,
        yearlyTransactions: 10_000,
        fixedFeeUsd: 0.5,
        variableFeePct: 1,
        appliedFxSpread: 0.5,
        feeDiscountPct: 50,
      })

    response.assertStatus(201)
    assert.isTrue(response.body().needsApproval)
  })

  test('updates a corridor and recomputes its pricing', async ({ client, assert }) => {
    const { token, user } = await createUserWithToken()
    const quote = await Quote.create({ name: 'Quote', ownerId: user.id, status: 'draft' })
    const corridor = await createCorridor()

    const created = await client
      .post(`/quotes/${quote.id}/corridors`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        corridorId: corridor.id,
        yearlyVolumeUsd: 1_000_000,
        yearlyTransactions: 10_000,
        fixedFeeUsd: 0.5,
        variableFeePct: 1,
        appliedFxSpread: 0.5,
      })

    const response = await client
      .patch(`/quotes/${quote.id}/corridors/${created.body().id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ yearlyVolumeUsd: 2_000_000 })

    response.assertStatus(200)
    assert.equal(response.body().yearlyVolumeUsd, 2_000_000)
    // fxMargin doubles: 2_000_000 * 0.5% = 10_000
    assert.equal(response.body().fxMargin, 10_000)
  })

  test('removes a corridor from a quote', async ({ client }) => {
    const { token, user } = await createUserWithToken()
    const quote = await Quote.create({ name: 'Quote', ownerId: user.id, status: 'draft' })
    const corridor = await createCorridor()

    const created = await client
      .post(`/quotes/${quote.id}/corridors`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        corridorId: corridor.id,
        yearlyVolumeUsd: 1_000_000,
        yearlyTransactions: 10_000,
        fixedFeeUsd: 0.5,
        variableFeePct: 1,
        appliedFxSpread: 0.5,
      })

    const response = await client
      .delete(`/quotes/${quote.id}/corridors/${created.body().id}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(204)
  })

  test('cannot add corridors to a non-draft quote', async ({ client }) => {
    const { token, user } = await createUserWithToken()
    const quote = await Quote.create({ name: 'Quote', ownerId: user.id, status: 'submitted' })
    const corridor = await createCorridor()

    const response = await client
      .post(`/quotes/${quote.id}/corridors`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        corridorId: corridor.id,
        yearlyVolumeUsd: 1_000_000,
        yearlyTransactions: 10_000,
        fixedFeeUsd: 0.5,
        variableFeePct: 1,
        appliedFxSpread: 0.5,
      })

    response.assertStatus(409)
  })
})

test.group('Quote corridors: tiered pricing', () => {
  test('adds a tiered corridor and prices each tier plus the standard remainder', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const quote = await Quote.create({ name: 'Quote', ownerId: user.id, status: 'draft' })
    const corridor = await createCorridor()

    const response = await client
      .post(`/quotes/${quote.id}/corridors`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        corridorId: corridor.id,
        atvUsd: 500,
        yearlyVolumeUsd: 1_000_000,
        yearlyTransactions: 2_000,
        fixedFeeUsd: 1,
        variableFeePct: 1,
        appliedFxSpread: 1,
        pricingModel: 'tiered',
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

    response.assertStatus(201)
    assert.equal(response.body().pricingModel, 'tiered')
    assert.equal(response.body().tiers.length, 1)
    assert.equal(response.body().tiers[0].tierNumber, 1)
    assert.equal(response.body().tiers[0].yearlyVolumeUsd, 400_000)
    assert.isTrue(response.body().totalRevenue > 0)
  })

  test('rejects tiers that sum to more than the corridor total volume', async ({ client }) => {
    const { token, user } = await createUserWithToken()
    const quote = await Quote.create({ name: 'Quote', ownerId: user.id, status: 'draft' })
    const corridor = await createCorridor()

    const response = await client
      .post(`/quotes/${quote.id}/corridors`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        corridorId: corridor.id,
        atvUsd: 500,
        yearlyVolumeUsd: 1_000_000,
        yearlyTransactions: 2_000,
        fixedFeeUsd: 1,
        variableFeePct: 1,
        appliedFxSpread: 1,
        pricingModel: 'tiered',
        tiers: [
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
        ],
      })

    response.assertStatus(422)
  })

  test('re-prices existing tiers when the corridor total volume changes without resending tiers', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const quote = await Quote.create({ name: 'Quote', ownerId: user.id, status: 'draft' })
    const corridor = await createCorridor()

    const created = await client
      .post(`/quotes/${quote.id}/corridors`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        corridorId: corridor.id,
        atvUsd: 500,
        yearlyVolumeUsd: 1_000_000,
        yearlyTransactions: 2_000,
        fixedFeeUsd: 1,
        variableFeePct: 1,
        appliedFxSpread: 1,
        pricingModel: 'tiered',
        tiers: [
          {
            tierNumber: 1,
            yearlyVolumeUsd: 200_000,
            fixedFeeUsd: 0.5,
            variableFeePct: 0.5,
            appliedFxSpread: 0.5,
          },
        ],
      })

    const response = await client
      .patch(`/quotes/${quote.id}/corridors/${created.body().id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ yearlyVolumeUsd: 2_000_000 })

    response.assertStatus(200)
    assert.equal(response.body().tiers.length, 1)
    assert.equal(response.body().tiers[0].yearlyVolumeUsd, 200_000)
  })

  test('switching a corridor back to standard clears its tier rows', async ({ client, assert }) => {
    const { token, user } = await createUserWithToken()
    const quote = await Quote.create({ name: 'Quote', ownerId: user.id, status: 'draft' })
    const corridor = await createCorridor()

    const created = await client
      .post(`/quotes/${quote.id}/corridors`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        corridorId: corridor.id,
        atvUsd: 500,
        yearlyVolumeUsd: 1_000_000,
        yearlyTransactions: 2_000,
        fixedFeeUsd: 1,
        variableFeePct: 1,
        appliedFxSpread: 1,
        pricingModel: 'tiered',
        tiers: [
          {
            tierNumber: 1,
            yearlyVolumeUsd: 200_000,
            fixedFeeUsd: 0.5,
            variableFeePct: 0.5,
            appliedFxSpread: 0.5,
          },
        ],
      })

    const response = await client
      .patch(`/quotes/${quote.id}/corridors/${created.body().id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ pricingModel: 'standard' })

    response.assertStatus(200)
    assert.equal(response.body().pricingModel, 'standard')
    assert.equal(response.body().tiers.length, 0)
  })
})
