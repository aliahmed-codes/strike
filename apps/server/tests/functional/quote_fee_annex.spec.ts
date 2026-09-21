import { test } from '@japa/runner'
import { Document, Packer, Paragraph } from 'docx'
import User from '#models/user'
import Currency from '#models/currency'
import Quote from '#models/quote'
import QuoteFeeAnnexVersion from '#models/quote_fee_annex_version'

type Client = import('@japa/api-client').ApiClient

async function createUserWithToken(role: 'admin' | 'sales' | 'viewer' = 'sales') {
  const user = await User.create({
    firstName: 'Ann',
    lastName: 'Editor',
    email: `${Math.random().toString(36).slice(2)}@example.com`,
    password: 'password123',
    role,
  })
  const token = await User.accessTokens.create(user)
  return { user, token: token.value!.release() }
}

async function createReadyQuote(ownerId: number) {
  const usd = await Currency.create({
    isoCode3: 'USD',
    name: 'US Dollar',
    decimalPlaces: 2,
    isSource: true,
    isFunding: true,
    isPayout: true,
    isFee: true,
    isHard: true,
    isPegged: false,
    feeConversionRateToUsd: null,
  })
  const quote = await Quote.create({
    name: 'Acme Corp',
    ownerId,
    status: 'draft',
    contractLengthYears: 3,
    partnerPrCode: 'PR-100',
    fxModel: 'traditional_fx',
    selectedPricingStrategy: 'corridor_pricing',
    defaultFeeCurrencyId: usd.id,
  })
  await quote.related('fundingCurrencies').attach([usd.id])
  await quote.related('sourceCurrencies').attach([usd.id])
  return quote
}

async function saveSetupFee(client: Client, token: string, quoteId: number, quotedPrice = 50_000) {
  const response = await client
    .put(`/quotes/${quoteId}/setup-fee`)
    .header('Authorization', `Bearer ${token}`)
    .json({
      feeType: 'setup',
      quotedPrice,
      paymentSchedule: 'full',
      joiningFeeBillingType: 'at_signing',
      mcfType: 'standard',
      mcfBillingStart: 'at_signing',
      standardCommitmentFee: 100,
      commitmentFeeDiscountPct: 0,
      waivedMonths: 0,
      rebateIncentive: false,
    })
  response.assertStatus(200)
}

const auth = (token: string) => `Bearer ${token}`
const TEMPLATE =
  '<h1>Fee Annex</h1><p>SET-UP FEE: [to be included by pricing]</p><p>Initial paragraph</p>'

async function saveAnnex(
  client: Client,
  token: string,
  quoteId: number,
  body: { name: string; content: string }
) {
  return client.put(`/quotes/${quoteId}/fee-annex`).header('Authorization', auth(token)).json(body)
}

async function expectStatus(
  request: Promise<{ assertStatus(code: number): void }>,
  status: number
) {
  const response = await request
  response.assertStatus(status)
}

test.group('Quote fee annex: access', () => {
  test('rejects unauthenticated requests', async ({ client }) => {
    await expectStatus(client.get('/quotes/1/fee-annex'), 401)
    await expectStatus(client.get('/quotes/1/fee-annex/versions'), 401)
    await expectStatus(client.put('/quotes/1/fee-annex').json({ name: 'a', content: 'b' }), 401)
    await expectStatus(client.post('/quotes/1/fee-annex/fill').json({ content: 'b' }), 401)
    await expectStatus(client.post('/quotes/1/fee-annex/import'), 401)
  })

  test("blocks another user's quote, lets an admin in, and 404s an unknown quote", async ({
    client,
  }) => {
    const { user: owner } = await createUserWithToken()
    const { token: other } = await createUserWithToken()
    const { token: admin } = await createUserWithToken('admin')
    const quote = await createReadyQuote(owner.id)

    await expectStatus(
      client.get(`/quotes/${quote.id}/fee-annex`).header('Authorization', auth(other)),
      403
    )
    await expectStatus(saveAnnex(client, other, quote.id, { name: 'x', content: '<p>x</p>' }), 403)
    await expectStatus(
      client.get(`/quotes/${quote.id}/fee-annex`).header('Authorization', auth(admin)),
      200
    )
    await expectStatus(
      client.get('/quotes/999999/fee-annex').header('Authorization', auth(admin)),
      404
    )
  })

  test('the owner can save the annex of an approved quote', async ({ client, assert }) => {
    const { user, token } = await createUserWithToken()
    const quote = await createReadyQuote(user.id)
    await Quote.query().where('id', quote.id).update({ status: 'approved' })

    const response = await saveAnnex(client, token, quote.id, { name: 'Annex', content: TEMPLATE })
    response.assertStatus(200)
    assert.equal(response.body().annex.version, 1)
  })
})

test.group('Quote fee annex: versions', () => {
  test('starts empty and suggests the old default name', async ({ client, assert }) => {
    const { user, token } = await createUserWithToken()
    const quote = await createReadyQuote(user.id)
    await saveSetupFee(client, token, quote.id)

    const response = await client
      .get(`/quotes/${quote.id}/fee-annex`)
      .header('Authorization', auth(token))
    response.assertStatus(200)
    assert.isNull(response.body().annex)
    assert.isTrue(response.body().hasSetupFee)
    assert.match(response.body().suggestedName, /^Acme_Corp_PR-100_\d{8}_Fee_Annex$/)
  })

  test('saving creates version 1, sanitizes content and the name, and only a change makes a new version', async ({
    client,
    assert,
  }) => {
    const { user, token } = await createUserWithToken()
    const quote = await createReadyQuote(user.id)

    const first = await saveAnnex(client, token, quote.id, {
      name: 'My </title><script>x()</script>Annex',
      content: '<h1>Annex</h1><script>alert(1)</script><p onclick="x()">Text</p>',
    })
    first.assertStatus(200)
    const annex = first.body().annex
    assert.equal(annex.version, 1)
    assert.isTrue(first.body().changed)
    assert.notInclude(annex.content, 'script')
    assert.notInclude(annex.content, 'onclick')
    assert.notInclude(annex.name, '<')
    assert.equal(annex.modifiedByName, 'Ann Editor')

    // The same content and name again is not a new version.
    const same = await saveAnnex(client, token, quote.id, {
      name: annex.name,
      content: annex.content,
    })
    assert.isFalse(same.body().changed)
    assert.equal(same.body().annex.version, 1)

    const edited = await saveAnnex(client, token, quote.id, {
      name: annex.name,
      content: `${annex.content}<p>More</p>`,
    })
    assert.equal(edited.body().annex.version, 2)

    const renamed = await saveAnnex(client, token, quote.id, {
      name: 'Renamed annex',
      content: edited.body().annex.content,
    })
    assert.equal(renamed.body().annex.version, 3)

    const list = await client
      .get(`/quotes/${quote.id}/fee-annex/versions`)
      .header('Authorization', auth(token))
    list.assertStatus(200)
    const versions = list.body().versions
    assert.deepEqual(
      versions.map((v: { version: number }) => v.version),
      [3, 2, 1]
    )
    assert.isUndefined(versions[0].content)
    assert.notInclude(JSON.stringify(versions), '@example.com')
  })

  test('rejects an empty annex and an empty name', async ({ client, assert }) => {
    const { user, token } = await createUserWithToken()
    const quote = await createReadyQuote(user.id)

    const empty = await saveAnnex(client, token, quote.id, {
      name: 'Annex',
      content: '<script>x()</script><p> </p>',
    })
    empty.assertStatus(422)
    assert.equal(empty.body().errors[0].field, 'content')

    const noName = await saveAnnex(client, token, quote.id, { name: '<>', content: '<p>x</p>' })
    noName.assertStatus(422)
    assert.equal(noName.body().errors[0].field, 'name')

    const count = await QuoteFeeAnnexVersion.query().where('quote_id', quote.id)
    assert.lengthOf(count, 0)
  })

  test('the database refuses a duplicate version number for one quote', async ({ assert }) => {
    const { user } = await createUserWithToken()
    const quote = await createReadyQuote(user.id)
    const row = { quoteId: quote.id, version: 1, name: 'a', content: '<p>a</p>' }
    await QuoteFeeAnnexVersion.create(row)
    await assert.rejects(async () => {
      await QuoteFeeAnnexVersion.create(row)
    })
  })
})

test.group('Quote fee annex: fill and staleness', () => {
  test('fill returns the document filled from the quote data', async ({ client, assert }) => {
    const { user, token } = await createUserWithToken()
    const quote = await createReadyQuote(user.id)
    await saveSetupFee(client, token, quote.id, 75_000)

    const response = await client
      .post(`/quotes/${quote.id}/fee-annex/fill`)
      .header('Authorization', auth(token))
      .json({ content: TEMPLATE })
    response.assertStatus(200)
    assert.include(response.body().content, '$75,000')
    assert.notInclude(response.body().content, '[to be included by pricing]')
  })

  test('fill without a Setup Fee leaves the template and explains why', async ({
    client,
    assert,
  }) => {
    const { user, token } = await createUserWithToken()
    const quote = await createReadyQuote(user.id)

    const response = await client
      .post(`/quotes/${quote.id}/fee-annex/fill`)
      .header('Authorization', auth(token))
      .json({ content: TEMPLATE })
    response.assertStatus(200)
    assert.include(response.body().content, '[to be included by pricing]')
    assert.isTrue(response.body().warnings.some((w: string) => w.includes('No Setup Fee')))
  })

  test('a saved annex is fresh until the quote data changes, and a refresh makes it fresh again', async ({
    client,
    assert,
  }) => {
    const { user, token } = await createUserWithToken()
    const quote = await createReadyQuote(user.id)
    await saveSetupFee(client, token, quote.id, 50_000)

    const filled = await client
      .post(`/quotes/${quote.id}/fee-annex/fill`)
      .header('Authorization', auth(token))
      .json({ content: TEMPLATE })
    const saved = await saveAnnex(client, token, quote.id, {
      name: 'Annex',
      content: filled.body().content,
    })
    assert.isFalse(saved.body().annex.isStale)

    await saveSetupFee(client, token, quote.id, 90_000)
    const stale = await client
      .get(`/quotes/${quote.id}/fee-annex`)
      .header('Authorization', auth(token))
    assert.isTrue(stale.body().annex.isStale)

    const refreshed = await client
      .post(`/quotes/${quote.id}/fee-annex/fill`)
      .header('Authorization', auth(token))
      .json({ content: stale.body().annex.content })
    assert.include(refreshed.body().content, '$90,000')
    const resaved = await saveAnnex(client, token, quote.id, {
      name: 'Annex',
      content: refreshed.body().content,
    })
    assert.equal(resaved.body().annex.version, 2)
    assert.isFalse(resaved.body().annex.isStale)
  })
})

test.group('Quote fee annex: import', () => {
  test('imports an html file, sanitized and filled, without saving it', async ({
    client,
    assert,
  }) => {
    const { user, token } = await createUserWithToken()
    const quote = await createReadyQuote(user.id)
    await saveSetupFee(client, token, quote.id, 60_000)

    const response = await client
      .post(`/quotes/${quote.id}/fee-annex/import`)
      .header('Authorization', auth(token))
      .file('file', Buffer.from(`${TEMPLATE}<script>alert(1)</script>`), { filename: 'annex.html' })
    response.assertStatus(200)
    assert.include(response.body().content, '$60,000')
    assert.notInclude(response.body().content, 'script')
    assert.equal(response.body().fileName, 'annex.html')
    assert.lengthOf(await QuoteFeeAnnexVersion.query().where('quote_id', quote.id), 0)
  })

  test('imports a real .docx through mammoth and fills it', async ({ client, assert }) => {
    const { user, token } = await createUserWithToken()
    const quote = await createReadyQuote(user.id)
    await saveSetupFee(client, token, quote.id, 42_000)
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph('Fee Annex'),
            new Paragraph('SET-UP FEE: [to be included by pricing]'),
          ],
        },
      ],
    })
    const buffer = await Packer.toBuffer(doc)

    const response = await client
      .post(`/quotes/${quote.id}/fee-annex/import`)
      .header('Authorization', auth(token))
      .file('file', buffer, { filename: 'Template.DOCX' })
    response.assertStatus(200)
    assert.include(response.body().content, 'Fee Annex')
    assert.include(response.body().content, '$42,000')
  })

  test('rejects a pdf, a missing file, a broken docx and an empty document', async ({
    client,
    assert,
  }) => {
    const { user, token } = await createUserWithToken()
    const quote = await createReadyQuote(user.id)
    const post = () =>
      client.post(`/quotes/${quote.id}/fee-annex/import`).header('Authorization', auth(token))

    const pdf = await post().file('file', Buffer.from('%PDF-1.4'), { filename: 'a.pdf' })
    pdf.assertStatus(422)
    assert.equal(pdf.body().errors[0].field, 'file')

    const none = await post()
    none.assertStatus(422)

    const broken = await post().file('file', Buffer.from('not a zip'), { filename: 'a.docx' })
    broken.assertStatus(422)
    assert.include(broken.body().errors[0].message, "couldn't be read")

    const empty = await post().file('file', Buffer.from('<script>x()</script>'), {
      filename: 'a.html',
    })
    empty.assertStatus(422)
  })
})
