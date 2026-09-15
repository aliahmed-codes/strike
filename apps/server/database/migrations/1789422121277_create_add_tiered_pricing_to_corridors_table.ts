import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Per-corridor tiered/volume-based pricing toggle — see FEATURES.md Phase 1b.
 * Deliberately per-corridor, not per-quote like the old app: every corridor
 * here is already independently priced, so a quote can mix standard and
 * tiered corridors freely.
 */
export default class extends BaseSchema {
  protected tableName = 'quote_corridors'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.enum('pricing_model', ['standard', 'tiered']).notNullable().defaultTo('standard')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('pricing_model')
    })
  }
}
