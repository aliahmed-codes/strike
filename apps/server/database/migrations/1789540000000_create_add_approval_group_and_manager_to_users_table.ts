import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The smallest schema needed for the old app's multi-group approval routing
 * without its generic role/profile resolver: a fixed group enum directly on
 * the user, plus a self-referential manager for the one routing rule that
 * needs it (a custom-schedule Setup Fee exception targets the owner's manager).
 */
export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.enum('approval_group', ['network_team', 'pricing_team', 'csuite']).nullable()
      table
        .integer('manager_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('approval_group')
      table.dropColumn('manager_id')
    })
  }
}
