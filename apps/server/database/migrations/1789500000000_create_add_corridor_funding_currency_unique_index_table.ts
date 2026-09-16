import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Phase B (multiple funding currencies per corridor): the original
 * `quote_corridors` table migration added `UNIQUE(quote_id, corridor_id)`,
 * which blocks the same corridor from ever being saved twice on a quote —
 * even under a different funding currency. That constraint is replaced here
 * with one scoped to the funding currency too, which is the real DB-level
 * guarantee this feature needs (the old app never had one at all — its own
 * normalized redesign for this, `v2.quote_corridors`, was designed but
 * never wired up; see docs/old-app-reference/pricing-tab-corridor-editing.md §2).
 *
 * A plain multi-column UNIQUE constraint on the new column won't do,
 * because Postgres treats every NULL as distinct from every other NULL —
 * two rows with no funding currency set would never collide.
 * `COALESCE(funding_currency_id, -1)` folds every "no funding currency" row
 * onto the same sentinel so the index still catches that case, without
 * needing an "unspecified" currency row to exist in the `currencies` table.
 */
export default class extends BaseSchema {
  protected tableName = 'quote_corridors'

  async up() {
    // `this.schema` is a getter that registers its return value to be run
    // later — accessing it twice in one migration queues the *same*
    // underlying builder twice, so it executes twice (the second run then
    // fails because the first already applied it). Capture it once instead.
    const schema = this.schema
    schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['quote_id', 'corridor_id'])
    })
    schema.raw(
      `CREATE UNIQUE INDEX quote_corridors_quote_corridor_funding_currency_unique
       ON ${this.tableName} (quote_id, corridor_id, COALESCE(funding_currency_id, -1))`
    )
  }

  async down() {
    const schema = this.schema
    schema.raw(`DROP INDEX IF EXISTS quote_corridors_quote_corridor_funding_currency_unique`)
    schema.alterTable(this.tableName, (table) => {
      table.unique(['quote_id', 'corridor_id'])
    })
  }
}
