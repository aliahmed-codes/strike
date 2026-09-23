import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'quote_approval_histories'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('approval_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('quote_approvals')
        .onDelete('CASCADE')
      table
        .integer('actor_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.string('event_type', 50).notNullable()
      table.text('comment').nullable()
      table.timestamp('created_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
