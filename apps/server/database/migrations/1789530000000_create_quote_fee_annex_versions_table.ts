import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Immutable numbered versions of a quote's Fee Annex document. Comments are
 * not stored: the old app's comment UI was commented out, so nothing used them.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('quote_fee_annex_versions', (table) => {
      table.increments('id')
      table
        .integer('quote_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('quotes')
        .onDelete('CASCADE')
      table.integer('version').unsigned().notNullable()
      table.string('name', 255).notNullable()
      table.text('content').notNullable()
      table
        .integer('modified_by_user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.unique(['quote_id', 'version'])
    })
  }

  async down() {
    this.schema.dropTable('quote_fee_annex_versions')
  }
}
