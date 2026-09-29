import { test } from '@japa/runner'
import User from '#models/user'
import Region from '#models/region'
import Country from '#models/country'
import Currency from '#models/currency'
import Corridor from '#models/corridor'
import Quote from '#models/quote'
import QuoteSetupFee from '#models/quote_setup_fee'
import QuotePaymentMilestone from '#models/quote_payment_milestone'

function setupFeePayload(overrides: Record<string, unknown> = {}) {
  return {
    feeType: 'setup',
    quotedPrice: 100_000,
    paymentSchedule: 'full',
    joiningFeeBillingType: 'at_signing',
    mcfType: 'standard',
    mcfBillingStart: 'at_signing',
    standardCommitmentFee: 100,
    commitmentFeeDiscountPct: 0,
    waivedMonths: 0,
    rebateIncentive: false,
    ...overrides,
  }
}

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
    name: string
    opportunityType: string
    contractLengthYears: number
    partnerCountryId: number
    partnerPrCode: string
  }> = {}
) {
  return Quote.create({
    name: overrides.name ?? 'Test Quote',
    ownerId,
    status: 'draft',
    opportunityType: overrides.opportunityType,
    contractLengthYears: overrides.contractLengthYears ?? 3,
    partnerCountryId: overrides.partnerCountryId,
    partnerPrCode: overrides.partnerPrCode,
  })
}

async function createCurrency(suffix: string) {
  return Currency.create({
    isoCode3: `Z${suffix}`.slice(0, 3).padEnd(3, 'X'),
    name: `Test Currency ${suffix}`,
    decimalPlaces: 2,
    isSource: true,
    isFunding: true,
    isPayout: true,
    isFee: true,
    isHard: true,
    isPegged: false,
  })
}

async function createCorridor(
  suffix = '',
  overrides: Partial<{ stdFixedFeeUsd: number; treasuryFxCostSpread: number }> = {}
) {
  const region = await Region.create({ code: `TST${suffix}`, name: `Test Region ${suffix}` })
  const country = await Country.create({
    isoCode3: `ZZ${suffix || 'L'}`,
    name: 'Testland',
    regionId: region.id,
  })
  const currency = await createCurrency(suffix || 'Z')
  const corridor = await Corridor.create({
    countryId: country.id,
    serviceCode: 'bank_account',
    transactionTypeCode: 'b2c',
    payerCode: 'test_payer',
    receivingPartner: 'test_partner',
    payoutCurrencyId: currency.id,
    fxSource: 'Cost Plus',
    treasuryFxCostSpread: overrides.treasuryFxCostSpread ?? 0,
    costFixedUsd: 0,
    costVariablePct: 0,
    networkNeedApprovalRaw: 'No',
    internalRaw: 'None',
    centralBankRaw: 'None',
    stdFixedFeeUsd: overrides.stdFixedFeeUsd,
  })
  return { corridor, region, country, currency }
}

async function addCorridor(
  client: import('@japa/api-client').ApiClient,
  token: string,
  quoteId: number,
  corridorId: number,
  overrides: Record<string, unknown> = {}
) {
  return client
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
}

test.group('Quote Summary', () => {
  test('rejects unauthenticated requests', async ({ client }) => {
    const response = await client.get('/quotes/1/summary')
    response.assertStatus(401)
  })

  test("returns 403 when viewing another user's quote summary", async ({ client }) => {
    const { user: owner } = await createUserWithToken()
    const { token: otherToken } = await createUserWithToken()
    const quote = await createDraftQuote(owner.id)

    const response = await client
      .get(`/quotes/${quote.id}/summary`)
      .header('Authorization', `Bearer ${otherToken}`)
    response.assertStatus(403)
  })

  test("admin can view another user's quote summary", async ({ client }) => {
    const { user: owner } = await createUserWithToken()
    const { token: adminToken } = await createUserWithToken('admin')
    const quote = await createDraftQuote(owner.id)

    const response = await client
      .get(`/quotes/${quote.id}/summary`)
      .header('Authorization', `Bearer ${adminToken}`)
    response.assertStatus(200)
  })

  test('returns zeroed results for a quote with no saved corridors', async ({ client, assert }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)

    const response = await client
      .get(`/quotes/${quote.id}/summary`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const body = response.body()
    assert.deepEqual(body.corridorsByRegion, [])
    assert.equal(body.completeness.corridorCount, 0)
    assert.equal(body.contract.uniqueCurrencyPairCount, 0)
    assert.equal(body.contract.totalCorridorRowCount, 0)
    assert.equal(body.corridorsByRegionTotals.corridorCount, 0)
  })

  test('excludes a zero-volume saved corridor from region totals (D2)', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)
    const { corridor: priced } = await createCorridor()
    const { corridor: zeroVolume } = await createCorridor('2')

    await addCorridor(client, token, quote.id, priced.id)
    await addCorridor(client, token, quote.id, zeroVolume.id, {
      yearlyVolumeUsd: 0,
      yearlyTransactions: 100,
    })

    const response = await client
      .get(`/quotes/${quote.id}/summary`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.equal(response.body().completeness.corridorCount, 1)
    assert.equal(response.body().corridorsByRegionTotals.corridorCount, 1)
  })

  test('excludes a soft-deleted corridor, includes it again after restore', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)
    const { corridor } = await createCorridor()
    const created = await addCorridor(client, token, quote.id, corridor.id)

    await client
      .delete(`/quotes/${quote.id}/corridors/${created.body().id}`)
      .header('Authorization', `Bearer ${token}`)

    const deletedResponse = await client
      .get(`/quotes/${quote.id}/summary`)
      .header('Authorization', `Bearer ${token}`)
    deletedResponse.assertStatus(200)
    assert.equal(deletedResponse.body().completeness.corridorCount, 0)

    await client
      .post(`/quotes/${quote.id}/corridors/bulk-restore`)
      .header('Authorization', `Bearer ${token}`)
      .json({ corridorIds: [created.body().id] })

    const restoredResponse = await client
      .get(`/quotes/${quote.id}/summary`)
      .header('Authorization', `Bearer ${token}`)
    restoredResponse.assertStatus(200)
    assert.equal(restoredResponse.body().completeness.corridorCount, 1)
  })

  test('groups corridors by region with correct counts and sums', async ({ client, assert }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)
    const { corridor: corridorA } = await createCorridor('A')
    const { corridor: corridorB } = await createCorridor('B')

    await addCorridor(client, token, quote.id, corridorA.id, {
      fixedFeeUsd: 1,
      appliedFxSpread: 0.4,
      yearlyVolumeUsd: 1_000_000,
    })
    await addCorridor(client, token, quote.id, corridorB.id, {
      fixedFeeUsd: 2,
      appliedFxSpread: 0.6,
      yearlyVolumeUsd: 2_000_000,
    })

    const response = await client
      .get(`/quotes/${quote.id}/summary`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.corridorsByRegion.length, 2)
    for (const row of body.corridorsByRegion) {
      assert.equal(row.countryCount, 1)
      assert.equal(row.corridorCount, 1)
    }
    assert.equal(body.corridorsByRegionTotals.corridorCount, 2)
    assert.equal(body.corridorsByRegionTotals.countryCount, 2)
    assert.equal(body.corridorsByRegionTotals.expectedVolumeUsd, 3_000_000)
    // Unweighted average of 1 and 2 -> 1.5, and 0.4/0.6 -> 0.5.
    assert.equal(body.corridorsByRegionTotals.averageFeeUsd, 1.5)
    assert.equal(body.corridorsByRegionTotals.averageFxSpreadPct, 0.5)
  })

  test('averages use the corridor’s actual quoted fee/spread, not the catalog fallback', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)
    // Catalog fields deliberately set to a different, distinguishable value
    // than the quoted fields sent on save — old app's real bug (see
    // docs/old-app-reference/remaining-quote-tabs.md 4.3) averaged the
    // catalog value instead of what was actually quoted.
    const { corridor } = await createCorridor('C', {
      stdFixedFeeUsd: 999,
      treasuryFxCostSpread: 999,
    })

    await addCorridor(client, token, quote.id, corridor.id, {
      fixedFeeUsd: 3,
      appliedFxSpread: 0.25,
    })

    const response = await client
      .get(`/quotes/${quote.id}/summary`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.equal(response.body().corridorsByRegionTotals.averageFeeUsd, 3)
    assert.equal(response.body().corridorsByRegionTotals.averageFxSpreadPct, 0.25)
  })

  test('a legitimate zero fee/spread is not masked in the average', async ({ client, assert }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)
    const { corridor } = await createCorridor('D')

    await addCorridor(client, token, quote.id, corridor.id, {
      fixedFeeUsd: 0,
      appliedFxSpread: 0,
    })

    const response = await client
      .get(`/quotes/${quote.id}/summary`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.equal(response.body().corridorsByRegionTotals.averageFeeUsd, 0)
    assert.equal(response.body().corridorsByRegionTotals.averageFxSpreadPct, 0)
    assert.equal(response.body().corridorsByRegionTotals.corridorCount, 1)
  })

  test('counts distinct funding/payout currency pairs, deduplicating repeats', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)
    const { corridor: corridorOne } = await createCorridor('E')
    // A second catalog corridor sharing corridorOne's payout currency, so a
    // duplicate funding/payout pair can exist across two different corridor
    // rows (the DB's real (quote, corridor, fundingCurrency) unique index
    // blocks a true duplicate on the *same* corridor — see
    // funding_currency_unique_index migration — so the repeat here must come
    // from a different corridorId, matching how it would happen in practice).
    const region = await Region.create({ code: 'TSTE2', name: 'Test Region E2' })
    const country = await Country.create({ isoCode3: 'ZE2', name: 'Testland', regionId: region.id })
    const corridorTwo = await Corridor.create({
      countryId: country.id,
      serviceCode: 'bank_account',
      transactionTypeCode: 'b2c',
      payerCode: 'test_payer_2',
      receivingPartner: 'test_partner',
      payoutCurrencyId: corridorOne.payoutCurrencyId,
      fxSource: 'Cost Plus',
      treasuryFxCostSpread: 0,
      costFixedUsd: 0,
      costVariablePct: 0,
      networkNeedApprovalRaw: 'No',
      internalRaw: 'None',
      centralBankRaw: 'None',
    })
    const fundingCurrencyA = await createCurrency('FA')
    const fundingCurrencyB = await createCurrency('FB')

    await addCorridor(client, token, quote.id, corridorOne.id, {
      fundingCurrencyId: fundingCurrencyA.id,
    })
    await addCorridor(client, token, quote.id, corridorOne.id, {
      fundingCurrencyId: fundingCurrencyB.id,
    })
    // Same funding/payout pair as the first row, but a different corridorId.
    await addCorridor(client, token, quote.id, corridorTwo.id, {
      fundingCurrencyId: fundingCurrencyA.id,
    })

    const response = await client
      .get(`/quotes/${quote.id}/summary`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.equal(response.body().contract.uniqueCurrencyPairCount, 2)
    assert.equal(response.body().contract.totalCorridorRowCount, 3)
  })

  test('missing partner country renders as explicitly missing, never a fake default', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)

    const response = await client
      .get(`/quotes/${quote.id}/summary`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const body = response.body()
    assert.isNull(body.partner.regionName)
    assert.isNull(body.partner.countryName)
    assert.isTrue(body.completeness.partnerCountryMissing)
    assert.isTrue(body.completeness.partnerRegionMissing)
  })

  test('partner region/country resolve from the real partnerCountry relation when set', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const { corridor } = await createCorridor('F')
    const quote = await createDraftQuote(user.id, { partnerCountryId: corridor.countryId })

    const response = await client
      .get(`/quotes/${quote.id}/summary`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.equal(response.body().partner.countryName, 'Testland')
    assert.equal(response.body().partner.regionName, 'Test Region F')
  })

  test('financial projections default growth to 0, not the old app’s 15% fallback', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)

    const response = await client
      .get(`/quotes/${quote.id}/summary`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.equal(response.body().financialProjections.inputs.year2GrowthPct, 0)
    assert.equal(response.body().financialProjections.inputs.year3GrowthPct, 0)
  })

  test('financial projections match a direct /pnl call for the same quote', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)
    const { corridor } = await createCorridor('G')
    await addCorridor(client, token, quote.id, corridor.id)
    await client
      .put(`/quotes/${quote.id}/pnl`)
      .header('Authorization', `Bearer ${token}`)
      .json({ year2GrowthPct: 12, year3GrowthPct: 8 })

    const summaryResponse = await client
      .get(`/quotes/${quote.id}/summary`)
      .header('Authorization', `Bearer ${token}`)
    const pnlResponse = await client
      .get(`/quotes/${quote.id}/pnl`)
      .header('Authorization', `Bearer ${token}`)

    summaryResponse.assertStatus(200)
    pnlResponse.assertStatus(200)
    assert.deepEqual(summaryResponse.body().financialProjections.years, pnlResponse.body().years)
    assert.deepEqual(summaryResponse.body().financialProjections.inputs, pnlResponse.body().inputs)
  })

  test('quote with no setup fee yet returns an all-null setup fee section', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)

    const response = await client
      .get(`/quotes/${quote.id}/summary`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const body = response.body()
    assert.isFalse(body.completeness.hasSetupFee)
    assert.isNull(body.setupFee.totalContractValue)
    assert.isNull(body.contract.totalContractValue)
    assert.deepEqual(body.setupFee.paymentMilestones, [])
  })

  test('setup fee totals match computeSetupFeeTotals directly (no drift)', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)

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
        standardCommitmentFee: 100,
        commitmentFeeDiscountPct: 0,
        waivedMonths: 0,
        rebateIncentive: false,
      })

    const response = await client
      .get(`/quotes/${quote.id}/summary`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const body = response.body()
    assert.isTrue(body.completeness.hasSetupFee)
    // quotedPrice 50_000 + 36 months * 100 commitment fee = 53_600.
    assert.equal(body.setupFee.totalContractValue, 53_600)
    assert.equal(body.contract.totalContractValue, 53_600)
    assert.equal(body.setupFee.finalCommitmentFee, 100)
    assert.equal(body.contract.monthlyCommitmentFee, 100)
  })

  test('partner type reuses opportunityType, owner name resolves from the real user', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id, { opportunityType: 'New partner' })

    const response = await client
      .get(`/quotes/${quote.id}/summary`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.equal(response.body().partner.partnerType, 'New partner')
    assert.equal(response.body().partner.ownerName, 'Test User')
  })

  test('hides payment milestones left over from a custom schedule when the schedule is full', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)

    await client
      .put(`/quotes/${quote.id}/setup-fee`)
      .header('Authorization', `Bearer ${token}`)
      .json(setupFeePayload({ paymentSchedule: 'full' }))

    const setupFee = await QuoteSetupFee.findByOrFail('quoteId', quote.id)
    await QuotePaymentMilestone.createMany([
      {
        quoteSetupFeeId: setupFee.id,
        milestone: 'On Contract Signature',
        percentage: 50,
        sortOrder: 0,
      },
      { quoteSetupFeeId: setupFee.id, milestone: 'Within 90 days', percentage: 50, sortOrder: 1 },
    ])

    const response = await client
      .get(`/quotes/${quote.id}/summary`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.equal(response.body().setupFee.paymentSchedule, 'full')
    assert.deepEqual(response.body().setupFee.paymentMilestones, [])
  })

  test('lists custom-schedule milestones in their saved order', async ({ client, assert }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)

    await client
      .put(`/quotes/${quote.id}/setup-fee`)
      .header('Authorization', `Bearer ${token}`)
      .json(
        setupFeePayload({
          paymentSchedule: 'custom',
          paymentMilestones: [
            { milestone: 'First', percentage: 40 },
            { milestone: 'Second', percentage: 60, description: 'Go-live' },
          ],
        })
      )
    // Insertion order must not decide the result — sortOrder does.
    await QuotePaymentMilestone.query().where('milestone', 'First').update({ sortOrder: 5 })

    const response = await client
      .get(`/quotes/${quote.id}/summary`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const milestones = response.body().setupFee.paymentMilestones
    assert.deepEqual(
      milestones.map((m: { milestone: string }) => m.milestone),
      ['Second', 'First']
    )
    assert.equal(milestones[0].description, 'Go-live')
    assert.equal(milestones[0].percentage, 60)
  })

  test('corridor projections cover corridor revenue only and tie to the region totals', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)
    const { corridor } = await createCorridor('H')
    await addCorridor(client, token, quote.id, corridor.id)
    // A large setup fee and commitment fee must not leak into corridor revenue.
    await client
      .put(`/quotes/${quote.id}/setup-fee`)
      .header('Authorization', `Bearer ${token}`)
      .json(setupFeePayload({ quotedPrice: 500_000, standardCommitmentFee: 10_000 }))
    await client
      .put(`/quotes/${quote.id}/pnl`)
      .header('Authorization', `Bearer ${token}`)
      .json({ year2GrowthPct: 10, year3GrowthPct: 0 })

    const response = await client
      .get(`/quotes/${quote.id}/summary`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const { corridorProjections, corridorsByRegionTotals } = response.body()
    assert.equal(corridorProjections.year1.revenue, corridorsByRegionTotals.projectedRevenueUsd)
    assert.equal(corridorProjections.year1.volume, corridorsByRegionTotals.expectedVolumeUsd)
    assert.equal(corridorProjections.year1.transactions, 10_000)
    // Fixture corridor: 1_000_000 volume -> 20_000 revenue in Year 1.
    assert.equal(corridorProjections.year1.revenue, 20_000)
    assert.equal(corridorProjections.year2.revenue, 22_000)
    assert.equal(corridorProjections.year2.volume, 1_100_000)
    // An explicit 0% Year 3 growth stays flat at Year 2, never a guessed default.
    assert.equal(corridorProjections.year3.revenue, 22_000)
  })
})
