import { test } from '@japa/runner'
import * as cheerio from 'cheerio'
import type { QuoteLegalData } from '@strike/shared'
import { fillAnnexHtml, isAnnexStale } from '#services/annex_fill_service'
import { sanitizeAnnexHtml } from '#services/annex_html_sanitizer'

function baseData(overrides: Partial<QuoteLegalData> = {}): QuoteLegalData {
  const monthlyFees = Array.from({ length: 36 }, (_, i) =>
    i < 6 ? 100 : i < 12 ? 150 : i < 24 ? 200 : 300
  )
  return {
    status: 'draft',
    isApproved: false,
    blockers: [],
    quoteName: 'Acme Corp',
    prCode: 'PR-1',
    contractYears: 3,
    pricingModel: 'Corridor Pricing',
    fxModel: 'Traditional FX',
    feeCurrency: 'USD',
    fundingCurrencies: ['USD'],
    sourceCurrencies: ['USD'],
    oneOffFee: { feeType: 'setup', label: 'Set Up Fee', amount: 50_000 },
    otherLineItems: [],
    otherFees: {
      reversal_request: { amount: 10, isPercentage: false, currencyCode: null },
      proof_of_payment: { amount: 20, isPercentage: false, currencyCode: null },
      emergency_funding: { amount: 0.3, isPercentage: true, currencyCode: null },
      treasury_management: { amount: 0.1, isPercentage: true, currencyCode: null },
      business_hub_platform: { amount: 500, isPercentage: false, currencyCode: null },
      post_funding_penalty: { amount: 0, isPercentage: true, currencyCode: null },
      corridor_no_usage: { amount: 200, isPercentage: false, currencyCode: null },
      white_glove: { amount: 0, isPercentage: false, currencyCode: null },
      stablecoin_prefunding: { amount: 0, isPercentage: false, currencyCode: null },
      digital_asset_icp_setup: { amount: 0, isPercentage: false, currencyCode: null },
      bulk_currency_conversion: { amount: 200, isPercentage: false, currencyCode: null },
    },
    showFxSpread: true,
    showFxSource: true,
    corridorRows: [
      {
        country: 'Argentina',
        countryCode: 'ARG',
        service: 'BankAccount',
        transactionType: 'B2C',
        payoutCurrency: 'ARS',
        payer: 'All Banks',
        fundingCurrency: null,
        tier: null,
        yearlyVolumeUsd: 1_000_000,
        feeCurrency: 'USD',
        fixedFee: 1.5,
        variableFeePct: 2,
        feeDiscountPct: 0,
        fxSpreadPct: 0.75,
        fxSource: 'Cost Plus',
      },
    ],
    corridorCount: 1,
    countryCount: 1,
    services: ['BankAccount'],
    hasTiers: false,
    hasMultipleFundingCurrencies: false,
    hasFeeDiscount: false,
    commitment: {
      type: 'standard',
      typeLabel: 'Fee Revenue Based',
      blocks: [
        {
          label: 'Months 1-6',
          startMonth: 1,
          endMonth: 6,
          commitmentFee: 100,
          monthlyPrincipal: null,
          ratePct: null,
        },
        {
          label: 'Months 7-12',
          startMonth: 7,
          endMonth: 12,
          commitmentFee: 150,
          monthlyPrincipal: null,
          ratePct: null,
        },
        {
          label: 'Months 13-24',
          startMonth: 13,
          endMonth: 24,
          commitmentFee: 200,
          monthlyPrincipal: null,
          ratePct: null,
        },
        {
          label: 'Months 25-36',
          startMonth: 25,
          endMonth: 36,
          commitmentFee: 300,
          monthlyPrincipal: null,
          ratePct: null,
        },
      ],
      uniform: false,
      waivedMonths: 2,
      monthlyFees,
    },
    payment: null,
    ...overrides,
  }
}

const principalCommitment = (): NonNullable<QuoteLegalData['commitment']> => ({
  type: 'principal',
  typeLabel: 'Volume / Principal Based',
  blocks: [
    {
      label: 'Months 1-6',
      startMonth: 1,
      endMonth: 6,
      commitmentFee: null,
      monthlyPrincipal: 1_000_000,
      ratePct: 0.15,
    },
    {
      label: 'Months 7-12',
      startMonth: 7,
      endMonth: 12,
      commitmentFee: null,
      monthlyPrincipal: 2_000_000,
      ratePct: 0.2,
    },
    {
      label: 'Month 13 onwards',
      startMonth: 13,
      endMonth: null,
      commitmentFee: null,
      monthlyPrincipal: 3_000_000,
      ratePct: 0.25,
    },
  ],
  uniform: false,
  waivedMonths: 0,
  monthlyFees: Array.from({ length: 36 }, () => 1),
})

const PARAGRAPH_TEMPLATE = `
<h1>Fee Annex</h1>
<p>SET-UP FEE: [to be included by pricing]</p>
<p>NETWORK JOINING FEE: [to be included by pricing]</p>
<p>MINIMUM MONTHLY COMMITMENT: [to be included by pricing]</p>
<p>TREASURY MANAGEMENT FEE: [to be included by pricing]</p>
<p>REVERSAL FEE (payable by Customer on request for a Reversal, whether or not successful): [to be included by pricing]</p>
<p>PROOF OF PAYMENT FEE (payable by Customer on request of proof of payment from Thunes): [to be included by pricing]</p>
<p>EMERGENCY FUNDING FEE: 0.3%</p>
<p>THUNES BUSINESS HUB MONTHLY FEE: to be confirmed</p>
<p>[PRICING TO INCLUDE ANY ADDITIONAL PER TRANSACTION FEES]</p>
<p>Stablecoin Pre-funding Set-up Fee: [to be included by pricing]</p>
<p>Thunes will be under no obligation to provide any Service until the [Network Joining][Set-Up] Fee has been paid.</p>
<table><thead><tr><th>Country</th><th>Service</th><th>Vertical</th><th>Payout</th><th>FX Source</th></tr></thead>
<tbody><tr><td>Dummy</td><td>Dummy</td><td>Dummy</td><td>Dummy</td><td>Dummy</td></tr></tbody></table>`

const tr = (label: string, value = 'x') => `<tr><td></td><td>${label}</td><td>${value}</td></tr>`
const TABLE_TEMPLATE = `
<table>
${tr('Initial Term', '[insert period] from and including the date of the first Transaction')}
${tr('Set-up Fee', '$0')}
${tr('Network Joining Fee', '$0')}
${tr('Treasury Management Fee')}
${tr('Service Request Fee - Reversal Fee')}
${tr('Proof of Payment Fee')}
${tr('Thunes Business Hub Monthly Fee')}
${tr('Emergency Funding Fee')}
${tr('Corridor No-Usage Fee')}
${tr('Bulk Currency Conversion')}
${tr('White-Glove Service')}
${tr('Post-Funding Line Penalty Fee')}
${tr('Stablecoin Pre-funding Set-up Fee')}
${tr('Digital Asset Customer Set-up Fee')}
${tr('MMC Waiver Period', '0')}
${tr('Month 1 to 6 Minimum Monthly Commitment Fee')}
${tr('Month 7 to 12 Minimum Monthly Commitment Fee')}
${tr('Month 13 & onwards) Minimum Monthly Commitment Fee')}
${tr('Month 1 to 6 Principal Based Minimum Monthly Commitment Fee')}
${tr('Month 1 to 6 Monthly Principal Volume Commitment')}
${tr('Month 7 to 12 Principal Based Minimum Monthly Commitment Fee')}
${tr('Month 7 to 12 Monthly Principal Volume Commitment')}
${tr('Month 13 Principal Based Minimum Monthly Commitment Fee')}
${tr('Month 13 Monthly Principal Volume Commitment')}
</table>
<table><thead><tr><th>Country</th><th>Service</th><th>Vertical</th><th>Payout CCY</th></tr></thead><tbody><tr><td>x</td><td>x</td><td>x</td><td>x</td></tr></tbody></table>`

/** Text a reader sees: hidden elements removed, like the PDF. */
function visible(html: string): string {
  const $ = cheerio.load(html, {}, false)
  $('[data-annex-hidden]').remove()
  return $.root().text().replace(/\s+/g, ' ').trim()
}

function rowText(html: string, label: string): string {
  const $ = cheerio.load(html, {}, false)
  let found = ''
  $('tr').each((_, row) => {
    const cells = $(row).children('td, th')
    if (cells.toArray().some((c) => $(c).text().trim() === label)) {
      found = $(row).text().replace(/\s+/g, ' ').trim()
    }
  })
  return found
}

function rowHidden(html: string, label: string): boolean {
  const $ = cheerio.load(html, {}, false)
  let hidden = false
  $('tr').each((_, row) => {
    const cells = $(row).children('td, th')
    if (cells.toArray().some((c) => $(c).text().trim() === label)) {
      hidden = $(row).attr('data-annex-hidden') === '1'
    }
  })
  return hidden
}

const fill = (html: string, data: QuoteLegalData) => fillAnnexHtml(html, data)

test.group('annex fill: paragraph-style template', () => {
  test('fills every placeholder from the data', ({ assert }) => {
    const { html } = fill(PARAGRAPH_TEMPLATE, baseData())
    const text = visible(html)
    assert.include(text, 'SET-UP FEE: $50,000')
    assert.include(text, 'MINIMUM MONTHLY COMMITMENT: $100')
    assert.include(text, 'TREASURY MANAGEMENT FEE: 0.1%')
    assert.include(text, 'Reversal, whether or not successful): $10')
    assert.include(text, 'proof of payment from Thunes): $20')
    assert.include(text, 'EMERGENCY FUNDING FEE: 0.3%')
    // Only the Stablecoin line keeps its placeholder: it is not the Set-up Fee.
    assert.lengthOf(text.match(/to be included by pricing/g) ?? [], 1)
  })

  test('never fills "Stablecoin Pre-funding Set-up Fee" as the Set-up Fee', ({ assert }) => {
    const { html } = fill(PARAGRAPH_TEMPLATE, baseData())
    assert.include(html, 'Stablecoin Pre-funding Set-up Fee: [to be included by pricing]')
  })

  test('shows only the selected one-off fee and switches back and forth', ({ assert }) => {
    const setup = fill(PARAGRAPH_TEMPLATE, baseData()).html
    assert.include(visible(setup), 'SET-UP FEE: $50,000')
    assert.notInclude(visible(setup), 'NETWORK JOINING FEE')

    const network = fill(
      setup,
      baseData({ oneOffFee: { feeType: 'network', label: 'Network Joining Fee', amount: 12_500 } })
    ).html
    assert.include(visible(network), 'NETWORK JOINING FEE: $12,500')
    assert.notInclude(visible(network), 'SET-UP FEE')

    const back = fill(network, baseData()).html
    assert.include(visible(back), 'SET-UP FEE: $50,000')
    assert.notInclude(visible(back), 'NETWORK JOINING FEE')
  })

  test('resolves the [Network Joining][Set-Up] sentence and can change it later', ({ assert }) => {
    const setup = fill(PARAGRAPH_TEMPLATE, baseData()).html
    assert.include(visible(setup), 'until the Set-Up Fee has been paid')
    const network = fill(
      setup,
      baseData({ oneOffFee: { feeType: 'network', label: 'Network Joining Fee', amount: 1 } })
    ).html
    assert.include(visible(network), 'until the Network Joining Fee has been paid')
  })

  test('a principal commitment swaps the label and prints each period', ({ assert }) => {
    const standard = fill(PARAGRAPH_TEMPLATE, baseData()).html
    const principal = fill(standard, baseData({ commitment: principalCommitment() })).html
    const text = visible(principal)
    assert.include(text, 'MONTHLY COMMITTED PRINCIPAL / VARIABLE COMMITMENT FEE -')
    assert.include(
      text,
      'Months 1-6: $1,000,000 at 0.15%; Months 7-12: $2,000,000 at 0.2%; Month 13 onwards: $3,000,000 at 0.25%'
    )
    assert.notInclude(text, 'MINIMUM MONTHLY COMMITMENT:')

    const back = fill(principal, baseData()).html
    assert.include(visible(back), 'MINIMUM MONTHLY COMMITMENT: $100')
    assert.notInclude(visible(back), 'PRINCIPAL')
  })

  test('a zero Treasury fee hides its paragraph, and a later fee brings it back', ({ assert }) => {
    const zero = baseData()
    zero.otherFees.treasury_management = { amount: 0, isPercentage: true, currencyCode: null }
    const hidden = fill(PARAGRAPH_TEMPLATE, zero).html
    assert.notInclude(visible(hidden), 'TREASURY MANAGEMENT FEE')

    const restored = fill(hidden, baseData()).html
    assert.include(visible(restored), 'TREASURY MANAGEMENT FEE: 0.1%')
  })

  test('the Business Hub Monthly Fee section is always hidden', ({ assert }) => {
    const { html } = fill(PARAGRAPH_TEMPLATE, baseData())
    assert.notInclude(visible(html), 'THUNES BUSINESS HUB MONTHLY FEE')
  })

  test('adds an OTHER FEES block after the Network Joining paragraph and drops the generic paragraph', ({
    assert,
  }) => {
    const { html } = fill(PARAGRAPH_TEMPLATE, baseData())
    const text = visible(html)
    assert.include(text, 'OTHER FEES:')
    assert.include(text, 'Business Hub Platform Fee: $500')
    assert.include(text, 'Corridor No-Usage Fee: $200 per month per corridor')
    assert.include(text, 'Bulk Currency Conversion: $200 per month')
    assert.include(text, 'White-Glove Service: $0')
    // A zero penalty would read as one that applies.
    assert.notInclude(text, 'Post-Funding Line Penalty Fee')
    assert.notInclude(text, 'PRICING TO INCLUDE ANY ADDITIONAL')

    const withPenalty = baseData()
    withPenalty.otherFees.post_funding_penalty = {
      amount: 2,
      isPercentage: true,
      currencyCode: null,
    }
    assert.include(visible(fill(html, withPenalty).html), 'Post-Funding Line Penalty Fee: 2%')
  })

  test('rebuilds the corridor table with the annex columns and country code', ({ assert }) => {
    const { html } = fill(PARAGRAPH_TEMPLATE, baseData())
    const $ = cheerio.load(html, {}, false)
    const headers = $('table[data-annex-field="corridor_table"] th')
      .toArray()
      .map((th) => $(th).text())
    assert.deepEqual(headers, [
      'Country',
      'Service',
      'Vertical',
      'Payout CCY',
      'Fee CCY',
      'Fixed Fee',
      'Var Fee',
      'FX Spread',
      'FX Source',
      'Volumes',
    ])
    const cells = $('table[data-annex-field="corridor_table"] tbody td')
      .toArray()
      .map((td) => $(td).text())
    assert.deepEqual(cells, [
      'ARG',
      'BankAccount',
      'B2C',
      'ARS',
      'USD',
      '1.50',
      '2.00%',
      '0.75%',
      'Cost Plus',
      '1,000,000',
    ])
    assert.notInclude(html, 'Dummy')
  })

  test('FX columns follow the show-in-contract flags; tier and funding columns appear when needed', ({
    assert,
  }) => {
    const data = baseData({
      showFxSpread: false,
      showFxSource: false,
      hasTiers: true,
      hasMultipleFundingCurrencies: true,
    })
    data.corridorRows = [
      {
        ...data.corridorRows[0],
        tier: 2,
        fundingCurrency: 'EUR',
        fxSpreadPct: null,
        fxSource: null,
      },
    ]
    const $ = cheerio.load(fill(PARAGRAPH_TEMPLATE, data).html, {}, false)
    const headers = $('table[data-annex-field="corridor_table"] th')
      .toArray()
      .map((th) => $(th).text())
    assert.includeMembers(headers, ['Funding CCY', 'Tier'])
    assert.notIncludeMembers(headers, ['FX Spread'])
    assert.notIncludeMembers(headers, ['FX Source'])
  })

  test('corridor values are escaped, never rendered as markup', ({ assert }) => {
    const data = baseData()
    data.corridorRows[0].service = '<script>alert(1)</script>'
    const { html } = fill(PARAGRAPH_TEMPLATE, data)
    assert.notInclude(html, '<script>')
    assert.include(html, '&lt;script&gt;')
  })

  test('warns when there is no corridor table and when there are no corridors', ({ assert }) => {
    const noTable = fill('<p>SET-UP FEE: [to be included by pricing]</p>', baseData())
    assert.isTrue(noTable.warnings.some((w) => w.includes('No corridor table')))

    const empty = fill(PARAGRAPH_TEMPLATE, baseData({ corridorRows: [], corridorCount: 0 }))
    assert.isTrue(empty.warnings.some((w) => w.includes('no priced corridors')))
  })

  test('locks filled values and the label patterns', ({ assert }) => {
    const { html } = fill(PARAGRAPH_TEMPLATE, baseData())
    const $ = cheerio.load(html, {}, false)
    assert.isAbove($('span[data-annex-field].annex-locked').length, 3)
    assert.isTrue($('p:contains("Thunes will be under no obligation")').hasClass('annex-locked'))
    assert.isTrue($('table[data-annex-field="corridor_table"]').hasClass('annex-locked'))
  })
})

test.group('annex fill: table-style template', () => {
  test('fills the Initial Term, keeping the legal wording', ({ assert }) => {
    const { html } = fill(TABLE_TEMPLATE, baseData())
    assert.include(
      rowText(html, 'Initial Term'),
      '3 years from and including the date of the first Transaction'
    )
    const one = fill(TABLE_TEMPLATE, baseData({ contractYears: 1 })).html
    assert.include(rowText(one, 'Initial Term'), '1 year from and including')
    // A second fill after the bracket is gone still updates the number.
    const again = fill(html, baseData({ contractYears: 5 })).html
    assert.include(rowText(again, 'Initial Term'), '5 years from and including')
  })

  test('shows the selected one-off fee row and hides the other, reversibly', ({ assert }) => {
    const setup = fill(TABLE_TEMPLATE, baseData()).html
    assert.include(rowText(setup, 'Set-up Fee'), '$50,000')
    assert.isTrue(rowHidden(setup, 'Network Joining Fee'))
    assert.isFalse(rowHidden(setup, 'Set-up Fee'))

    const network = fill(
      setup,
      baseData({ oneOffFee: { feeType: 'network', label: 'Network Joining Fee', amount: 9_000 } })
    ).html
    assert.include(rowText(network, 'Network Joining Fee'), '$9,000')
    assert.isTrue(rowHidden(network, 'Set-up Fee'))
    assert.isFalse(rowHidden(network, 'Network Joining Fee'))
  })

  test('fee rows use the data: percent and per-unit wording, zeros print as $0', ({ assert }) => {
    const { html } = fill(TABLE_TEMPLATE, baseData())
    assert.include(rowText(html, 'Treasury Management Fee'), '0.1%')
    assert.include(rowText(html, 'Service Request Fee - Reversal Fee'), '$10')
    assert.include(rowText(html, 'Proof of Payment Fee'), '$20')
    assert.include(rowText(html, 'Emergency Funding Fee'), '0.3%')
    assert.include(rowText(html, 'Corridor No-Usage Fee'), '$200 per month per corridor')
    assert.include(rowText(html, 'Bulk Currency Conversion'), '$200 per month')
    assert.include(rowText(html, 'White-Glove Service'), '$0')
    assert.include(rowText(html, 'Stablecoin Pre-funding Set-up Fee'), '$0')
    assert.include(rowText(html, 'Digital Asset Customer Set-up Fee'), '$0')
    // The old Business Hub row is filled but hidden — it lives in Other Fees.
    assert.isTrue(rowHidden(html, 'Thunes Business Hub Monthly Fee'))
  })

  test('the waiver period is the bare number of months', ({ assert }) => {
    const { html } = fill(TABLE_TEMPLATE, baseData())
    assert.match(rowText(html, 'MMC Waiver Period'), /MMC Waiver Period\s*2$/)
  })

  test('standard commitment shows the standard rows with each period fee and hides principal rows', ({
    assert,
  }) => {
    const { html } = fill(TABLE_TEMPLATE, baseData())
    assert.include(rowText(html, 'Month 1 to 6 Minimum Monthly Commitment Fee'), '$100')
    assert.include(rowText(html, 'Month 7 to 12 Minimum Monthly Commitment Fee'), '$150')
    assert.include(rowText(html, 'Month 13 & onwards) Minimum Monthly Commitment Fee'), '$200')
    assert.isTrue(rowHidden(html, 'Month 1 to 6 Principal Based Minimum Monthly Commitment Fee'))
    assert.isTrue(rowHidden(html, 'Month 13 Monthly Principal Volume Commitment'))
  })

  test('principal commitment flips the rows, and going back restores them', ({ assert }) => {
    const principal = fill(TABLE_TEMPLATE, baseData({ commitment: principalCommitment() })).html
    assert.include(
      rowText(principal, 'Month 1 to 6 Principal Based Minimum Monthly Commitment Fee'),
      '0.15%'
    )
    assert.include(
      rowText(principal, 'Month 7 to 12 Monthly Principal Volume Commitment'),
      '$2,000,000'
    )
    assert.include(rowText(principal, 'Month 13 Monthly Principal Volume Commitment'), '$3,000,000')
    assert.isTrue(rowHidden(principal, 'Month 1 to 6 Minimum Monthly Commitment Fee'))

    const back = fill(principal, baseData()).html
    assert.isFalse(rowHidden(back, 'Month 1 to 6 Minimum Monthly Commitment Fee'))
    assert.isTrue(rowHidden(back, 'Month 1 to 6 Principal Based Minimum Monthly Commitment Fee'))
  })

  test('periods that start after the contract ends are hidden, and return when it is extended', ({
    assert,
  }) => {
    const shortData = baseData({ contractYears: 1 })
    shortData.commitment = {
      ...shortData.commitment!,
      monthlyFees: Array.from({ length: 12 }, () => 100),
    }
    const short = fill(TABLE_TEMPLATE, shortData).html
    assert.isTrue(rowHidden(short, 'Month 13 & onwards) Minimum Monthly Commitment Fee'))
    assert.isFalse(rowHidden(short, 'Month 7 to 12 Minimum Monthly Commitment Fee'))

    const longer = fill(short, baseData()).html
    assert.isFalse(rowHidden(longer, 'Month 13 & onwards) Minimum Monthly Commitment Fee'))
  })

  test('rebuilds the corridor table found by its header keywords', ({ assert }) => {
    const { html } = fill(TABLE_TEMPLATE, baseData())
    const $ = cheerio.load(html, {}, false)
    assert.lengthOf($('table[data-annex-field="corridor_table"]'), 1)
    assert.equal($('table[data-annex-field="corridor_table"] tbody tr').length, 1)
  })
})

test.group('annex fill: idempotence, staleness and missing data', () => {
  for (const [name, template] of [
    ['paragraph', PARAGRAPH_TEMPLATE],
    ['table', TABLE_TEMPLATE],
  ] as const) {
    test(`filling twice equals filling once (${name} template)`, ({ assert }) => {
      const once = sanitizeAnnexHtml(fill(template, baseData()).html)
      const twice = sanitizeAnnexHtml(fill(once, baseData()).html)
      assert.equal(twice, once)
    })
  }

  test('refreshing after a price change updates every value in place', ({ assert }) => {
    const first = fill(PARAGRAPH_TEMPLATE, baseData()).html
    const changed = baseData({
      oneOffFee: { feeType: 'setup', label: 'Set Up Fee', amount: 75_000 },
    })
    changed.otherFees.reversal_request = { amount: 15, isPercentage: false, currencyCode: null }
    const text = visible(fill(first, changed).html)
    assert.include(text, 'SET-UP FEE: $75,000')
    assert.include(text, 'Reversal, whether or not successful): $15')
    assert.notInclude(text, '$50,000')
  })

  test('detects a stale annex and a fresh one', ({ assert }) => {
    const filled = sanitizeAnnexHtml(fill(PARAGRAPH_TEMPLATE, baseData()).html)
    assert.isFalse(isAnnexStale(filled, baseData()))
    assert.isTrue(
      isAnnexStale(
        filled,
        baseData({ oneOffFee: { feeType: 'setup', label: 'Set Up Fee', amount: 1 } })
      )
    )
    assert.isTrue(isAnnexStale(PARAGRAPH_TEMPLATE, baseData()))
  })

  test('with no Setup Fee the template is left alone and a warning explains why', ({ assert }) => {
    const result = fill(PARAGRAPH_TEMPLATE, baseData({ oneOffFee: null, commitment: null }))
    assert.isTrue(result.warnings.some((w) => w.includes('No Setup Fee')))
    assert.include(result.html, 'SET-UP FEE: [to be included by pricing]')
  })

  test('a missing contract length leaves the Initial Term untouched and warns', ({ assert }) => {
    const result = fill(TABLE_TEMPLATE, baseData({ contractYears: null }))
    assert.include(rowText(result.html, 'Initial Term'), '[insert period]')
    assert.isTrue(result.warnings.some((w) => w.includes('Contract length')))
  })

  test('rows with a label but no value cell overwrite nothing surprising', ({ assert }) => {
    const { html } = fill(
      '<table><tr><td>Set-up Fee</td></tr><tr><td>Set-up Fee</td><td>x</td></tr></table>',
      baseData()
    )
    assert.include(html, '$50,000')
  })
})
