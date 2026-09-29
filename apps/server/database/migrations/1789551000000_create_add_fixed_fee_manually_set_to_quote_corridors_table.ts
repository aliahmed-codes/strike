import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Tracks whether a human explicitly typed this corridor's Fixed Fee, as
 * opposed to it still following the live Market-Based Pricing (MBP)
 * recommendation. While false, the fee is recomputed from MBP on every
 * save (so it follows the quote's Sending Partner Region / ICP category if
 * either changes later); the first time a save actually changes the value
 * away from what MBP+catalog would currently produce, it flips to true and
 * the fee stops auto-following.
 */
export default class extends BaseSchema {
  protected tableName = 'quote_corridors'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('fixed_fee_manually_set').notNullable().defaultTo(false)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('fixed_fee_manually_set')
    })
  }
}
