import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Real per-corridor pricing/cost/compliance master data, backfilled from the
 * old app's live `corridors_list.corridor_details` JSONB (active catalog
 * version) — see FEATURES.md Phase 1b. Nullable because 8 of our 1,271
 * corridors don't have a matching row in the old app's current active
 * version (catalog drift since Phase 1's original export) — the pricing
 * service treats a null here as "data unavailable", not "no cost"/"no
 * approval needed".
 */
export default class extends BaseSchema {
  protected tableName = 'corridors'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // FX ("FX Source" in the old catalog) — drives which FX-margin formula applies.
      table.string('fx_source').nullable()
      // "Treasury Expected FX Cost: Spread" — a fraction (e.g. 0.001 = 0.1%), not a percent.
      table.decimal('treasury_fx_cost_spread', 10, 6).nullable()
      // "Fixed Cost in USD" — the network's own per-transaction cost, used for Margin Fee.
      table.decimal('cost_fixed_usd', 12, 6).nullable()
      // "Variable Cost" — a fraction of volume (e.g. 0.0002 = 0.02%), used for Margin Fee.
      table.decimal('cost_variable_pct', 10, 6).nullable()
      // Raw "Need Approval" / "Internal" / "Central Bank" values — kept as the old
      // app's own strings (not booleans) so the exact lookup rule can be reproduced.
      table.string('network_need_approval_raw').nullable()
      table.string('internal_raw').nullable()
      table.string('central_bank_raw').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('fx_source')
      table.dropColumn('treasury_fx_cost_spread')
      table.dropColumn('cost_fixed_usd')
      table.dropColumn('cost_variable_pct')
      table.dropColumn('network_need_approval_raw')
      table.dropColumn('internal_raw')
      table.dropColumn('central_bank_raw')
    })
  }
}
