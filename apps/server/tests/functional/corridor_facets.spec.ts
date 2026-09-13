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
    isoCode3: 'CO1',
    name: 'Country One',
    regionId: region1.id,
  })
  const country2 = await Country.create({
    isoCode3: 'CO2',
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
    receivingPartner: 'partner_a',
    payoutCurrencyId: currency.id,
  })
  const corridor2 = await Corridor.create({
    countryId: country2.id,
    serviceCode: 'card',
    transactionTypeCode: 'b2c',
    payerCode: 'payer_b',
    receivingPartner: 'partner_b',
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

  test('narrows totalMatched and other-dimension counts when a region filter is applied, but keeps every option listed', async ({
    client,
    assert,
  }) => {
    const token = await createUserWithToken()
    const { region1, country1, country2 } = await seedTwoCorridorsInDifferentRegions()

    const response = await client
      .get(`/reference/corridors/facets?regionIds=${region1.id}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.totalMatched, 1)
    // Both countries still appear (so the UI can show country2 disabled rather
    // than removing it) but only country1's count reflects the region filter.
    assert.lengthOf(body.countries, 2)
    const countryCounts = Object.fromEntries(
      body.countries.map((c: { value: number; count: number }) => [c.value, c.count])
    )
    assert.equal(countryCounts[country1.id], 1)
    assert.equal(countryCounts[country2.id], 0)
  })

  test("a facet's own dimension is not narrowed by its own active filter", async ({
    client,
    assert,
  }) => {
    const token = await createUserWithToken()
    const { region1, region2 } = await seedTwoCorridorsInDifferentRegions()

    const response = await client
      .get(`/reference/corridors/facets?regionIds=${region1.id}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const body = response.body()
    // Both regions still show up (so the UI can show what picking the OTHER region would do).
    const regionValues = body.regions.map((r: { value: number }) => r.value)
    assert.includeMembers(regionValues, [region1.id, region2.id])
  })

  test('region counts ignore every filter, even ones from other dimensions (matches the old app exactly)', async ({
    client,
    assert,
  }) => {
    const token = await createUserWithToken()
    const { region1, region2, country1 } = await seedTwoCorridorsInDifferentRegions()

    // Filtering by country1 (which is in region1) should narrow the Service
    // facet (a different dimension) but must NOT change either region's count.
    const response = await client
      .get(`/reference/corridors/facets?countryIds=${country1.id}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const body = response.body()
    const regionCounts = Object.fromEntries(
      body.regions.map((r: { value: number; count: number }) => [r.value, r.count])
    )
    assert.equal(regionCounts[region1.id], 1)
    assert.equal(regionCounts[region2.id], 1)

    // Service facet, in contrast, is narrowed down to just corridor1's service.
    assert.equal(body.services.find((s: { value: string }) => s.value === 'bank_account').count, 1)
    assert.equal(body.services.find((s: { value: string }) => s.value === 'card').count, 0)
  })

  test('hideUsdSwift excludes SWIFT-payer corridors from every count, but keeps the payer listed', async ({
    client,
    assert,
  }) => {
    const token = await createUserWithToken()
    const { region1, country1 } = await seedTwoCorridorsInDifferentRegions()
    const currency = await Currency.create({
      isoCode3: 'CU2',
      name: 'Test Currency Two',
      decimalPlaces: 2,
      isSource: false,
      isFunding: false,
      isPayout: true,
      isFee: false,
      isHard: false,
      isPegged: false,
    })
    await Corridor.create({
      countryId: country1.id,
      serviceCode: 'bank_account',
      transactionTypeCode: 'b2b',
      payerCode: 'Some SWIFT Wire Transfer',
      receivingPartner: 'partner_c',
      payoutCurrencyId: currency.id,
    })

    const response = await client
      .get('/reference/corridors/facets?hideUsdSwift=true')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const body = response.body()
    // The 2 baseline corridors still count; the SWIFT one is excluded everywhere.
    assert.equal(body.totalMatched, 2)
    const regionCounts = Object.fromEntries(
      body.regions.map((r: { value: number; count: number }) => [r.value, r.count])
    )
    assert.equal(regionCounts[region1.id], 1)

    const payerOption = body.payers.find(
      (p: { value: string }) => p.value === 'Some SWIFT Wire Transfer'
    )
    assert.exists(payerOption)
    assert.equal(payerOption.count, 0)
  })

  test('restrictToUseCaseAllowedCountries limits the picker to the compliance allow-list', async ({
    client,
    assert,
  }) => {
    const token = await createUserWithToken()
    const region = await Region.create({ code: 'EUR2', name: 'Europe Test' })
    const allowedCountry = await Country.create({
      isoCode3: 'FRA',
      name: 'France',
      regionId: region.id,
    })
    const disallowedCountry = await Country.create({
      isoCode3: 'ZZQ',
      name: 'Not Allow-Listed',
      regionId: region.id,
    })
    const currency = await Currency.create({
      isoCode3: 'CU3',
      name: 'Test Currency Three',
      decimalPlaces: 2,
      isSource: false,
      isFunding: false,
      isPayout: true,
      isFee: false,
      isHard: false,
      isPegged: false,
    })
    await Corridor.create({
      countryId: allowedCountry.id,
      serviceCode: 'bank_account',
      transactionTypeCode: 'b2b',
      payerCode: 'payer_allowed',
      receivingPartner: 'partner_allowed',
      payoutCurrencyId: currency.id,
    })
    await Corridor.create({
      countryId: disallowedCountry.id,
      serviceCode: 'bank_account',
      transactionTypeCode: 'b2b',
      payerCode: 'payer_disallowed',
      receivingPartner: 'partner_disallowed',
      payoutCurrencyId: currency.id,
    })

    const response = await client
      .get('/reference/corridors/facets?restrictToUseCaseAllowedCountries=true')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.totalMatched, 1)
    const countryValues = body.countries.map((c: { value: number }) => c.value)
    assert.includeMembers(countryValues, [allowedCountry.id])
    assert.notInclude(countryValues, disallowedCountry.id)
  })
})
