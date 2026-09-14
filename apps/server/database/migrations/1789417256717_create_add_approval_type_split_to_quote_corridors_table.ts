import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Splits the old single `needs_approval` flag into the old app's real
 * distinction: financial approval (pricing/margin rules) vs network approval
 * (a lookup on the corridor's own Need Approval/Internal/Central Bank master
 * data — see FEATURES.md Phase 1b). `needs_approval`/`approval_reasons`
 * stay as-is (now the OR of the two) so nothing that reads them breaks.
 */
export default class extends BaseSchema {
  protected tableName = 'quote_corridors'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('needs_financial_approval').notNullable().defaultTo(false)
      table.jsonb('financial_approval_reasons').nullable()
      table.boolean('needs_network_approval').notNullable().defaultTo(false)
      table.jsonb('network_approval_reasons').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('needs_financial_approval')
      table.dropColumn('financial_approval_reasons')
      table.dropColumn('needs_network_approval')
      table.dropColumn('network_approval_reasons')
    })
  }
}
