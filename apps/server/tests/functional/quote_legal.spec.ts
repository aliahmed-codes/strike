import { test } from '@japa/runner'
import { ApiRequest } from '@japa/api-client'
import ExcelJS from 'exceljs'
import User from '#models/user'
import Region from '#models/region'
import Country from '#models/country'
import Currency from '#models/currency'
import Corridor from '#models/corridor'
import Quote from '#models/quote'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

ApiRequest.addParser(XLSX_MIME, (res, callback) => {
  const chunks: Buffer[] = []
  res.on('data', (chunk: Buffer) => chunks.push(chunk))
  res.on('end', () => callback(null, Buffer.concat(chunks)))
})

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

async function createCurrency(isoCode3: string, feeConversionRateToUsd: number | null = null) {
  return Currency.create({
    isoCode3,
    name: `Currency ${isoCode3}`,
    decimalPlaces: 2,
    isSource: true,
    isFunding: true,
    isPayout: true,
    isFee: true,
    isHard: true,
    isPegged: false,
    feeConversionRateToUsd,
  })
}

async function createCorridor(code: string, countryName: string) {
  const region = await Region.create({ code: `R${code}`, name: `Region ${code}` })
  const country = await Country.create({
    isoCode3: code.padEnd(3, 'X'),
    name: countryName,
    regionId: region.id,
  })
  const payout = await createCurrency(`${code}P`.slice(0, 3).padEnd(3, 'Q'))
  return Corridor.create({
    countryId: country.id,
    serviceCode: 'bank_account',
    transactionTypeCode: 'b2c',
    payerCode: `payer_${code}`,
    receivingPartner: 'test_partner',
    payoutCurrencyId: payout.id,
    fxSource: 'Cost Plus',
    treasuryFxCostSpread: 0,
    costFixedUsd: 0,
    costVariablePct: 0,
    networkNeedApprovalRaw: 'No',
    internalRaw: 'None',
    centralBankRaw: 'None',
  })
}

/** A quote with every field the contract needs, so each test only changes what it is about. */
async function createReadyQuote(
  ownerId: number,
  overrides: Record<string, unknown> = {},
  feeCurrency?: Currency
) {
  const usd = feeCurrency ?? (await createCurrency('USD'))
  const quote = await Quote.create({
    name: 'Acme Corp',
    ownerId,
    status: 'draft',
    contractLengthYears: 3,
    partnerPrCode: 'PR-100',
    fxModel: 'traditional_fx',
    selectedPricingStrategy: 'corridor_pricing',
    defaultFeeCurrencyId: usd.id,
    showFxSpreadInContract: true,
    showFxSourceInContract: true,
    ...overrides,
  })
  await quote.related('fundingCurrencies').attach([usd.id])
  await quote.related('sourceCurrencies').attach([usd.id])
  return { quote, usd }
}

function setupFeePayload(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  }
}

type Client = import('@japa/api-client').ApiClient

async function saveSetupFee(
  client: Client,
  token: string,
  quoteId: number,
  overrides: Record<string, unknown> = {}
) {
  const response = await client
    .put(`/quotes/${quoteId}/setup-fee`)
    .header('Authorization', `Bearer ${token}`)
    .json(setupFeePayload(overrides))
  response.assertStatus(200)
}

async function addCorridor(
  client: Client,
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

async function expectStatus(
  request: Promise<{ assertStatus(code: number): void }>,
  status: number
) {
  const response = await request
  response.assertStatus(status)
}

async function getLegalBody(client: Client, token: string, quoteId: number) {
  const response = await client
    .get(`/quotes/${quoteId}/legal`)
    .header('Authorization', `Bearer ${token}`)
  return response.body()
}

async function getLegal(client: Client, token: string, quoteId: number) {
  return client.get(`/quotes/${quoteId}/legal`).header('Authorization', `Bearer ${token}`)
}

async function downloadSheet(client: Client, token: string, quoteId: number) {
  const response = await client
    .get(`/quotes/${quoteId}/documents/legal-contract`)
    .header('Authorization', `Bearer ${token}`)
  response.assertStatus(200)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(response.body() as unknown as ExcelJS.Buffer)
  return { response, sheet: workbook.getWorksheet('Quotation')! }
}

/** The value beside a label in the left summary block (label in column B, value in C). */
function termValue(sheet: ExcelJS.Worksheet, label: string) {
  for (let r = 1; r <= sheet.rowCount; r += 1) {
    if (sheet.getCell(r, 2).value === label) return sheet.getCell(r, 3).value
  }
  return undefined
}

function findRow(sheet: ExcelJS.Worksheet, column: number, text: string) {
  for (let r = 1; r <= sheet.rowCount; r += 1) {
    if (sheet.getCell(r, column).value === text) return r
  }
  return undefined
}

function headerRow(sheet: ExcelJS.Worksheet) {
  return findRow(sheet, 1, 'Country')!
}

function headers(sheet: ExcelJS.Worksheet) {
  const row = headerRow(sheet)
  const out: string[] = []
  for (let c = 1; c <= 16; c += 1) {
    const value = sheet.getCell(row, c).value
    if (value) out.push(String(value))
  }
  return out
}

test.group('Quote Legal', () => {
  test('rejects unauthenticated requests', async ({ client }) => {
    await expectStatus(client.get('/quotes/1/legal'), 401)
    await expectStatus(client.get('/quotes/1/documents/legal-contract'), 401)
  })

  test("returns 403 for another user's quote and lets an admin in", async ({ client }) => {
    const { user: owner } = await createUserWithToken()
    const { token: other } = await createUserWithToken()
    const { token: admin } = await createUserWithToken('admin')
    const { quote } = await createReadyQuote(owner.id)

    await expectStatus(getLegal(client, other, quote.id), 403)
    await expectStatus(
      client
        .get(`/quotes/${quote.id}/documents/legal-contract`)
        .header('Authorization', `Bearer ${other}`),
      403
    )
    await expectStatus(getLegal(client, admin, quote.id), 200)
  })

  test('returns 404 for an unknown quote', async ({ client }) => {
    const { token } = await createUserWithToken()
    await expectStatus(getLegal(client, token, 999_999), 404)
  })

  test('lists a blocker for everything the contract cannot invent', async ({ client, assert }) => {
    const { user, token } = await createUserWithToken()
    const quote = await Quote.create({ name: 'Bare', ownerId: user.id, status: 'draft' })

    const response = await getLegal(client, token, quote.id)
    response.assertStatus(200)
    const blockers: string[] = response.body().blockers
    for (const fragment of [
      'Contract length',
      'Fee currency',
      'Funding currency',
      'Source currency',
      'FX model',
      'Pricing strategy',
      'Setup Fee',
      'priced corridors',
    ]) {
      assert.isTrue(
        blockers.some((b) => b.includes(fragment)),
        `expected a blocker mentioning "${fragment}"`
      )
    }

    const download = await client
      .get(`/quotes/${quote.id}/documents/legal-contract`)
      .header('Authorization', `Bearer ${token}`)
    download.assertStatus(422)
    assert.deepEqual(download.body().blockers, blockers)
  })

  test('a complete quote has no blockers and exposes the review data', async ({
    client,
    assert,
  }) => {
    const { user, token } = await createUserWithToken()
    const { quote } = await createReadyQuote(user.id)
    const corridor = await createCorridor('AA', 'Argentina')
    await addCorridor(client, token, quote.id, corridor.id)
    await saveSetupFee(client, token, quote.id)

    const body = await getLegalBody(client, token, quote.id)
    assert.deepEqual(body.blockers, [])
    assert.equal(body.feeCurrency, 'USD')
    assert.deepEqual(body.fundingCurrencies, ['USD'])
    assert.equal(body.pricingModel, 'Corridor Pricing')
    assert.equal(body.fxModel, 'Traditional FX')
    assert.equal(body.contractYears, 3)
    assert.deepEqual(body.oneOffFee, { feeType: 'setup', label: 'Set Up Fee', amount: 50_000 })
    assert.equal(body.corridorCount, 1)
    assert.equal(body.countryCount, 1)
    assert.deepEqual(body.services, ['bank_account'])
    assert.isFalse(body.isApproved)
  })

  test('only saved, non-deleted, positive-volume corridors are included', async ({
    client,
    assert,
  }) => {
    const { user, token } = await createUserWithToken()
    const { quote } = await createReadyQuote(user.id)
    const kept = await createCorridor('BB', 'Brazil')
    const zero = await createCorridor('CC', 'Chile')
    const removed = await createCorridor('DD', 'Denmark')
    await saveSetupFee(client, token, quote.id)
    await addCorridor(client, token, quote.id, kept.id)
    await addCorridor(client, token, quote.id, zero.id, { yearlyVolumeUsd: 0 })
    const deleted = await addCorridor(client, token, quote.id, removed.id)

    await client
      .delete(`/quotes/${quote.id}/corridors/${deleted.body().id}`)
      .header('Authorization', `Bearer ${token}`)
    let body = await getLegalBody(client, token, quote.id)
    assert.deepEqual(
      body.corridorRows.map((r: { country: string }) => r.country),
      ['Brazil']
    )

    await client
      .post(`/quotes/${quote.id}/corridors/bulk-restore`)
      .header('Authorization', `Bearer ${token}`)
      .json({ corridorIds: [deleted.body().id] })
    body = await getLegalBody(client, token, quote.id)
    assert.deepEqual(
      body.corridorRows.map((r: { country: string }) => r.country),
      ['Brazil', 'Denmark']
    )
  })

  test('corridor rows are sorted by country name', async ({ client, assert }) => {
    const { user, token } = await createUserWithToken()
    const { quote } = await createReadyQuote(user.id)
    await saveSetupFee(client, token, quote.id)
    for (const [code, name] of [
      ['ZA', 'Zambia'],
      ['AB', 'Albania'],
      ['MC', 'Mexico'],
    ]) {
      const corridor = await createCorridor(code, name)
      await addCorridor(client, token, quote.id, corridor.id)
    }

    const body = await getLegalBody(client, token, quote.id)
    assert.deepEqual(
      body.corridorRows.map((r: { country: string }) => r.country),
      ['Albania', 'Mexico', 'Zambia']
    )
  })

  test('fixed fees convert into the fee currency and a missing rate is a blocker, never 1:1', async ({
    client,
    assert,
  }) => {
    const { user, token } = await createUserWithToken()
    const eur = await createCurrency('EUR', 0.9)
    const { quote } = await createReadyQuote(user.id, {}, eur)
    const corridor = await createCorridor('EE', 'Estonia')
    await saveSetupFee(client, token, quote.id)
    await addCorridor(client, token, quote.id, corridor.id, { fixedFeeUsd: 2 })

    let body = await getLegalBody(client, token, quote.id)
    assert.deepEqual(body.blockers, [])
    assert.equal(body.corridorRows[0].feeCurrency, 'EUR')
    assert.equal(body.corridorRows[0].fixedFee, 1.8)

    await Currency.query().where('id', eur.id).update({ fee_conversion_rate_to_usd: null })
    body = await getLegalBody(client, token, quote.id)
    assert.isTrue(body.blockers.some((b: string) => b.includes('No conversion rate')))
    const download = await client
      .get(`/quotes/${quote.id}/documents/legal-contract`)
      .header('Authorization', `Bearer ${token}`)
    download.assertStatus(422)
  })

  test('FX spread and source follow the quote flags, in the data and in the sheet', async ({
    client,
    assert,
  }) => {
    const { user, token } = await createUserWithToken()
    const { quote } = await createReadyQuote(user.id, {
      showFxSpreadInContract: false,
      showFxSourceInContract: false,
    })
    const corridor = await createCorridor('FF', 'Finland')
    await saveSetupFee(client, token, quote.id)
    await addCorridor(client, token, quote.id, corridor.id)

    let body = await getLegalBody(client, token, quote.id)
    assert.isNull(body.corridorRows[0].fxSpreadPct)
    assert.isNull(body.corridorRows[0].fxSource)
    let { sheet } = await downloadSheet(client, token, quote.id)
    assert.notInclude(headers(sheet), 'FX Spread')
    assert.notInclude(headers(sheet), 'Fx Source')

    await Quote.query().where('id', quote.id).update({
      show_fx_spread_in_contract: true,
      show_fx_source_in_contract: true,
    })
    body = await getLegalBody(client, token, quote.id)
    assert.equal(body.corridorRows[0].fxSpreadPct, 0.5)
    assert.equal(body.corridorRows[0].fxSource, 'Cost Plus')
    ;({ sheet } = await downloadSheet(client, token, quote.id))
    assert.include(headers(sheet), 'FX Spread')
    assert.include(headers(sheet), 'Fx Source')
  })

  test('a tiered corridor lists one row per tier under a Tier column', async ({
    client,
    assert,
  }) => {
    const { user, token } = await createUserWithToken()
    const { quote } = await createReadyQuote(user.id)
    const corridor = await createCorridor('GG', 'Germany')
    await saveSetupFee(client, token, quote.id)
    await addCorridor(client, token, quote.id, corridor.id, {
      pricingModel: 'tiered',
      tiers: [
        {
          tierNumber: 1,
          yearlyVolumeUsd: 400_000,
          fixedFeeUsd: 0.4,
          variableFeePct: 0.4,
          appliedFxSpread: 0.4,
        },
        {
          tierNumber: 2,
          yearlyVolumeUsd: 300_000,
          fixedFeeUsd: 0.3,
          variableFeePct: 0.3,
          appliedFxSpread: 0.3,
        },
      ],
    })

    const body = await getLegalBody(client, token, quote.id)
    assert.isTrue(body.hasTiers)
    assert.equal(body.corridorCount, 1)
    assert.deepEqual(
      body.corridorRows.map((r: { tier: number }) => r.tier),
      [1, 2]
    )
    assert.equal(body.corridorRows[1].fixedFee, 0.3)
    const { sheet } = await downloadSheet(client, token, quote.id)
    assert.include(headers(sheet), 'Tier')
  })

  test('a corridor priced under two funding currencies gets a Funding Currency column', async ({
    client,
    assert,
  }) => {
    const { user, token } = await createUserWithToken()
    const { quote, usd } = await createReadyQuote(user.id)
    const gbp = await createCurrency('GBP', 0.8)
    const corridor = await createCorridor('HH', 'Hungary')
    await saveSetupFee(client, token, quote.id)
    await addCorridor(client, token, quote.id, corridor.id, { fundingCurrencyId: usd.id })
    await addCorridor(client, token, quote.id, corridor.id, { fundingCurrencyId: gbp.id })

    const body = await getLegalBody(client, token, quote.id)
    assert.isTrue(body.hasMultipleFundingCurrencies)
    assert.deepEqual(
      body.corridorRows.map((r: { fundingCurrency: string }) => r.fundingCurrency),
      ['GBP', 'USD']
    )
    const { sheet } = await downloadSheet(client, token, quote.id)
    assert.include(headers(sheet), 'Funding Currency')
  })

  test('a fee discount adds a Fee Discount column only when one is used', async ({
    client,
    assert,
  }) => {
    const { user, token } = await createUserWithToken()
    const { quote } = await createReadyQuote(user.id)
    const plain = await createCorridor('II', 'Iceland')
    await saveSetupFee(client, token, quote.id)
    await addCorridor(client, token, quote.id, plain.id)

    let { sheet } = await downloadSheet(client, token, quote.id)
    assert.notInclude(headers(sheet), 'Fee Discount')

    const discounted = await createCorridor('JJ', 'Japan')
    await addCorridor(client, token, quote.id, discounted.id, { feeDiscountPct: 10 })
    ;({ sheet } = await downloadSheet(client, token, quote.id))
    assert.include(headers(sheet), 'Fee Discount')
  })

  test('the download is an xlsx with the old sheet layout, filename and DRAFT marker', async ({
    client,
    assert,
  }) => {
    const { user, token } = await createUserWithToken()
    const { quote } = await createReadyQuote(user.id, { name: 'Acme / Corp' })
    const corridor = await createCorridor('KK', 'Kenya')
    await saveSetupFee(client, token, quote.id, { feeType: 'network', quotedPrice: 12_345 })
    await addCorridor(client, token, quote.id, corridor.id, {
      fixedFeeUsd: 1.5,
      variableFeePct: 2,
      appliedFxSpread: 0.75,
    })

    const { response, sheet } = await downloadSheet(client, token, quote.id)
    assert.equal(response.header('content-type'), XLSX_MIME)
    assert.include(
      response.header('content-disposition'),
      'Legal Contract - PR-100 - Acme - Corp.xlsx'
    )

    assert.equal(sheet.getCell('A1').value, 'Legal Summary')
    assert.include(String(sheet.getCell('A3').value), 'DRAFT')
    assert.equal(termValue(sheet, 'Pricing Model'), 'Corridor Pricing')
    assert.equal(termValue(sheet, 'FX Model'), 'Traditional FX')
    assert.equal(termValue(sheet, 'Fee Currency'), 'USD')
    assert.equal(termValue(sheet, 'Funding Currency'), 'USD')
    assert.equal(termValue(sheet, 'Source Currency'), 'USD')
    assert.equal(termValue(sheet, 'Fee Settlement Balance'), 'USD')
    assert.equal(termValue(sheet, 'Contract Duration (years)'), 3)
    assert.equal(termValue(sheet, 'Network Joining Fee'), 12_345)
    assert.isUndefined(termValue(sheet, 'Set-Up Fee'))
    assert.equal(termValue(sheet, 'Commitment Fee Type'), 'Fee Revenue Based')
    assert.equal(termValue(sheet, 'Minimum Monthly Commitment Fee'), 100)
    assert.equal(termValue(sheet, 'Payment Schedule'), 'On Contract Signature - 100%')
    assert.equal(termValue(sheet, 'MCF Billing Start'), 'At Contract Signing')

    const row = headerRow(sheet) + 1
    assert.deepEqual(headers(sheet), [
      'Country',
      'Service',
      'Vertical',
      'Payout Currency',
      'Payer',
      'Fee currency',
      'Fixed Fee',
      'Variable Fee',
      'FX Spread',
      'Fx Source',
    ])
    assert.equal(sheet.getCell(row, 1).value, 'Kenya')
    assert.equal(sheet.getCell(row, 7).value, 1.5)
    assert.equal(sheet.getCell(row, 8).value, 0.02)
    assert.equal(sheet.getCell(row, 9).value, 0.0075)
    assert.equal(sheet.getCell(row, 10).value, 'Cost Plus')
  })

  test('an approved quote drops the DRAFT marker and a set-up fee uses its own label', async ({
    client,
    assert,
  }) => {
    const { user, token } = await createUserWithToken()
    const { quote } = await createReadyQuote(user.id)
    const corridor = await createCorridor('LL', 'Latvia')
    await saveSetupFee(client, token, quote.id)
    await addCorridor(client, token, quote.id, corridor.id)
    await Quote.query().where('id', quote.id).update({ status: 'approved' })

    const { sheet } = await downloadSheet(client, token, quote.id)
    assert.notInclude(String(sheet.getCell('A3').value ?? ''), 'DRAFT')
    assert.equal(termValue(sheet, 'Set-Up Fee'), 50_000)
    assert.isUndefined(termValue(sheet, 'Network Joining Fee'))
  })

  test('a zero one-off fee is left out of the sheet', async ({ client, assert }) => {
    const { user, token } = await createUserWithToken()
    const { quote } = await createReadyQuote(user.id)
    const corridor = await createCorridor('MM', 'Malta')
    await saveSetupFee(client, token, quote.id, { quotedPrice: 0 })
    await addCorridor(client, token, quote.id, corridor.id)

    const { sheet } = await downloadSheet(client, token, quote.id)
    assert.isUndefined(termValue(sheet, 'Set-Up Fee'))
  })

  test('block commitment fees print one row per block and waived months show a dash', async ({
    client,
    assert,
  }) => {
    const { user, token } = await createUserWithToken()
    const { quote } = await createReadyQuote(user.id)
    const corridor = await createCorridor('NN', 'Norway')
    await saveSetupFee(client, token, quote.id, {
      waivedMonths: 2,
      mcfBlockFees: [
        { blockKey: 'y1_h1', commitmentFee: 100 },
        { blockKey: 'y1_h2', commitmentFee: 150 },
        { blockKey: 'y2', commitmentFee: 200 },
        { blockKey: 'y3', commitmentFee: 300 },
      ],
    })
    await addCorridor(client, token, quote.id, corridor.id)

    const { sheet } = await downloadSheet(client, token, quote.id)
    assert.isUndefined(termValue(sheet, 'Minimum Monthly Commitment Fee'))
    assert.equal(termValue(sheet, 'Months 1-6'), 100)
    assert.equal(termValue(sheet, 'Months 7-12'), 150)
    assert.equal(termValue(sheet, 'Months 13-24'), 200)
    assert.equal(termValue(sheet, 'Months 25-36'), 300)

    // Month table: Year 1 in E/F, months 1-2 waived, month 3 charged.
    const yearRow = findRow(sheet, 5, 'Year 1')!
    assert.equal(sheet.getCell(yearRow + 2, 6).value, '-')
    assert.equal(sheet.getCell(yearRow + 3, 6).value, '-')
    assert.equal(sheet.getCell(yearRow + 4, 6).value, 100)
    assert.equal(sheet.getCell(yearRow + 2, 8).value, 200)
    assert.equal(sheet.getCell(yearRow + 2, 10).value, 300)
  })

  test('a principal-based commitment prints principal at rate and still fills the month table', async ({
    client,
    assert,
  }) => {
    const { user, token } = await createUserWithToken()
    const { quote } = await createReadyQuote(user.id, { contractLengthYears: 1 })
    const corridor = await createCorridor('OO', 'Oman')
    await saveSetupFee(client, token, quote.id, {
      mcfType: 'principal',
      mcfPrincipalSlots: [
        {
          slotIndex: 0,
          label: 'Months 1-6',
          startMonth: 1,
          endMonth: 6,
          monthlyPrincipal: 100_000,
          ratePct: 1,
        },
        {
          slotIndex: 1,
          label: 'Months 7-12',
          startMonth: 7,
          endMonth: 12,
          monthlyPrincipal: 200_000,
          ratePct: 2,
        },
      ],
    })
    await addCorridor(client, token, quote.id, corridor.id)

    const { sheet } = await downloadSheet(client, token, quote.id)
    assert.equal(termValue(sheet, 'Commitment Fee Type'), 'Volume / Principal Based')
    assert.equal(termValue(sheet, 'Months 1-6'), '100,000 at 1%')
    assert.equal(termValue(sheet, 'Months 7-12'), '200,000 at 2%')
    const yearRow = findRow(sheet, 5, 'Year 1')!
    assert.equal(sheet.getCell(yearRow + 2, 6).value, 1000)
    assert.equal(sheet.getCell(yearRow + 8, 6).value, 4000)
  })

  test('every contract year gets a month table, stacking extra bands for long contracts', async ({
    client,
    assert,
  }) => {
    const { user, token } = await createUserWithToken()
    const { quote } = await createReadyQuote(user.id, { contractLengthYears: 6 })
    const corridor = await createCorridor('PP', 'Peru')
    await saveSetupFee(client, token, quote.id, {
      mcfBlockFees: [
        { blockKey: 'y1_h1', commitmentFee: 100 },
        { blockKey: 'y1_h2', commitmentFee: 100 },
        { blockKey: 'y5', commitmentFee: 500 },
        { blockKey: 'y6', commitmentFee: 600 },
      ],
    })
    await addCorridor(client, token, quote.id, corridor.id)

    const { sheet } = await downloadSheet(client, token, quote.id)
    for (let year = 1; year <= 6; year += 1) {
      assert.isDefined(
        findRow(sheet, year <= 4 ? 3 + year * 2 : 3 + (year - 4) * 2, `Year ${year}`)
      )
    }
    const fifth = findRow(sheet, 5, 'Year 5')!
    assert.isAbove(fifth, findRow(sheet, 5, 'Year 1')!)
    assert.equal(sheet.getCell(fifth + 2, 6).value, 500)
    assert.equal(sheet.getCell(findRow(sheet, 7, 'Year 6')!, 7).value, 'Year 6')
  })

  test('payment milestones, billing terms and rebate print only when they apply', async ({
    client,
    assert,
  }) => {
    const { user, token } = await createUserWithToken()
    const { quote } = await createReadyQuote(user.id)
    const corridor = await createCorridor('QQ', 'Qatar')
    await addCorridor(client, token, quote.id, corridor.id)
    await saveSetupFee(client, token, quote.id, {
      quotedPrice: 100_000,
      paymentSchedule: 'custom',
      joiningFeeBillingType: 'non_standard',
      mcfBillingStart: 'at_go_live',
      rebateIncentive: true,
      rebateType: 'volume',
      paymentMilestones: [
        { milestone: 'Signature', percentage: 60 },
        { milestone: 'Go-live', percentage: 40 },
      ],
    })

    const { sheet } = await downloadSheet(client, token, quote.id)
    assert.equal(termValue(sheet, 'Payment Schedule'), 'Custom')
    assert.equal(termValue(sheet, 'Payment Milestones'), 'Signature: 60%; Go-live: 40%')
    assert.equal(termValue(sheet, 'Joining Fee Billing Type'), 'Non-Standard Terms')
    assert.equal(termValue(sheet, 'MCF Billing Start'), 'At Go-Live')
    assert.equal(termValue(sheet, 'Rebate Incentive'), 'Yes')
    assert.equal(termValue(sheet, 'Rebate Type'), 'Volume Amount Based')

    await saveSetupFee(client, token, quote.id, { quotedPrice: 100_000, paymentSchedule: 'full' })
    const after = await downloadSheet(client, token, quote.id)
    assert.isUndefined(termValue(after.sheet, 'Payment Milestones'))
    assert.isUndefined(termValue(after.sheet, 'Joining Fee Billing Type'))
    assert.isUndefined(termValue(after.sheet, 'Rebate Incentive'))
  })

  test('other line items drop zeros, show percentages as percentages and add the treasury currency', async ({
    client,
    assert,
  }) => {
    const { user, token } = await createUserWithToken()
    const { quote, usd } = await createReadyQuote(user.id)
    const corridor = await createCorridor('RR', 'Romania')
    await addCorridor(client, token, quote.id, corridor.id)
    await saveSetupFee(client, token, quote.id, {
      otherFees: [
        { conceptCode: 'reversal_request', amount: 10, isPercentage: false },
        { conceptCode: 'proof_of_payment', amount: 0, isPercentage: false },
        { conceptCode: 'emergency_funding', amount: 0.3, isPercentage: true },
        { conceptCode: 'treasury_management', amount: 0.1, isPercentage: true, currencyId: usd.id },
      ],
    })

    const body = await getLegalBody(client, token, quote.id)
    assert.deepEqual(
      body.otherLineItems.map((i: { label: string }) => i.label),
      [
        'Service Request Fee (Reversal Request)',
        'Emergency Funding Fee',
        'Treasury Management Fee',
        'Treasury Management Fee Currency',
      ]
    )

    const { sheet } = await downloadSheet(client, token, quote.id)
    assert.equal(sheet.getCell('N7').value, 'Other pricing line items')
    assert.equal(sheet.getCell('O7').value, 'Price (USD)')
    assert.equal(sheet.getCell('N8').value, 'Service Request Fee (Reversal Request)')
    assert.equal(sheet.getCell('O8').value, 10)
    assert.equal(sheet.getCell('O9').value, 0.003)
    assert.equal(sheet.getCell('O9').numFmt, '0.##%')
    assert.equal(sheet.getCell('O11').value, 'USD')
  })
})
