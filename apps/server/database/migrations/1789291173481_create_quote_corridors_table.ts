import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'quote_corridors'

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
      table.integer('corridor_id').unsigned().notNullable().references('id').inTable('corridors')
      table
        .integer('funding_currency_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('currencies')

      // Inputs — what the user actually types in on the Pricing tab.
      table.decimal('atv_usd', 14, 2).notNullable().defaultTo(0)
      table.decimal('yearly_volume_usd', 16, 2).notNullable().defaultTo(0)
      table.integer('yearly_transactions').notNullable().defaultTo(0)
      table.decimal('fixed_fee_usd', 10, 4).notNullable().defaultTo(0)
      table.decimal('variable_fee_pct', 7, 4).notNullable().defaultTo(0)
      table.decimal('applied_fx_spread', 7, 4).notNullable().defaultTo(0)
      table.decimal('fee_discount_pct', 7, 4).notNullable().defaultTo(0)

      // Outputs — written only by the backend pricing service, never
      // trusted from client input. Nullable until first computed.
      table.decimal('revenue_fee', 16, 2).nullable()
      table.decimal('fx_margin', 16, 2).nullable()
      table.decimal('fx_margin_pct', 7, 4).nullable()
      table.decimal('margin_fee', 16, 2).nullable()
      table.decimal('total_revenue', 16, 2).nullable()
      table.decimal('total_margin', 16, 2).nullable()
      table.decimal('margin_pct', 7, 4).nullable()
      table.decimal('gross_margin_pct', 7, 4).nullable()
      table.decimal('take_rate_pct', 7, 4).nullable()
      table.timestamp('computed_at').nullable()
      table.boolean('needs_approval').notNullable().defaultTo(false)
      table.jsonb('approval_reasons').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.unique(['quote_id', 'corridor_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
