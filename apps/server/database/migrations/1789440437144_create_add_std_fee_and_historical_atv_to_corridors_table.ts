import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Real reference data the old app shows alongside the quoted fee, matching
 * its Pricing tab columns exactly (see FEATURES.md Phase 1b field-parity
 * pass): the catalog's own suggested "standard" fee (so a salesperson can
 * see how far their quote deviates from it), and a historical average
 * transaction value per corridor (so they can sanity-check their ATV input
 * against real transaction history). Both nullable — Std Fee data matches
 * the same ~1,263/1,271 corridors as the other master data; Historical ATV
 * only matches ~51% (it's keyed by service+country+transaction type only,
 * not payer, in the old app's own source data) — null means "no data",
 * never a fabricated 0.
 */
export default class extends BaseSchema {
  protected tableName = 'corridors'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.decimal('std_fixed_fee_usd', 10, 4).nullable()
      table.decimal('std_variable_fee_pct', 7, 4).nullable()
      table.decimal('historical_atv', 14, 2).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('std_fixed_fee_usd')
      table.dropColumn('std_variable_fee_pct')
      table.dropColumn('historical_atv')
    })
  }
}
