import { BaseSchema } from '@adonisjs/lucid/schema'

/** Adds the same Margin %/Margin Fee % distinction to per-tier rows — see the sibling migration on quote_corridors for the full explanation. */
export default class extends BaseSchema {
  protected tableName = 'quote_corridor_tiers'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.decimal('margin_fee_pct', 7, 4).nullable()
      table.decimal('margin_pct', 7, 4).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('margin_fee_pct')
      table.dropColumn('margin_pct')
    })
  }
}
