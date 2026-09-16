import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Persists the "Corridors to Offer" facet-filter selection directly on the
 * quote — matching the old app's real schema (`quotes.regions/countries/
 * services/transaction_types/payout_currencies/payers`, all jsonb arrays).
 * This is what lets the same filter state drive both the Summary tab's
 * filter panels and the Pricing tab's live preview rows. See FEATURES.md
 * Phase 1b's "Filter-Derived Live Preview Corridors" notes for the full
 * design (why plain columns, not join tables — Service/Transaction Type/
 * Payer have no master reference table of their own, same as the old app).
 */
export default class extends BaseSchema {
  protected tableName = 'quotes'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.jsonb('corridor_filter_region_ids').notNullable().defaultTo('[]')
      table.jsonb('corridor_filter_country_ids').notNullable().defaultTo('[]')
      table.jsonb('corridor_filter_service_codes').notNullable().defaultTo('[]')
      table.jsonb('corridor_filter_transaction_type_codes').notNullable().defaultTo('[]')
      table.jsonb('corridor_filter_payout_currency_ids').notNullable().defaultTo('[]')
      table.jsonb('corridor_filter_payer_codes').notNullable().defaultTo('[]')
      table.boolean('corridor_filter_hide_usd_swift').notNullable().defaultTo(false)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('corridor_filter_region_ids')
      table.dropColumn('corridor_filter_country_ids')
      table.dropColumn('corridor_filter_service_codes')
      table.dropColumn('corridor_filter_transaction_type_codes')
      table.dropColumn('corridor_filter_payout_currency_ids')
      table.dropColumn('corridor_filter_payer_codes')
      table.dropColumn('corridor_filter_hide_usd_swift')
    })
  }
}
