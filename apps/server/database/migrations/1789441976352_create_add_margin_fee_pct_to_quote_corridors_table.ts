import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Fixes a real naming bug found comparing our Pricing tab against the old
 * app's real one: what we called `margin_pct` was actually computing the
 * old app's "Margin Fee %" (margin fee ÷ volume, excluding FX margin) — the
 * old app's real "Margin %" is a distinct metric (total margin, including
 * FX margin, ÷ volume) we were missing entirely. `margin_pct` itself is now
 * corrected in code to compute that real metric; this migration adds the
 * fee-only one back under its own honest name.
 */
export default class extends BaseSchema {
  protected tableName = 'quote_corridors'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.decimal('margin_fee_pct', 7, 4).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('margin_fee_pct')
    })
  }
}
