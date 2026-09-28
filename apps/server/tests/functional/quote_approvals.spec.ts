import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import User from '#models/user'
import Region from '#models/region'
import Country from '#models/country'
import Currency from '#models/currency'
import Corridor from '#models/corridor'
import Quote from '#models/quote'
import QuoteApproval from '#models/quote_approval'

async function createUser(
  overrides: Partial<{
    role: 'admin' | 'sales' | 'viewer'
    approvalGroup: 'network_team' | 'pricing_team' | 'csuite'
    managerId: number
  }> = {}
) {
  const user = await User.create({
    firstName: 'Test',
    lastName: 'User',
    email: `${Math.random().toString(36).slice(2)}@example.com`,
    password: 'password123',
    role: overrides.role ?? 'sales',
    approvalGroup: overrides.approvalGroup ?? null,
    managerId: overrides.managerId ?? null,
  })
  const token = await User.accessTokens.create(user)
  return { user, token: token.value!.release() }
}

async function createDraftQuote(ownerId: number) {
  return Quote.create({
    name: 'Approvals Test Quote',
    ownerId,
    status: 'draft',
    contractLengthYears: 3,
  })
}

let corridorSequence = 0

/** A short, unique base-36 pair fitting a varchar(3) ISO code column. */
function nextCode(): string {
  corridorSequence += 1
  return corridorSequence.toString(36).padStart(2, '0').slice(-2).toUpperCase()
}

async function createCorridor(overrides: Partial<Record<string, unknown>> = {}) {
  const code = nextCode()
  const region = await Region.create({ code: `R${code}`, name: 'Approvals Region' })
  const country = await Country.create({
    isoCode3: `A${code}`,
    name: 'Approvalsland',
    regionId: region.id,
  })
  const currency = await Currency.create({
    isoCode3: `A${code}`,
    name: 'Approvals Currency',
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
    ...overrides,
  })
}

async function addCorridor(
  client: ApiClient,
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
      yearlyTransactions: 10_000,
      fixedFeeUsd: 0.5,
      variableFeePct: 1,
      appliedFxSpread: 0.5,
      ...overrides,
    })
}

async function saveSetupFee(
  client: ApiClient,
  token: string,
  quoteId: number,
  overrides: Record<string, unknown> = {}
) {
  return client
    .put(`/quotes/${quoteId}/setup-fee`)
    .header('Authorization', `Bearer ${token}`)
    .json({
      feeType: 'setup',
      quotedPrice: 200_000,
      paymentSchedule: 'full',
      joiningFeeBillingType: 'at_signing',
      mcfType: 'standard',
      mcfBillingStart: 'at_signing',
      standardCommitmentFee: 10_000,
      commitmentFeeDiscountPct: 0,
      waivedMonths: 0,
      rebateIncentive: false,
      ...overrides,
    })
}

async function saveAnnex(client: ApiClient, token: string, quoteId: number) {
  return client
    .put(`/quotes/${quoteId}/fee-annex`)
    .header('Authorization', `Bearer ${token}`)
    .json({ name: 'Annex', content: '<h1>Fee Annex</h1><p>Terms</p>' })
}

/** Builds a fully ready-to-submit quote: a corridor, a Setup Fee, and a saved Fee Annex. */
async function makeReadyQuote(
  client: ApiClient,
  ownerId: number,
  ownerToken: string,
  quoteCorridorOverrides: Record<string, unknown> = {}
) {
  const quote = await createDraftQuote(ownerId)
  const corridor = await createCorridor({})
  await addCorridor(client, ownerToken, quote.id, corridor.id, quoteCorridorOverrides)
  await saveSetupFee(client, ownerToken, quote.id)
  await saveAnnex(client, ownerToken, quote.id)
  return quote
}

const auth = (token: string) => `Bearer ${token}`

test.group('Quote approvals: access and submission blockers', () => {
  test('rejects unauthenticated requests on every endpoint', async ({ client }) => {
    const requests = [
      client.get('/quotes/1/approvals'),
      client.post('/quotes/1/approvals').json({ reason: 'x' }),
      client.post('/quotes/1/approvals/1/decide').json({ action: 'approve' }),
      client.post('/quotes/1/approvals/withdraw'),
    ]
    for (const request of requests) {
      const response = await request
      response.assertStatus(401)
    }
  })

  test("blocks another user's quote, admin can view, 404s an unknown quote", async ({ client }) => {
    const { user: owner, token: ownerToken } = await createUser()
    const { token: otherToken } = await createUser()
    const { token: adminToken } = await createUser({ role: 'admin' })
    const quote = await createDraftQuote(owner.id)

    const forbidden = await client
      .get(`/quotes/${quote.id}/approvals`)
      .header('Authorization', auth(otherToken))
    forbidden.assertStatus(403)

    const asAdmin = await client
      .get(`/quotes/${quote.id}/approvals`)
      .header('Authorization', auth(adminToken))
    asAdmin.assertStatus(200)

    const notFound = await client
      .get('/quotes/999999/approvals')
      .header('Authorization', auth(adminToken))
    notFound.assertStatus(404)

    void ownerToken
  })

  test('submission is blocked without priced corridors, a Setup Fee, or a Fee Annex', async ({
    client,
    assert,
  }) => {
    const { user, token } = await createUser()
    const quote = await createDraftQuote(user.id)

    const noCorridors = await client
      .post(`/quotes/${quote.id}/approvals`)
      .header('Authorization', auth(token))
      .json({ reason: 'Please review' })
    noCorridors.assertStatus(422)
    assert.include(noCorridors.body().errors[0].message, 'no priced corridors')

    const corridor = await createCorridor({})
    await addCorridor(client, token, quote.id, corridor.id)

    const noSetupFee = await client
      .post(`/quotes/${quote.id}/approvals`)
      .header('Authorization', auth(token))
      .json({ reason: 'Please review' })
    noSetupFee.assertStatus(422)
    assert.include(noSetupFee.body().errors[0].message, 'Setup Fee')

    await saveSetupFee(client, token, quote.id)

    const noAnnex = await client
      .post(`/quotes/${quote.id}/approvals`)
      .header('Authorization', auth(token))
      .json({ reason: 'Please review' })
    noAnnex.assertStatus(422)
    assert.include(noAnnex.body().errors[0].message, 'Fee Annex')
  })

  test('requires a non-empty reason and only allows draft/rejected quotes to submit', async ({
    client,
  }) => {
    const { user, token } = await createUser()
    const quote = await makeReadyQuote(client, user.id, token)

    const emptyReason = await client
      .post(`/quotes/${quote.id}/approvals`)
      .header('Authorization', auth(token))
      .json({ reason: '' })
    emptyReason.assertStatus(422)

    await Quote.query().where('id', quote.id).update({ status: 'approved' })
    const notEditable = await client
      .post(`/quotes/${quote.id}/approvals`)
      .header('Authorization', auth(token))
      .json({ reason: 'Please review' })
    notEditable.assertStatus(409)
  })
})

test.group('Quote approvals: submit and route', () => {
  test('auto-approves with honest system attribution when nothing needs approval', async ({
    client,
    assert,
  }) => {
    const { user, token } = await createUser()
    const quote = await makeReadyQuote(client, user.id, token)

    const response = await client
      .post(`/quotes/${quote.id}/approvals`)
      .header('Authorization', auth(token))
      .json({ reason: 'Standard pricing, please close it out' })
    response.assertStatus(201)
    assert.equal(response.body().status, 'approved')
    assert.lengthOf(response.body().approvals, 1)
    assert.equal(response.body().approvals[0].status, 'auto_approved')
    assert.isNull(response.body().approvals[0].decidedByName)

    await quote.refresh()
    assert.equal(quote.status, 'approved')
  })

  test('a financial exception routes to pricing_team only', async ({ client, assert }) => {
    const { user, token } = await createUser()
    const quote = await makeReadyQuote(client, user.id, token)
    // Raise the fee discount past the threshold on the already-added corridor.
    const corridorRow = await quote.related('corridors').query().firstOrFail()
    const update = await client
      .patch(`/quotes/${quote.id}/corridors/${corridorRow.id}`)
      .header('Authorization', auth(token))
      .json({
        yearlyVolumeUsd: 1_000_000,
        yearlyTransactions: 10_000,
        fixedFeeUsd: 0.5,
        variableFeePct: 1,
        appliedFxSpread: 0.5,
        feeDiscountPct: 40,
      })
    update.assertStatus(200)

    const response = await client
      .post(`/quotes/${quote.id}/approvals`)
      .header('Authorization', auth(token))
      .json({ reason: 'Discounted pricing for a strategic partner' })
    response.assertStatus(201)
    assert.equal(response.body().status, 'submitted')
    assert.lengthOf(response.body().approvals, 1)
    assert.equal(response.body().approvals[0].group, 'pricing_team')
    assert.equal(response.body().approvals[0].status, 'pending')
    assert.isTrue(
      response
        .body()
        .approvals[0].snapshotReasons.some((r: { reason: string }) =>
          r.reason.includes('Fee discount')
        )
    )
  })

  test('a network exception routes to network_team only', async ({ client, assert }) => {
    const { user, token } = await createUser()
    const quote = await createDraftQuote(user.id)
    const corridor = await createCorridor({ networkNeedApprovalRaw: 'Yes' })
    await addCorridor(client, token, quote.id, corridor.id)
    await saveSetupFee(client, token, quote.id)
    await saveAnnex(client, token, quote.id)

    const response = await client
      .post(`/quotes/${quote.id}/approvals`)
      .header('Authorization', auth(token))
      .json({ reason: 'Network requires sign-off' })
    response.assertStatus(201)
    assert.lengthOf(response.body().approvals, 1)
    assert.equal(response.body().approvals[0].group, 'network_team')
  })

  test('both a network and a financial exception create two separate rows', async ({
    client,
    assert,
  }) => {
    const { user, token } = await createUser()
    const quote = await createDraftQuote(user.id)
    const corridor = await createCorridor({ networkNeedApprovalRaw: 'Yes' })
    await addCorridor(client, token, quote.id, corridor.id, { feeDiscountPct: 40 })
    await saveSetupFee(client, token, quote.id)
    await saveAnnex(client, token, quote.id)

    const response = await client
      .post(`/quotes/${quote.id}/approvals`)
      .header('Authorization', auth(token))
      .json({ reason: 'Needs both sign-offs' })
    response.assertStatus(201)
    const groups = response
      .body()
      .approvals.map((a: { group: string }) => a.group)
      .sort()
    assert.deepEqual(groups, ['network_team', 'pricing_team'])
  })

  test('a custom payment schedule routes to the owner manager when one exists, else pricing_team', async ({
    client,
    assert,
  }) => {
    const { user: manager, token: managerToken } = await createUser({
      approvalGroup: 'pricing_team',
    })
    const { user: owner, token: ownerToken } = await createUser({ managerId: manager.id })
    const quote = await createDraftQuote(owner.id)
    const corridor = await createCorridor({})
    await addCorridor(client, ownerToken, quote.id, corridor.id)
    await saveSetupFee(client, ownerToken, quote.id, {
      paymentSchedule: 'custom',
      paymentMilestones: [{ milestone: 'Signing', percentage: 100, description: 'On signing' }],
    })
    await saveAnnex(client, ownerToken, quote.id)

    const response = await client
      .post(`/quotes/${quote.id}/approvals`)
      .header('Authorization', auth(ownerToken))
      .json({ reason: 'Non-standard schedule requested' })
    response.assertStatus(201)
    const managerRow = response
      .body()
      .approvals.find((a: { targetUserId: number | null }) => a.targetUserId !== null)
    assert.isDefined(managerRow)
    assert.equal(managerRow.targetUserId, manager.id)

    // A second owner with no manager: the same exception folds into pricing_team.
    const { user: unmanagedOwner, token: unmanagedToken } = await createUser()
    const quote2 = await createDraftQuote(unmanagedOwner.id)
    const corridor2 = await createCorridor({})
    await addCorridor(client, unmanagedToken, quote2.id, corridor2.id)
    await saveSetupFee(client, unmanagedToken, quote2.id, {
      paymentSchedule: 'custom',
      paymentMilestones: [{ milestone: 'Signing', percentage: 100, description: 'On signing' }],
    })
    await saveAnnex(client, unmanagedToken, quote2.id)
    const response2 = await client
      .post(`/quotes/${quote2.id}/approvals`)
      .header('Authorization', auth(unmanagedToken))
      .json({ reason: 'Non-standard schedule requested' })
    response2.assertStatus(201)
    assert.isTrue(
      response2.body().approvals.every((a: { group: string | null }) => a.group === 'pricing_team')
    )

    void managerToken
  })
})

test.group('Quote approvals: decide', () => {
  async function submitWithException(client: ApiClient) {
    const { user, token } = await createUser()
    const quote = await createDraftQuote(user.id)
    const corridor = await createCorridor({})
    await addCorridor(client, token, quote.id, corridor.id, { feeDiscountPct: 40 })
    await saveSetupFee(client, token, quote.id)
    await saveAnnex(client, token, quote.id)
    const submitted = await client
      .post(`/quotes/${quote.id}/approvals`)
      .header('Authorization', auth(token))
      .json({ reason: 'Please review the discount' })
    return {
      owner: user,
      ownerToken: token,
      quote,
      approvalId: submitted.body().approvals[0].id as number,
    }
  }

  test('a matching approval_group member can list a quote they do not own, and an unrelated user still cannot', async ({
    client,
    assert,
  }) => {
    const { quote } = await submitWithException(client)
    const { token: rightGroupToken } = await createUser({ approvalGroup: 'pricing_team' })
    const { token: unrelatedToken } = await createUser({ approvalGroup: 'network_team' })

    const asApprover = await client
      .get(`/quotes/${quote.id}/approvals`)
      .header('Authorization', auth(rightGroupToken))
    asApprover.assertStatus(200)
    assert.lengthOf(asApprover.body().approvals, 1)
    assert.isTrue(asApprover.body().approvals[0].canDecide)

    const asUnrelated = await client
      .get(`/quotes/${quote.id}/approvals`)
      .header('Authorization', auth(unrelatedToken))
    asUnrelated.assertStatus(403)
  })

  test('only an admin or a matching approval_group member can decide; others get 403', async ({
    client,
  }) => {
    const { quote, approvalId } = await submitWithException(client)
    const { token: wrongGroupToken } = await createUser({ approvalGroup: 'network_team' })
    const { token: rightGroupToken } = await createUser({ approvalGroup: 'pricing_team' })

    const forbidden = await client
      .post(`/quotes/${quote.id}/approvals/${approvalId}/decide`)
      .header('Authorization', auth(wrongGroupToken))
      .json({ action: 'approve' })
    forbidden.assertStatus(403)

    const allowed = await client
      .post(`/quotes/${quote.id}/approvals/${approvalId}/decide`)
      .header('Authorization', auth(rightGroupToken))
      .json({ action: 'approve', comment: 'Looks fine' })
    allowed.assertStatus(200)
  })

  test('a pending-status guard blocks deciding an already-decided approval', async ({
    client,
    assert,
  }) => {
    const { quote, approvalId } = await submitWithException(client)
    const { token: approverToken } = await createUser({ approvalGroup: 'pricing_team' })

    const first = await client
      .post(`/quotes/${quote.id}/approvals/${approvalId}/decide`)
      .header('Authorization', auth(approverToken))
      .json({ action: 'approve' })
    first.assertStatus(200)

    const second = await client
      .post(`/quotes/${quote.id}/approvals/${approvalId}/decide`)
      .header('Authorization', auth(approverToken))
      .json({ action: 'approve' })
    second.assertStatus(409)

    const row = await QuoteApproval.findOrFail(approvalId)
    assert.equal(row.status, 'approved')
  })

  test('approving the last pending row moves the quote to approved', async ({ client, assert }) => {
    const { quote, approvalId } = await submitWithException(client)
    const { token: approverToken } = await createUser({ approvalGroup: 'pricing_team' })

    await client
      .post(`/quotes/${quote.id}/approvals/${approvalId}/decide`)
      .header('Authorization', auth(approverToken))
      .json({ action: 'approve' })

    await quote.refresh()
    assert.equal(quote.status, 'approved')
  })

  test('rejecting withdraws every other pending row and rejects the quote', async ({
    client,
    assert,
  }) => {
    const { user, token } = await createUser()
    const quote = await createDraftQuote(user.id)
    const corridor = await createCorridor({ networkNeedApprovalRaw: 'Yes' })
    await addCorridor(client, token, quote.id, corridor.id, { feeDiscountPct: 40 })
    await saveSetupFee(client, token, quote.id)
    await saveAnnex(client, token, quote.id)
    const submitted = await client
      .post(`/quotes/${quote.id}/approvals`)
      .header('Authorization', auth(token))
      .json({ reason: 'Needs both sign-offs' })
    const pricingRow = submitted
      .body()
      .approvals.find((a: { group: string }) => a.group === 'pricing_team')
    const networkRow = submitted
      .body()
      .approvals.find((a: { group: string }) => a.group === 'network_team')

    const { token: pricingApprover } = await createUser({ approvalGroup: 'pricing_team' })
    const rejection = await client
      .post(`/quotes/${quote.id}/approvals/${pricingRow.id}/decide`)
      .header('Authorization', auth(pricingApprover))
      .json({ action: 'reject', comment: 'Discount too steep' })
    rejection.assertStatus(200)

    await quote.refresh()
    assert.equal(quote.status, 'rejected')
    const networkAfter = await QuoteApproval.findOrFail(networkRow.id)
    assert.equal(networkAfter.status, 'withdrawn')
  })
})

test.group('Quote approvals: withdraw and resubmission', () => {
  test('the owner can withdraw a submitted quote back to draft', async ({ client, assert }) => {
    const { user, token } = await createUser()
    const quote = await makeReadyQuote(client, user.id, token, { feeDiscountPct: 40 })
    const corridorRow = await quote.related('corridors').query().firstOrFail()
    await client
      .patch(`/quotes/${quote.id}/corridors/${corridorRow.id}`)
      .header('Authorization', auth(token))
      .json({
        yearlyVolumeUsd: 1_000_000,
        yearlyTransactions: 10_000,
        fixedFeeUsd: 0.5,
        variableFeePct: 1,
        appliedFxSpread: 0.5,
        feeDiscountPct: 40,
      })

    const submit = await client
      .post(`/quotes/${quote.id}/approvals`)
      .header('Authorization', auth(token))
      .json({ reason: 'Please review' })
    submit.assertStatus(201)

    const withdraw = await client
      .post(`/quotes/${quote.id}/approvals/withdraw`)
      .header('Authorization', auth(token))
    withdraw.assertStatus(200)
    assert.equal(withdraw.body().status, 'draft')

    await quote.refresh()
    assert.equal(quote.status, 'draft')
  })

  test('withdrawing is blocked when nothing is outstanding', async ({ client }) => {
    const { user, token } = await createUser()
    const quote = await createDraftQuote(user.id)
    const withdraw = await client
      .post(`/quotes/${quote.id}/approvals/withdraw`)
      .header('Authorization', auth(token))
    withdraw.assertStatus(409)
  })

  test('a rejected quote is editable again so it can be fixed and resubmitted', async ({
    client,
  }) => {
    const { user, token } = await createUser()
    const quote = await createDraftQuote(user.id)
    await Quote.query().where('id', quote.id).update({ status: 'rejected' })

    const corridor = await createCorridor({})
    const response = await addCorridor(client, token, quote.id, corridor.id)
    response.assertStatus(201)
  })
})

test.group('Quote approvals: live-filtered evidence', () => {
  test('a corridor that drops to zero volume after submission disappears from the discrepancy list on read, without mutating the stored row', async ({
    client,
    assert,
  }) => {
    const { user, token } = await createUser()
    const quote = await createDraftQuote(user.id)
    const corridor = await createCorridor({ networkNeedApprovalRaw: 'Yes' })
    const added = await addCorridor(client, token, quote.id, corridor.id)
    const corridorRowId = added.body().id
    await saveSetupFee(client, token, quote.id)
    await saveAnnex(client, token, quote.id)

    const submitted = await client
      .post(`/quotes/${quote.id}/approvals`)
      .header('Authorization', auth(token))
      .json({ reason: 'Network sign-off needed' })
    const approvalId = submitted.body().approvals[0].id

    const before = await client
      .get(`/quotes/${quote.id}/approvals`)
      .header('Authorization', auth(token))
    assert.isAbove(before.body().approvals[0].snapshotReasons.length, 0)

    // Zero the corridor's volume directly (bypassing the draft-only gate, since the
    // quote is now 'submitted' — this simulates what "since gone stale" means).
    const { default: QuoteCorridor } = await import('#models/quote_corridor')
    await QuoteCorridor.query().where('id', corridorRowId).update({ yearly_volume_usd: 0 })

    const after = await client
      .get(`/quotes/${quote.id}/approvals`)
      .header('Authorization', auth(token))
    assert.lengthOf(after.body().approvals[0].snapshotReasons, 0)

    const row = await QuoteApproval.findOrFail(approvalId)
    assert.isAbove(row.snapshotReasons.length, 0)
  })
})
