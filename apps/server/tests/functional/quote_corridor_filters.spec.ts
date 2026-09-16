import { test } from '@japa/runner'
import User from '#models/user'
import Region from '#models/region'
import Country from '#models/country'
import Currency from '#models/currency'
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

async function createRegionCountryCurrency(suffix: string) {
  const region = await Region.create({ code: `CF${suffix}`, name: `Filter Region ${suffix}` })
  const country = await Country.create({
    isoCode3: `CF${suffix}`,
    name: `Filter Country ${suffix}`,
    regionId: region.id,
  })
  const currency = await Currency.create({
    isoCode3: `CF${suffix}`,
    name: `Filter Currency ${suffix}`,
    decimalPlaces: 2,
    isSource: true,
    isFunding: true,
    isPayout: true,
    isFee: true,
    isHard: true,
    isPegged: false,
  })
  return { region, country, currency }
}

test.group('Quotes: corridor filter persistence', () => {
  test('creating a quote with all 7 filter fields round-trips verbatim', async ({
    client,
    assert,
  }) => {
    const { token } = await createUserWithToken()
    const { region, country, currency } = await createRegionCountryCurrency('1')

    const response = await client
      .post('/quotes')
      .header('Authorization', `Bearer ${token}`)
      .json({
        name: 'Filtered Quote',
        corridorFilterRegionIds: [region.id],
        corridorFilterCountryIds: [country.id],
        corridorFilterServiceCodes: ['bank_account'],
        corridorFilterTransactionTypeCodes: ['b2b'],
        corridorFilterPayoutCurrencyIds: [currency.id],
        corridorFilterPayerCodes: ['some_payer'],
        corridorFilterHideUsdSwift: true,
      })

    response.assertStatus(201)
    const body = response.body()
    assert.deepEqual(body.corridorFilterRegionIds, [region.id])
    assert.deepEqual(body.corridorFilterCountryIds, [country.id])
    assert.deepEqual(body.corridorFilterServiceCodes, ['bank_account'])
    assert.deepEqual(body.corridorFilterTransactionTypeCodes, ['b2b'])
    assert.deepEqual(body.corridorFilterPayoutCurrencyIds, [currency.id])
    assert.deepEqual(body.corridorFilterPayerCodes, ['some_payer'])
    assert.isTrue(body.corridorFilterHideUsdSwift)
  })

  test('omitting filter fields on create defaults every array to empty and the flag to false', async ({
    client,
    assert,
  }) => {
    const { token } = await createUserWithToken()

    const response = await client
      .post('/quotes')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Unfiltered Quote' })

    response.assertStatus(201)
    const body = response.body()
    assert.deepEqual(body.corridorFilterRegionIds, [])
    assert.deepEqual(body.corridorFilterCountryIds, [])
    assert.deepEqual(body.corridorFilterServiceCodes, [])
    assert.deepEqual(body.corridorFilterTransactionTypeCodes, [])
    assert.deepEqual(body.corridorFilterPayoutCurrencyIds, [])
    assert.deepEqual(body.corridorFilterPayerCodes, [])
    assert.isFalse(body.corridorFilterHideUsdSwift)
  })

  test('PATCH replaces a filter array wholesale, not merges it', async ({ client, assert }) => {
    const { token, user } = await createUserWithToken()
    const { region: region1 } = await createRegionCountryCurrency('2')
    const { region: region2 } = await createRegionCountryCurrency('3')
    const quote = await Quote.create({
      name: 'Quote',
      ownerId: user.id,
      status: 'draft',
      corridorFilterRegionIds: [region1.id],
    })

    const response = await client
      .patch(`/quotes/${quote.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ corridorFilterRegionIds: [region2.id] })

    response.assertStatus(200)
    assert.deepEqual(response.body().corridorFilterRegionIds, [region2.id])
  })

  test('PATCH with an explicit empty array clears a previously-set filter', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const { region } = await createRegionCountryCurrency('4')
    const quote = await Quote.create({
      name: 'Quote',
      ownerId: user.id,
      status: 'draft',
      corridorFilterRegionIds: [region.id],
    })

    const response = await client
      .patch(`/quotes/${quote.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ corridorFilterRegionIds: [] })

    response.assertStatus(200)
    assert.deepEqual(response.body().corridorFilterRegionIds, [])
  })

  test('PATCH omitting filter fields leaves existing filters untouched', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const { region } = await createRegionCountryCurrency('5')
    const quote = await Quote.create({
      name: 'Old Name',
      ownerId: user.id,
      status: 'draft',
      corridorFilterRegionIds: [region.id],
      corridorFilterHideUsdSwift: true,
    })

    const response = await client
      .patch(`/quotes/${quote.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'New Name' })

    response.assertStatus(200)
    assert.deepEqual(response.body().corridorFilterRegionIds, [region.id])
    assert.isTrue(response.body().corridorFilterHideUsdSwift)
  })

  test('rejects an unknown region id in corridorFilterRegionIds', async ({ client }) => {
    const { token } = await createUserWithToken()

    const response = await client
      .post('/quotes')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Quote', corridorFilterRegionIds: [999999] })

    response.assertStatus(422)
  })

  test('rejects an unknown payout currency id in corridorFilterPayoutCurrencyIds', async ({
    client,
  }) => {
    const { token } = await createUserWithToken()

    const response = await client
      .post('/quotes')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Quote', corridorFilterPayoutCurrencyIds: [999999] })

    response.assertStatus(422)
  })

  test('rejects an over-length corridorFilterRegionIds array', async ({ client }) => {
    const { token } = await createUserWithToken()
    const tooMany = Array.from({ length: 51 }, (_, i) => i + 1)

    const response = await client
      .post('/quotes')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Quote', corridorFilterRegionIds: tooMany })

    response.assertStatus(422)
  })

  test('rejects a non-array value for a filter field', async ({ client }) => {
    const { token } = await createUserWithToken()

    const response = await client
      .post('/quotes')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Quote', corridorFilterRegionIds: 'not-an-array' })

    response.assertStatus(422)
  })

  test('accepts arbitrary service/transaction-type/payer codes with no master table', async ({
    client,
    assert,
  }) => {
    const { token } = await createUserWithToken()

    const response = await client
      .post('/quotes')
      .header('Authorization', `Bearer ${token}`)
      .json({
        name: 'Quote',
        corridorFilterServiceCodes: ['made_up_service'],
        corridorFilterTransactionTypeCodes: ['made_up_type'],
        corridorFilterPayerCodes: ['made_up_payer'],
      })

    response.assertStatus(201)
    const body = response.body()
    assert.deepEqual(body.corridorFilterServiceCodes, ['made_up_service'])
    assert.deepEqual(body.corridorFilterTransactionTypeCodes, ['made_up_type'])
    assert.deepEqual(body.corridorFilterPayerCodes, ['made_up_payer'])
  })

  test('cannot PATCH filter fields on a non-draft quote', async ({ client }) => {
    const { token, user } = await createUserWithToken()
    const quote = await Quote.create({ name: 'Submitted', ownerId: user.id, status: 'submitted' })

    const response = await client
      .patch(`/quotes/${quote.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ corridorFilterHideUsdSwift: true })

    response.assertStatus(409)
  })
})
