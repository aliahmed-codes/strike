import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The P&L tab's only user-editable inputs: the two 3-year growth rates.
 * A dedicated one-to-one table (mirroring quote_setup_fees), not columns on
 * quotes — avoids repeating the quotes.waived_months mistake, where a
 * single-feature field was added directly to the quotes table and later had
 * to be dropped in favor of a proper per-feature table.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('quote_pnl_inputs', (table) => {
      table.increments('id')
      table
        .integer('quote_id')
        .unsigned()
        .notNullable()
        .unique()
        .references('id')
        .inTable('quotes')
        .onDelete('CASCADE')

      table.decimal('year2_growth_pct', 6, 2).notNullable().defaultTo(0)
      table.decimal('year3_growth_pct', 6, 2).notNullable().defaultTo(0)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable('quote_pnl_inputs')
  }
}
