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

test.group('Corridor multi-select filter transport', () => {
  for (const dimension of [
    'regionIds',
    'countryIds',
    'serviceCodes',
    'transactionTypeCodes',
    'payoutCurrencyIds',
    'payerCodes',
  ] as const) {
    test(`honors comma-separated ${dimension} on both endpoints`, async ({ client, assert }) => {
      const token = await createUserWithToken()
      const { region1, country1, corridor1, corridor2 } = await seedTwoCorridorsInDifferentRegions()
      const otherCurrency = await Currency.create({
        isoCode3: 'OTH',
        name: 'Other Currency',
        decimalPlaces: 2,
        isSource: false,
        isFunding: false,
        isPayout: true,
        isFee: false,
        isHard: false,
        isPegged: false,
      })
      await corridor2.merge({ payoutCurrencyId: otherCurrency.id }).save()
      const values = {
        regionIds: `${region1.id},99999999`,
        countryIds: `${country1.id},99999999`,
        serviceCodes: 'bank_account,missing_service',
        transactionTypeCodes: 'b2b,missing_type',
        payoutCurrencyIds: `${corridor1.payoutCurrencyId},99999999`,
        payerCodes: 'payer_a,missing_payer',
      }
      for (const endpoint of ['facets', 'matching']) {
        const response = await client
          .get(`/reference/corridors/${endpoint}?${dimension}=${values[dimension]}`)
          .header('Authorization', `Bearer ${token}`)
        response.assertStatus(200)
        if (endpoint === 'facets') assert.equal(response.body().totalMatched, 1)
        else
          assert.deepEqual(
            response.body().corridors.map((c: { id: number }) => c.id),
            [corridor1.id]
          )
      }
    })
  }

  test('combines selections with OR within a dimension and AND across dimensions', async ({
    client,
    assert,
  }) => {
    const token = await createUserWithToken()
    const { country1, country2, corridor1 } = await seedTwoCorridorsInDifferentRegions()
    const params = new URLSearchParams()
    params.append('countryIds[]', String(country1.id))
    params.append('countryIds[]', String(country2.id))
    params.append('serviceCodes[]', 'bank_account')
    params.append('serviceCodes[]', 'card')
    for (const endpoint of ['facets', 'matching']) {
      const response = await client
        .get(`/reference/corridors/${endpoint}?${params}`)
        .header('Authorization', `Bearer ${token}`)
      response.assertStatus(200)
      assert.equal(
        endpoint === 'facets' ? response.body().totalMatched : response.body().corridors.length,
        2
      )
    }
    params.append('payerCodes[]', 'payer_a')
    params.append('payerCodes[]', 'missing_payer')
    const narrowed = await client
      .get(`/reference/corridors/matching?${params}`)
      .header('Authorization', `Bearer ${token}`)
    narrowed.assertStatus(200)
    assert.deepEqual(
      narrowed.body().corridors.map((c: { id: number }) => c.id),
      [corridor1.id]
    )
  })

  test('conflicting country and payer multi-selections return no matches', async ({
    client,
    assert,
  }) => {
    const token = await createUserWithToken()
    const { region1, country1 } = await seedTwoCorridorsInDifferentRegions()
    const query = `regionIds=${region1.id}&countryIds=${country1.id},99999999&serviceCodes=bank_account,card&transactionTypeCodes=b2b,b2c&payerCodes=payer_b,missing_payer`
    for (const endpoint of ['facets', 'matching']) {
      const response = await client
        .get(`/reference/corridors/${endpoint}?${query}`)
        .header('Authorization', `Bearer ${token}`)
      response.assertStatus(200)
      if (endpoint === 'facets') {
        assert.equal(response.body().totalMatched, 0)
        assert.equal(
          response.body().regions.find((r: { value: number }) => r.value === region1.id).count,
          1
        )
        assert.equal(
          response.body().payers.find((p: { value: string }) => p.value === 'payer_b').count,
          0
        )
      } else assert.deepEqual(response.body().corridors, [])
    }
  })

  test('preserves commas and ampersands inside an explicitly encoded payer array', async ({
    client,
    assert,
  }) => {
    const token = await createUserWithToken()
    const { corridor1 } = await seedTwoCorridorsInDifferentRegions()
    const payer = 'Bank, Branch & Partners'
    await corridor1.merge({ payerCode: payer }).save()
    const params = new URLSearchParams()
    params.append('payerCodes[]', payer)
    params.append('payerCodes[]', 'missing_payer')
    for (const endpoint of ['facets', 'matching']) {
      const response = await client
        .get(`/reference/corridors/${endpoint}?${params}`)
        .header('Authorization', `Bearer ${token}`)
      response.assertStatus(200)
      if (endpoint === 'facets') assert.equal(response.body().totalMatched, 1)
      else
        assert.deepEqual(
          response.body().corridors.map((c: { id: number }) => c.id),
          [corridor1.id]
        )
    }
  })

  test('clearing every filter restores the unfiltered catalog', async ({ client, assert }) => {
    const token = await createUserWithToken()
    await seedTwoCorridorsInDifferentRegions()
    const query =
      'regionIds=&countryIds=&serviceCodes=&transactionTypeCodes=&payoutCurrencyIds=&payerCodes=&hideUsdSwift=&restrictToUseCaseAllowedCountries='
    for (const endpoint of ['facets', 'matching']) {
      const response = await client
        .get(`/reference/corridors/${endpoint}?${query}`)
        .header('Authorization', `Bearer ${token}`)
      response.assertStatus(200)
      assert.equal(
        endpoint === 'facets' ? response.body().totalMatched : response.body().corridors.length,
        2
      )
    }
  })

  test('rejects malformed filters instead of silently returning the entire catalog', async ({
    client,
  }) => {
    const token = await createUserWithToken()
    for (const query of [
      'countryIds=invalid,also_invalid',
      'countryIds[nested]=1',
      'hideUsdSwift=invalid',
    ]) {
      for (const endpoint of ['facets', 'matching']) {
        const response = await client
          .get(`/reference/corridors/${endpoint}?${query}`)
          .header('Authorization', `Bearer ${token}`)
        response.assertStatus(422)
      }
    }
  })
})

test.group('Matching corridors (Bulk Add by Filter)', () => {
  test('lists the individual corridors matching the current filters', async ({
    client,
    assert,
  }) => {
    const token = await createUserWithToken()
    const { region1, corridor1 } = await seedTwoCorridorsInDifferentRegions()

    const response = await client
      .get(`/reference/corridors/matching?regionIds=${region1.id}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const body = response.body()
    assert.lengthOf(body.corridors, 1)
    assert.equal(body.corridors[0].id, corridor1.id)
  })

  test('returns an empty list when nothing matches', async ({ client, assert }) => {
    const token = await createUserWithToken()
    await seedTwoCorridorsInDifferentRegions()

    const response = await client
      .get(`/reference/corridors/matching?serviceCodes=nonexistent_service`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.deepEqual(response.body().corridors, [])
  })

  test('with no filters, lists every corridor up to the safety cap', async ({ client, assert }) => {
    const token = await createUserWithToken()
    await seedTwoCorridorsInDifferentRegions()

    const response = await client
      .get('/reference/corridors/matching')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.lengthOf(response.body().corridors, 2)
  })
})
