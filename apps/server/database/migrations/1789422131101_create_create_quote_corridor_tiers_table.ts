import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Tiers 1-3 of a tiered corridor (see FEATURES.md Phase 1b). The "standard"
 * tier is not a row here — it's whatever volume is left over after tiers
 * 1-3 are subtracted from the corridor's total, priced at the corridor's own
 * existing fixed_fee_usd/variable_fee_pct/applied_fx_spread. This avoids the
 * old app's asymmetric model (a flat "Tier 0" plus opaque JSON for the rest)
 * — every tier here is a real, symmetric, queryable row.
 */
export default class extends BaseSchema {
  protected tableName = 'quote_corridor_tiers'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('quote_corridor_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('quote_corridors')
        .onDelete('CASCADE')
      table.integer('tier_number').notNullable() // 1, 2, or 3

      // Inputs
      table.decimal('yearly_volume_usd', 16, 2).notNullable().defaultTo(0)
      table.decimal('fixed_fee_usd', 10, 4).notNullable().defaultTo(0)
      table.decimal('variable_fee_pct', 7, 4).notNullable().defaultTo(0)
      table.decimal('applied_fx_spread', 7, 4).notNullable().defaultTo(0)

      // Outputs — written only by the backend pricing service.
      table.integer('yearly_transactions').nullable()
      table.decimal('revenue_fee', 16, 2).nullable()
      table.decimal('fx_margin', 16, 2).nullable()
      table.decimal('fx_margin_pct', 7, 4).nullable()
      table.decimal('margin_fee', 16, 2).nullable()
      table.decimal('total_revenue', 16, 2).nullable()
      table.decimal('total_margin', 16, 2).nullable()
      table.decimal('gross_margin_pct', 7, 4).nullable()
      table.decimal('take_rate_pct', 7, 4).nullable()
      table.boolean('needs_approval').notNullable().defaultTo(false)
      table.jsonb('approval_reasons').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.unique(['quote_corridor_id', 'tier_number'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
