import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Static reference/lookup data used across quotes: geography, currencies,
 * and a handful of quote-classification lookups. Seeded (not user-editable
 * yet) from real reference data recovered from the old project — see
 * database/seeders/reference_data_seeder.ts.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('regions', (table) => {
      table.increments('id')
      table.string('code', 20).notNullable().unique()
      table.string('name', 100).notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })

    this.schema.createTable('countries', (table) => {
      table.increments('id')
      table.string('iso_code_3', 3).notNullable().unique()
      table.string('name', 100).notNullable()
      table.integer('region_id').unsigned().notNullable().references('id').inTable('regions')
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })

    this.schema.createTable('currencies', (table) => {
      table.increments('id')
      table.string('iso_code_3', 3).notNullable().unique()
      table.string('name', 100).notNullable()
      table.integer('decimal_places').notNullable().defaultTo(2)
      table.boolean('is_source').notNullable().defaultTo(false)
      table.boolean('is_funding').notNullable().defaultTo(false)
      table.boolean('is_payout').notNullable().defaultTo(false)
      table.boolean('is_fee').notNullable().defaultTo(false)
      table.boolean('is_hard').notNullable().defaultTo(false)
      table.boolean('is_pegged').notNullable().defaultTo(false)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })

    this.schema.createTable('pegged_rates', (table) => {
      table.increments('id')
      table.integer('currency_id').unsigned().notNullable().references('id').inTable('currencies')
      table.decimal('rate_to_usd', 14, 6).notNullable()
      table.date('effective_from').notNullable()
      table.date('effective_to').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })

    this.schema.createTable('use_cases', (table) => {
      table.increments('id')
      table.string('code', 60).notNullable().unique()
      table.string('label', 150).notNullable()
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })

    this.schema.createTable('integration_types', (table) => {
      table.increments('id')
      table.string('name', 150).notNullable().unique()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })

    this.schema.createTable('icp_nodes', (table) => {
      table.increments('id')
      table.string('code', 60).notNullable().unique()
      table.string('name', 150).notNullable()
      table.integer('level').notNullable()
      table.integer('parent_id').unsigned().nullable().references('id').inTable('icp_nodes')
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable('icp_nodes')
    this.schema.dropTable('integration_types')
    this.schema.dropTable('use_cases')
    this.schema.dropTable('pegged_rates')
    this.schema.dropTable('currencies')
    this.schema.dropTable('countries')
    this.schema.dropTable('regions')
  }
}
