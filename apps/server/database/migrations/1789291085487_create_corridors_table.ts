import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The corridor catalog: the master list of priced payment lanes a user
 * picks from when adding a corridor to a quote. Seeded from the old
 * project's reference data (see database/seeders/reference_data_seeder.ts).
 */
export default class extends BaseSchema {
  protected tableName = 'corridors'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('country_id').unsigned().notNullable().references('id').inTable('countries')
      table.string('service_code', 60).notNullable()
      table.string('transaction_type_code', 20).notNullable()
      table.string('payer_code', 100).notNullable()
      table
        .integer('payout_currency_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('currencies')
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.unique([
        'country_id',
        'service_code',
        'transaction_type_code',
        'payer_code',
        'payout_currency_id',
      ])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
