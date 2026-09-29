import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Per-row overrides of the corridor catalog's own master data — the old
 * app's real editable "T.E FX Cost Spread %", "Fixed Cost in USD",
 * "Variable Cost %", and "Fx Source" cells on the Pricing tab. Null means
 * "use the catalog value" (`corridors.fx_source` etc). See
 * `corridor_pricing_math.ts` for how these feed into FX Margin / Margin Fee.
 */
export default class extends BaseSchema {
  protected tableName = 'quote_corridors'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('fx_source_override').nullable()
      table.decimal('treasury_fx_cost_spread_override', 10, 6).nullable()
      table.decimal('cost_fixed_usd_override', 12, 6).nullable()
      table.decimal('cost_variable_pct_override', 10, 6).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('fx_source_override')
      table.dropColumn('treasury_fx_cost_spread_override')
      table.dropColumn('cost_fixed_usd_override')
      table.dropColumn('cost_variable_pct_override')
    })
  }
}
