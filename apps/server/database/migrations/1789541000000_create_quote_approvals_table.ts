import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * One row per group (or per targeted manager) needing to sign off on a
 * single submission. `snapshot_reasons` freezes the discrepancy evidence at
 * submission time — it is never edited afterwards, only re-filtered for
 * display against current corridor state (see quote_approval_service).
 */
export default class extends BaseSchema {
  protected tableName = 'quote_approvals'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('quote_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('quotes')
        .onDelete('CASCADE')

      // Null when this row targets a specific manager (target_user_id) rather than a group.
      table.enum('group', ['network_team', 'pricing_team', 'csuite']).nullable()
      table
        .integer('target_user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')

      table
        .enum('status', ['pending', 'approved', 'rejected', 'auto_approved', 'withdrawn'])
        .notNullable()
        .defaultTo('pending')

      table.text('reason').notNullable()
      table.text('business_impact').nullable()
      table.text('value_impact').nullable()
      table.jsonb('snapshot_reasons').notNullable().defaultTo('[]')

      table
        .integer('initiator_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table
        .integer('decided_by_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.text('decision_comment').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.index(['quote_id', 'status'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
