import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * A quote can support several use cases and several funding/source
 * currencies, matching the old app's real schema exactly (it had these as
 * separate join tables, not comma-separated strings or JSON arrays).
 * quotes.funding_currency_id / source_currency_id remain the "default"
 * currency shown first; these tables hold the full selectable set.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('quote_use_cases', (table) => {
      table.increments('id')
      table
        .integer('quote_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('quotes')
        .onDelete('CASCADE')
      table.integer('use_case_id').unsigned().notNullable().references('id').inTable('use_cases')
      table.unique(['quote_id', 'use_case_id'])
    })

    this.schema.createTable('quote_funding_currencies', (table) => {
      table.increments('id')
      table
        .integer('quote_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('quotes')
        .onDelete('CASCADE')
      table.integer('currency_id').unsigned().notNullable().references('id').inTable('currencies')
      table.unique(['quote_id', 'currency_id'])
    })

    this.schema.createTable('quote_source_currencies', (table) => {
      table.increments('id')
      table
        .integer('quote_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('quotes')
        .onDelete('CASCADE')
      table.integer('currency_id').unsigned().notNullable().references('id').inTable('currencies')
      table.unique(['quote_id', 'currency_id'])
    })
  }

  async down() {
    this.schema.dropTable('quote_source_currencies')
    this.schema.dropTable('quote_funding_currencies')
    this.schema.dropTable('quote_use_cases')
  }
}
