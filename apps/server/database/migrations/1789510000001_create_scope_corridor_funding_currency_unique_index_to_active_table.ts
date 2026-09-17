import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Scopes the funding-currency unique index (added in
 * 1789500000000_..._funding_currency_unique_index_table.ts) to active rows
 * only, so soft-deleting a corridor+funding-currency pair frees that slot up
 * for a fresh row without requiring a restore first.
 */
export default class extends BaseSchema {
  protected tableName = 'quote_corridors'

  async up() {
    const schema = this.schema
    schema.raw(`DROP INDEX IF EXISTS quote_corridors_quote_corridor_funding_currency_unique`)
    schema.raw(
      `CREATE UNIQUE INDEX quote_corridors_quote_corridor_funding_currency_unique
       ON ${this.tableName} (quote_id, corridor_id, COALESCE(funding_currency_id, -1))
       WHERE deleted_at IS NULL`
    )
  }

  async down() {
    const schema = this.schema
    schema.raw(`DROP INDEX IF EXISTS quote_corridors_quote_corridor_funding_currency_unique`)
    schema.raw(
      `CREATE UNIQUE INDEX quote_corridors_quote_corridor_funding_currency_unique
       ON ${this.tableName} (quote_id, corridor_id, COALESCE(funding_currency_id, -1))`
    )
  }
}
