import { test } from '@japa/runner'
import User from '#models/user'
import Quote from '#models/quote'
import Currency from '#models/currency'

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
  overrides: Partial<{ opportunityType: string; contractLengthYears: number }> = {}
) {
  return Quote.create({
    name: 'Test Quote',
    ownerId,
    status: 'draft',
    opportunityType: overrides.opportunityType ?? 'New partner',
    contractLengthYears: overrides.contractLengthYears ?? 1,
  })
}

async function createCurrency() {
  return Currency.create({
    isoCode3: 'TU1',
    name: 'Test Currency',
    decimalPlaces: 2,
    isSource: true,
    isFunding: true,
    isPayout: true,
    isFee: true,
    isHard: true,
    isPegged: false,
  })
}

/** Treasury Management is the one "other fee" concept that requires a currency. */
function buildValidPayload(currencyId: number) {
  return {
    feeType: 'setup',
    quotedPrice: 100_000,
    paymentSchedule: 'full',
    joiningFeeBillingType: 'at_signing',
    mcfType: 'standard',
    mcfBillingStart: 'at_signing',
    standardCommitmentFee: 5000,
    commitmentFeeDiscountPct: 0,
    waivedMonths: 0,
    rebateIncentive: false,
    otherFees: [
      { conceptCode: 'reversal_request', amount: 10, isPercentage: false },
      { conceptCode: 'proof_of_payment', amount: 10, isPercentage: false },
      { conceptCode: 'emergency_funding', amount: 0.3, isPercentage: true },
      { conceptCode: 'treasury_management', amount: 0.1, isPercentage: true, currencyId },
      { conceptCode: 'business_hub_platform', amount: 500, isPercentage: false },
      { conceptCode: 'corridor_no_usage', amount: 200, isPercentage: false },
      { conceptCode: 'bulk_currency_conversion', amount: 200, isPercentage: false },
    ],
  }
}

test.group('Setup Fee', () => {
  test('rejects unauthenticated requests', async ({ client }) => {
    const getResponse = await client.get('/quotes/1/setup-fee')
    getResponse.assertStatus(401)

    const putResponse = await client.put('/quotes/1/setup-fee').json(buildValidPayload(1))
    putResponse.assertStatus(401)
  })

  test('returns null when no setup fee has been saved yet', async ({ client, assert }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)

    const response = await client
      .get(`/quotes/${quote.id}/setup-fee`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.isNull(response.body().setupFee)
  })

  test("returns 403 when viewing another user's quote setup fee", async ({ client }) => {
    const { user: owner } = await createUserWithToken()
    const { token: otherToken } = await createUserWithToken()
    const quote = await createDraftQuote(owner.id)

    const response = await client
      .get(`/quotes/${quote.id}/setup-fee`)
      .header('Authorization', `Bearer ${otherToken}`)

    response.assertStatus(403)
  })

  test('saves a valid setup fee and computes totals on the backend', async ({ client, assert }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)
    const currency = await createCurrency()

    const response = await client
      .put(`/quotes/${quote.id}/setup-fee`)
      .header('Authorization', `Bearer ${token}`)
      .json(buildValidPayload(currency.id))

    response.assertStatus(200)
    const body = response.body().setupFee
    assert.equal(body.feeType, 'setup')
    assert.equal(body.finalCommitmentFee, 5000)
    assert.equal(body.year1CommitmentFees, 60000)
    assert.equal(body.year1CommittedRevenue, 160000)
    assert.equal(body.totalContractValue, 160000)
    assert.isFalse(body.needsApproval)
    assert.lengthOf(body.otherFees, 7)
  })

  test('rejects updating a non-draft quote', async ({ client }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)
    quote.status = 'submitted'
    await quote.save()
    const currency = await createCurrency()

    const response = await client
      .put(`/quotes/${quote.id}/setup-fee`)
      .header('Authorization', `Bearer ${token}`)
      .json(buildValidPayload(currency.id))

    response.assertStatus(409)
  })

  test('rejects waived months above the real cap of 6', async ({ client }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)
    const currency = await createCurrency()

    const response = await client
      .put(`/quotes/${quote.id}/setup-fee`)
      .header('Authorization', `Bearer ${token}`)
      .json({ ...buildValidPayload(currency.id), waivedMonths: 24 })

    response.assertStatus(422)
  })

  test('rejects a custom payment schedule whose milestones do not sum to 100%', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)
    const currency = await createCurrency()

    const response = await client
      .put(`/quotes/${quote.id}/setup-fee`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        ...buildValidPayload(currency.id),
        paymentSchedule: 'custom',
        paymentMilestones: [
          { milestone: 'On Signature', percentage: 50 },
          { milestone: 'Within 90 days', percentage: 40 },
        ],
      })

    response.assertStatus(422)
    assert.equal(response.body().errors[0].field, 'general')
    assert.include(response.body().errors[0].message, 'exactly 100%')
  })

  test('rejects a principal-based commitment fee missing required slots', async ({ client }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)
    const currency = await createCurrency()

    const response = await client
      .put(`/quotes/${quote.id}/setup-fee`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        ...buildValidPayload(currency.id),
        mcfType: 'principal',
        mcfPrincipalSlots: [
          {
            slotIndex: 0,
            label: 'Months 1-6',
            startMonth: 1,
            endMonth: 6,
            monthlyPrincipal: 10000,
            ratePct: 1,
          },
        ],
      })

    response.assertStatus(422)
  })

  test('flags needs_approval when an other-fee differs from its default', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)
    const currency = await createCurrency()

    const response = await client
      .put(`/quotes/${quote.id}/setup-fee`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        ...buildValidPayload(currency.id),
        otherFees: [{ conceptCode: 'reversal_request', amount: 999, isPercentage: false }],
      })

    response.assertStatus(200)
    const body = response.body().setupFee
    assert.isTrue(body.needsApproval)
    assert.isTrue(body.approvalReasons.some((r: string) => r.includes('reversal_request')))
  })

  test('rejects Treasury Management Fee with no currency selected', async ({ client, assert }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)
    const currency = await createCurrency()

    const response = await client
      .put(`/quotes/${quote.id}/setup-fee`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        ...buildValidPayload(currency.id),
        otherFees: [{ conceptCode: 'treasury_management', amount: 0.1, isPercentage: true }],
      })

    response.assertStatus(422)
    assert.include(response.body().errors[0].message, 'treasury_management')
  })

  test('rejects Rebate Incentive enabled with no Rebate Type selected', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id)
    const currency = await createCurrency()

    const response = await client
      .put(`/quotes/${quote.id}/setup-fee`)
      .header('Authorization', `Bearer ${token}`)
      .json({ ...buildValidPayload(currency.id), rebateIncentive: true })

    response.assertStatus(422)
    assert.include(response.body().errors[0].message, 'Rebate Type')
  })

  test('Upsell opportunity type bypasses every setup-fee approval check', async ({
    client,
    assert,
  }) => {
    const { token, user } = await createUserWithToken()
    const quote = await createDraftQuote(user.id, { opportunityType: 'Upsell' })
    const currency = await createCurrency()

    const response = await client
      .put(`/quotes/${quote.id}/setup-fee`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        ...buildValidPayload(currency.id),
        quotedPrice: 0,
        standardCommitmentFee: 0,
        rebateIncentive: true,
        rebateType: 'volume',
      })

    response.assertStatus(200)
    const body = response.body().setupFee
    assert.isFalse(body.needsApproval)
    assert.lengthOf(body.approvalReasons, 0)
  })
})
