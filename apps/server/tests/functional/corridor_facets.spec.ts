import { test } from '@japa/runner'
import User from '#models/user'
import Region from '#models/region'
import Country from '#models/country'
import Currency from '#models/currency'
import Corridor from '#models/corridor'

async function createUserWithToken() {
  const user = await User.create({
    firstName: 'Test',
    lastName: 'User',
    email: `${Math.random().toString(36).slice(2)}@example.com`,
    password: 'password123',
    role: 'sales',
  })
  const token = await User.accessTokens.create(user)
  return token.value!.release()
}

async function seedTwoCorridorsInDifferentRegions() {
  const region1 = await Region.create({ code: 'R1', name: 'Region One' })
  const region2 = await Region.create({ code: 'R2', name: 'Region Two' })
  const country1 = await Country.create({
    isoCode2: 'C1',
    name: 'Country One',
    regionId: region1.id,
  })
  const country2 = await Country.create({
    isoCode2: 'C2',
    name: 'Country Two',
    regionId: region2.id,
  })
  const currency = await Currency.create({
    isoCode3: 'CUR',
    name: 'Test Currency',
    decimalPlaces: 2,
    isSource: true,
    isFunding: true,
    isPayout: true,
    isFee: true,
    isHard: true,
    isPegged: false,
  })

  const corridor1 = await Corridor.create({
    countryId: country1.id,
    serviceCode: 'bank_account',
    transactionTypeCode: 'b2b',
    payerCode: 'payer_a',
    payoutCurrencyId: currency.id,
  })
  const corridor2 = await Corridor.create({
    countryId: country2.id,
    serviceCode: 'card',
    transactionTypeCode: 'b2c',
    payerCode: 'payer_b',
    payoutCurrencyId: currency.id,
  })

  return { region1, region2, country1, country2, corridor1, corridor2 }
}

test.group('Corridor facets', () => {
  test('returns total counts and per-dimension breakdowns with no filters', async ({
    client,
    assert,
  }) => {
    const token = await createUserWithToken()
    const { region1, region2 } = await seedTwoCorridorsInDifferentRegions()

    const response = await client
      .get('/reference/corridors/facets')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.totalAvailable, 2)
    assert.equal(body.totalMatched, 2)

    const regionCounts = Object.fromEntries(
      body.regions.map((r: { value: number; count: number }) => [r.value, r.count])
    )
    assert.equal(regionCounts[region1.id], 1)
    assert.equal(regionCounts[region2.id], 1)
  })

  test('narrows totalMatched and other-dimension facets when a region filter is applied', async ({
    client,
    assert,
  }) => {
    const token = await createUserWithToken()
    const { region1, country1 } = await seedTwoCorridorsInDifferentRegions()

    const response = await client
      .get(`/reference/corridors/facets?regionId=${region1.id}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.totalMatched, 1)
    // Countries facet respects the active region filter (only country1 remains).
    assert.lengthOf(body.countries, 1)
    assert.equal(body.countries[0].value, country1.id)
  })

  test("a facet's own dimension is not narrowed by its own active filter", async ({
    client,
    assert,
  }) => {
    const token = await createUserWithToken()
    const { region1, region2 } = await seedTwoCorridorsInDifferentRegions()

    const response = await client
      .get(`/reference/corridors/facets?regionId=${region1.id}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const body = response.body()
    // Both regions still show up (so the UI can show what picking the OTHER region would do).
    const regionValues = body.regions.map((r: { value: number }) => r.value)
    assert.includeMembers(regionValues, [region1.id, region2.id])
  })
})
