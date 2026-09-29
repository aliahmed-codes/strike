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

async function createDraftQuote(
  ownerId: number,
  overrides: Partial<{
    opportunityType: string
    contractLengthYears: number
    status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'closed'
  }> = {}
) {
  return Quote.create({
    name: 'Test Quote',
    ownerId,
    status: overrides.status ?? 'draft',
    opportunityType: overrides.opportunityType,
    contractLengthYears: overrides.contractLengthYears ?? 3,
  })
}

async function createCorridor(suffix = '') {
  const region = await Region.create({ code: `TST${suffix}`, name: 'Test Region' })
  const country = await Country.create({
    isoCode3: `ZZ${suffix || 'L'}`,
    name: 'Testland',
    regionId: region.id,
  })
  const currency = await Currency.create({
    isoCode3: `ZZ${suffix || 'Z'}`,
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
    transactionTypeCode: 'b2c',
    payerCode: 'test_payer',
    receivingPartner: 'test_partner',
    payoutCurrencyId: currency.id,
    fxSource: 'Cost Plus',
    treasuryFxCostSpread: 0,
    costFixedUsd: 0,
    costVariablePct: 0,
    networkNeedApprovalRaw: 'No',
    internalRaw: 'None',
    centralBankRaw: 'None',
  })
}

async function addCorridor(
  client: import('@japa/api-client').ApiClient,
  token: string,
  quoteId: number,
  corridorId: number,
  overrides: Record<string, unknown> = {}
) {
  const response = await client
    .post(`/quotes/${quoteId}/corridors`)
    .header('Authorization', `Bearer ${token}`)
    .json({
      corridorId,
      yearlyVolumeUsd: 1_000_000,
      // yearlyTransactions is derived server-side as ceil(volume / atv); atv
      // = 100 here so that derivation lands on the 10,000 these tests expect.
      atvUsd: 100,
      yearlyTransactions: 10_000,
      fixedFeeUsd: 0.5,
      variableFeePct: 1,
      appliedFxSpread: 0.5,
      ...overrides,
    })
  return response
}

test.group('Quote P&L', () => {
  test('rejects unauthenticated requests', async ({ client }) => {
    const getResponse = await client.get('/quotes/1/pnl')
    getResponse.assertStatus(401)

    const putResponse = await client
      .put('/quotes/1/pnl')
      .json({ year2GrowthPct: 0, year3GrowthPct: 0 })
    putResponse.assertStatus(401)
  })

  test("returns 403 when viewing another user's quote P&L", async ({ client }) => {
    const { user: owner } = await createUserWithToken()
    const { token: otherToken } = await createUserWithToken()
    const quote = await createDraftQuote(owner.id)

    const response = await client
      .get(`/quotes/${quote.id}/pnl`)
      .header('Authorization', `Bearer ${otherToken}`)
    response.assertStatus(403)
  })

  test('returns zeroed results for a quote with no corridors, setup fee, or saved growth', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)

    const response = await client
      .get(`/quotes/${quote.id}/pnl`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.equal(response.body().inputs.year2GrowthPct, 0)
    assert.equal(response.body().inputs.year3GrowthPct, 0)
    assert.equal(response.body().years.year1.principal, 0)
    assert.equal(response.body().years.year1.totalRevenue, 0)
    assert.equal(response.body().completeness.corridorCount, 0)
  })

  test('Year 1 aggregates the quote’s real saved corridor pricing', async ({ client, assert }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)
    const corridor = await createCorridor()
    await addCorridor(client, token, quote.id, corridor.id)

    const response = await client
      .get(`/quotes/${quote.id}/pnl`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    // Matches the known-good fixture from quotes.spec.ts: totalRevenue 20_000.
    assert.equal(response.body().years.year1.feeRevenue, 15_000)
    assert.equal(response.body().years.year1.fxMargin, 5_000)
    assert.equal(response.body().years.year1.totalRevenue, 20_000)
    assert.equal(response.body().years.year1.totalMargin, 20_000)
    assert.equal(response.body().completeness.corridorCount, 1)
  })

  test('excludes a zero-volume saved corridor from every total (D2)', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)
    const priced = await createCorridor()
    const zeroVolume = await createCorridor('2')

    await addCorridor(client, token, quote.id, priced.id)
    // Would contribute real revenue if it were counted — fixedFeeUsd * transactions = 1000.
    await addCorridor(client, token, quote.id, zeroVolume.id, {
      yearlyVolumeUsd: 0,
      yearlyTransactions: 100,
      fixedFeeUsd: 10,
    })

    const response = await client
      .get(`/quotes/${quote.id}/pnl`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.equal(response.body().years.year1.feeRevenue, 15_000)
    assert.equal(response.body().completeness.corridorCount, 1)
  })

  test('excludes a soft-deleted corridor from every total', async ({ client, assert }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)
    const corridor = await createCorridor()
    const created = await addCorridor(client, token, quote.id, corridor.id)

    await client
      .delete(`/quotes/${quote.id}/corridors/${created.body().id}`)
      .header('Authorization', `Bearer ${token}`)

    const response = await client
      .get(`/quotes/${quote.id}/pnl`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.equal(response.body().years.year1.principal, 0)
    assert.equal(response.body().completeness.corridorCount, 0)
  })

  test('PUT persists growth inputs, and an explicit 0% stays 0% on the next GET', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)
    const corridor = await createCorridor()
    await addCorridor(client, token, quote.id, corridor.id)

    const putResponse = await client
      .put(`/quotes/${quote.id}/pnl`)
      .header('Authorization', `Bearer ${token}`)
      .json({ year2GrowthPct: 10, year3GrowthPct: 0 })

    putResponse.assertStatus(200)
    assert.equal(putResponse.body().years.year2.principal, 1_100_000)
    assert.equal(putResponse.body().years.year3.principal, 1_100_000)

    const getResponse = await client
      .get(`/quotes/${quote.id}/pnl`)
      .header('Authorization', `Bearer ${token}`)

    getResponse.assertStatus(200)
    assert.equal(getResponse.body().inputs.year2GrowthPct, 10)
    assert.equal(getResponse.body().inputs.year3GrowthPct, 0)
  })

  test('rejects a growth input above the configured maximum', async ({ client }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)

    const response = await client
      .put(`/quotes/${quote.id}/pnl`)
      .header('Authorization', `Bearer ${token}`)
      .json({ year2GrowthPct: 99_999, year3GrowthPct: 0 })

    response.assertStatus(422)
  })

  test('rejects a growth input below -100%', async ({ client }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)

    const response = await client
      .put(`/quotes/${quote.id}/pnl`)
      .header('Authorization', `Bearer ${token}`)
      .json({ year2GrowthPct: -150, year3GrowthPct: 0 })

    response.assertStatus(422)
  })

  test('refuses to update P&L inputs on a non-draft quote', async ({ client }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)
    await Quote.query().where('id', quote.id).update({ status: 'submitted' })

    const response = await client
      .put(`/quotes/${quote.id}/pnl`)
      .header('Authorization', `Bearer ${token}`)
      .json({ year2GrowthPct: 10, year3GrowthPct: 0 })

    response.assertStatus(409)
  })

  test('includes the one-off Setup Fee in Year 1 revenue only', async ({ client, assert }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)
    const corridor = await createCorridor()
    await addCorridor(client, token, quote.id, corridor.id)

    await client
      .put(`/quotes/${quote.id}/setup-fee`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        feeType: 'setup',
        quotedPrice: 50_000,
        paymentSchedule: 'full',
        joiningFeeBillingType: 'at_signing',
        mcfType: 'standard',
        mcfBillingStart: 'at_signing',
        standardCommitmentFee: 0,
        commitmentFeeDiscountPct: 0,
        waivedMonths: 0,
        rebateIncentive: false,
      })

    const response = await client
      .get(`/quotes/${quote.id}/pnl`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.equal(response.body().years.year1.oneOffFee, 50_000)
    assert.equal(response.body().years.year1.totalRevenue, 20_000 + 50_000)
    assert.equal(response.body().years.year2.oneOffFee, 0)
    assert.equal(response.body().completeness.hasSetupFee, true)
  })

  test('splits real MCF commitment fee revenue by year instead of guessing', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)
    const corridor = await createCorridor()
    await addCorridor(client, token, quote.id, corridor.id)

    await client
      .put(`/quotes/${quote.id}/setup-fee`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        feeType: 'setup',
        quotedPrice: 0,
        paymentSchedule: 'full',
        joiningFeeBillingType: 'at_signing',
        mcfType: 'standard',
        mcfBillingStart: 'at_signing',
        standardCommitmentFee: 100,
        commitmentFeeDiscountPct: 0,
        waivedMonths: 0,
        rebateIncentive: false,
        mcfBlockFees: [
          { blockKey: 'y1_h1', commitmentFee: 100 },
          { blockKey: 'y1_h2', commitmentFee: 100 },
          { blockKey: 'y2', commitmentFee: 200 },
          { blockKey: 'y3', commitmentFee: 300 },
        ],
      })

    const response = await client
      .get(`/quotes/${quote.id}/pnl`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.equal(response.body().years.year1.commitmentFeeRevenue, 1200)
    assert.equal(response.body().years.year2.commitmentFeeRevenue, 2400)
    assert.equal(response.body().years.year3.commitmentFeeRevenue, 3600)
  })

  test('flags needsApproval when Year 1 gross margin is below the opportunity-type threshold', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id, { opportunityType: 'New partner' })

    // A corridor with real per-transaction/volume costs, so margin < revenue
    // (the base createCorridor() fixture has zero cost fields, which always
    // yields a 100% gross margin regardless of fee/discount — useless for
    // this test). costFixedUsd=1 * 10_000 transactions = 10_000 of cost.
    const region = await Region.create({ code: 'GMT', name: 'GM Test Region' })
    const country = await Country.create({
      isoCode3: 'GMT',
      name: 'GM Test Land',
      regionId: region.id,
    })
    const currency = await Currency.create({
      isoCode3: 'GMT',
      name: 'GM Test Currency',
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
      transactionTypeCode: 'b2c',
      payerCode: 'test_payer',
      receivingPartner: 'test_partner',
      payoutCurrencyId: currency.id,
      fxSource: 'Cost Plus',
      treasuryFxCostSpread: 0,
      costFixedUsd: 1,
      costVariablePct: 0,
      networkNeedApprovalRaw: 'No',
      internalRaw: 'None',
      centralBankRaw: 'None',
    })

    await addCorridor(client, token, quote.id, corridor.id)

    const response = await client
      .get(`/quotes/${quote.id}/pnl`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    // revenueFee 15_000 + fxMargin 5_000 = 20_000 revenue; marginFee 15_000 - 10_000 cost
    // = 5_000, total margin 5_000 + 5_000 = 10_000 -> GM% = 50%, below the 60% threshold.
    assert.equal(response.body().years.year1.grossMarginPct, 50)
    assert.isTrue(response.body().needsApproval)
    assert.isTrue(response.body().approvalReasons.some((r: string) => r.includes('gross margin')))
  })
})
