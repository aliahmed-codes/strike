import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Setup Fee tab — real normalized tables, unlike the old app which stored
 * this entire tab as one unvalidated JSON blob on the quote. See FEATURES.md
 * Phase 2 for the investigation this schema is based on.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('quote_setup_fees', (table) => {
      table.increments('id')
      table
        .integer('quote_id')
        .unsigned()
        .notNullable()
        .unique()
        .references('id')
        .inTable('quotes')
        .onDelete('CASCADE')

      table.enum('fee_type', ['setup', 'network']).notNullable().defaultTo('setup')
      table.decimal('quoted_price', 14, 2).notNullable().defaultTo(0)

      table.enum('payment_schedule', ['full', 'custom']).notNullable().defaultTo('full')
      table
        .enum('joining_fee_billing_type', ['at_signing', 'non_standard'])
        .notNullable()
        .defaultTo('at_signing')

      table.enum('mcf_type', ['standard', 'principal']).notNullable().defaultTo('standard')
      table
        .enum('mcf_billing_start', ['at_signing', 'at_go_live', 'non_standard'])
        .notNullable()
        .defaultTo('at_signing')
      table.decimal('standard_commitment_fee', 14, 2).notNullable().defaultTo(0)
      table.decimal('commitment_fee_discount_pct', 5, 2).notNullable().defaultTo(0)

      table.integer('waived_months').unsigned().notNullable().defaultTo(0)

      table.boolean('rebate_incentive').notNullable().defaultTo(false)
      table.enum('rebate_type', ['volume', 'revenue', 'transaction_count', 'other']).nullable()

      // Backend-computed, never trusted from the client — same pattern as quote_corridors.
      table.boolean('needs_approval').notNullable().defaultTo(false)
      table.jsonb('approval_reasons').nullable()
      table.timestamp('computed_at').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })

    this.schema.createTable('quote_payment_milestones', (table) => {
      table.increments('id')
      table
        .integer('quote_setup_fee_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('quote_setup_fees')
        .onDelete('CASCADE')

      table.string('milestone', 150).notNullable()
      table.decimal('percentage', 5, 2).notNullable()
      table.text('description').nullable()
      table.integer('sort_order').unsigned().notNullable().defaultTo(0)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })

    this.schema.createTable('quote_mcf_principal_slots', (table) => {
      table.increments('id')
      table
        .integer('quote_setup_fee_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('quote_setup_fees')
        .onDelete('CASCADE')

      table.integer('slot_index').unsigned().notNullable()
      table.string('label', 100).notNullable()
      table.integer('start_month').unsigned().notNullable()
      table.integer('end_month').unsigned().nullable()
      table.decimal('monthly_principal', 14, 2).notNullable().defaultTo(0)
      table.decimal('rate_pct', 6, 3).notNullable().defaultTo(0)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.unique(['quote_setup_fee_id', 'slot_index'])
    })

    this.schema.createTable('quote_mcf_block_fees', (table) => {
      table.increments('id')
      table
        .integer('quote_setup_fee_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('quote_setup_fees')
        .onDelete('CASCADE')

      // 'y1_h1' | 'y1_h2' | 'y2' | 'y3' ... — Year 1 splits into two halves
      // (matching the old app's real usage), later years are one block each.
      table.string('block_key', 20).notNullable()
      table.decimal('commitment_fee', 14, 2).notNullable().defaultTo(0)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.unique(['quote_setup_fee_id', 'block_key'])
    })

    this.schema.createTable('quote_other_fees', (table) => {
      table.increments('id')
      table
        .integer('quote_setup_fee_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('quote_setup_fees')
        .onDelete('CASCADE')

      table.string('concept_code', 60).notNullable()
      table.decimal('amount', 14, 2).notNullable().defaultTo(0)
      table.boolean('is_percentage').notNullable().defaultTo(false)
      table.integer('currency_id').unsigned().nullable().references('id').inTable('currencies')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.unique(['quote_setup_fee_id', 'concept_code'])
    })
  }

  async down() {
    this.schema.dropTable('quote_other_fees')
    this.schema.dropTable('quote_mcf_block_fees')
    this.schema.dropTable('quote_mcf_principal_slots')
    this.schema.dropTable('quote_payment_milestones')
    this.schema.dropTable('quote_setup_fees')
  }
}
