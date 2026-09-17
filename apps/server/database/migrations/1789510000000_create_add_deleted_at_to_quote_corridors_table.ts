import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'quote_corridors'

  async up() {
    const schema = this.schema
    schema.alterTable(this.tableName, (table) => {
      table.timestamp('deleted_at', { useTz: true }).nullable().defaultTo(null)
    })
    // Almost every query filters `deleted_at IS NULL` — a partial index on
    // just the active rows serves that case without indexing rows nothing
    // queries by this column for.
    schema.raw(
      `CREATE INDEX quote_corridors_active_idx ON ${this.tableName} (quote_id) WHERE deleted_at IS NULL`
    )
  }

  async down() {
    const schema = this.schema
    schema.raw(`DROP INDEX IF EXISTS quote_corridors_active_idx`)
    schema.alterTable(this.tableName, (table) => {
      table.dropColumn('deleted_at')
    })
  }
}
