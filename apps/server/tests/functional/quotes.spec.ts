import { test } from '@japa/runner'
import User from '#models/user'
import Region from '#models/region'
import Country from '#models/country'
import Currency from '#models/currency'
import Corridor from '#models/corridor'
import Quote from '#models/quote'

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
  const country = await Country.create({ isoCode2: 'ZZ', name: 'Testland', regionId: region.id })
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
    payoutCurrencyId: currency.id,
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
