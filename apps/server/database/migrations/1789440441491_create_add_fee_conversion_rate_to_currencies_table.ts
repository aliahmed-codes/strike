import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * A static, admin-maintained USD conversion rate for displaying a fee in the
 * deal's own currency (see FEATURES.md Phase 1b field-parity pass) — matches
 * the old app's real approach (`currency_rates` table, an imported XE
 * mid-market average, not a live rate API). Only 14 currencies have a real
 * rate in the old app's own data; every other currency stays null here
 * rather than falling back to a fake 1:1 rate the way the old app silently
 * did — the frontend shows "no rate available" instead of a wrong number.
 */
export default class extends BaseSchema {
  protected tableName = 'currencies'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.decimal('fee_conversion_rate_to_usd', 14, 6).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('fee_conversion_rate_to_usd')
    })
  }
}
