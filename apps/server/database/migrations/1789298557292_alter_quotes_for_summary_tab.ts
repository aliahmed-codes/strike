import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Expands the quotes table to match the old app's real Summary tab
 * (confirmed against its actual schema): ICP is 3 independent levels, not
 * one node, and there are several quote-level classification/display
 * fields that Phase 1 didn't need until the Summary tab UI required them.
 */
export default class extends BaseSchema {
  protected tableName = 'quotes'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign('icp_node_id')
      table.dropColumn('icp_node_id')

      table.dropForeign('use_case_id')
      table.dropColumn('use_case_id')

      table.integer('icp_level1_id').unsigned().nullable().references('id').inTable('icp_nodes')
      table.integer('icp_level2_id').unsigned().nullable().references('id').inTable('icp_nodes')
      table.integer('icp_level3_id').unsigned().nullable().references('id').inTable('icp_nodes')

      table.boolean('show_fx_source_in_contract').notNullable().defaultTo(false)
      table.boolean('show_fx_spread_in_contract').notNullable().defaultTo(false)
      table.string('fx_model', 60).nullable()
      table.string('selected_pricing_strategy', 60).nullable()
      table.string('selected_fx_pricing', 60).nullable()
      table
        .integer('default_fee_currency_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('currencies')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('icp_level1_id')
      table.dropColumn('icp_level2_id')
      table.dropColumn('icp_level3_id')
      table.dropColumn('show_fx_source_in_contract')
      table.dropColumn('show_fx_spread_in_contract')
      table.dropColumn('fx_model')
      table.dropColumn('selected_pricing_strategy')
      table.dropColumn('selected_fx_pricing')
      table.dropColumn('default_fee_currency_id')

      table.integer('icp_node_id').unsigned().nullable().references('id').inTable('icp_nodes')
      table.integer('use_case_id').unsigned().nullable().references('id').inTable('use_cases')
    })
  }
}
