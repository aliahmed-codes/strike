import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Market-Based Pricing (MBP) reference tables — a rule engine that can
 * override a corridor's catalog fee/FX terms based on the quote's Sending
 * Partner Region + ICP category, the corridor's own country tier, and its
 * transaction type. Reverse-engineered from the old app's real
 * `mbpPricingEngine.ts` + `mbp_pricing_service.ts` and its live database
 * (see docs/old-app-reference for the investigation notes). Every FK here
 * points at this app's own reference tables (regions/countries/icp_nodes)
 * by id, not by the old app's text codes/names — those are resolved once,
 * at seed time, in `mbp_reference_data_seeder.ts`.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('country_tiers', (table) => {
      table.increments('id')
      table
        .integer('country_id')
        .unsigned()
        .notNullable()
        .unique()
        .references('id')
        .inTable('countries')
      table.string('tier').notNullable() // 'G10' | 'G20' | 'Exotic'
      table.string('notes').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })

    this.schema.createTable('region_pressures', (table) => {
      table.increments('id')
      table.integer('region_id').unsigned().notNullable().references('id').inTable('regions')
      // Wildcard-capable, e.g. "B2B" or "C2X/B2C" — matched via the shared
      // `matchesTransactionType` helper, never plain string equality.
      table.string('transaction_type').notNullable()
      table.string('pressure_level').notNullable() // 'High' | 'Medium' | 'Low'
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.index(['region_id'])
    })

    this.schema.createTable('icp_sensitivities', (table) => {
      table.increments('id')
      table.integer('icp_node_id_l1').unsigned().nullable().references('id').inTable('icp_nodes')
      table.integer('icp_node_id_l2').unsigned().nullable().references('id').inTable('icp_nodes')
      table.integer('icp_node_id_l3').unsigned().nullable().references('id').inTable('icp_nodes')
      table.string('transaction_type').notNullable()
      table.string('sensitivity').notNullable() // 'High' | 'Medium' | 'Low'
      table.string('description').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.index(['icp_node_id_l3'])
    })

    this.schema.createTable('decision_matrix', (table) => {
      table.increments('id')
      table.string('icp_sensitivity').notNullable() // 'High' | 'Medium' | 'Low'
      table.string('region_pressure').notNullable() // 'High' | 'Medium' | 'Low'
      table.string('pricing_decision').notNullable()
      table.decimal('fee_adjustment_percent', 6, 2).notNullable()
      table.decimal('fx_spread_adjustment_bps', 8, 2).notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      // Exactly the 3x3 sensitivity x pressure grid — enforced at the DB level.
      table.unique(['icp_sensitivity', 'region_pressure'])
    })

    this.schema.createTable('grid_fee_adjustments', (table) => {
      table.increments('id')
      table.string('region_pressure').notNullable() // 'High' | 'Medium' | 'Low'
      table.string('corridor_tier').notNullable() // 'G10' | 'G20' | 'Exotic'
      table.integer('icp_node_id_l1').unsigned().notNullable().references('id').inTable('icp_nodes')
      table.string('transaction_type').notNullable()
      table.decimal('fixed_fee_usd', 12, 6).notNullable()
      table.decimal('fx_spread_adjustment_bps', 8, 2).notNullable()
      table.decimal('minimum_fx_spread_adjustment_bps', 8, 2).notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.index(['region_pressure', 'corridor_tier', 'icp_node_id_l1'])
    })

    this.schema.createTable('strategic_overrides', (table) => {
      table.increments('id')
      table.integer('country_id').unsigned().nullable().references('id').inTable('countries')
      table.integer('currency_id').unsigned().nullable().references('id').inTable('currencies')
      table.integer('region_id').unsigned().nullable().references('id').inTable('regions')
      table.string('transaction_type').nullable() // null = matches any
      table.integer('icp_node_id_l1').unsigned().nullable().references('id').inTable('icp_nodes')
      table.integer('icp_node_id_l2').unsigned().nullable().references('id').inTable('icp_nodes')
      table.integer('icp_node_id_l3').unsigned().nullable().references('id').inTable('icp_nodes')
      table.jsonb('sensitivities').nullable() // ('High'|'Medium'|'Low')[]
      table.jsonb('region_pressures').nullable() // ('High'|'Medium'|'Low')[]
      table.decimal('fee_adjustment_percent', 6, 2).nullable()
      table.decimal('fx_spread_adjustment_bps', 8, 2).nullable()
      table.decimal('fixed_fee_usd', 12, 6).nullable()
      table.decimal('fx_spread', 10, 6).nullable()
      table.decimal('minimum_fx_spread', 10, 6).nullable()
      table.string('override_mode').notNullable() // 'adjustment' | 'standard'
      table.string('targeting_mode').notNullable() // 'exact' | 'mbp'
      table.string('reason').nullable()
      table.integer('priority').notNullable().defaultTo(0)
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('effective_from').nullable()
      table.timestamp('effective_to').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.index(['is_active', 'priority'])
      table.index(['country_id'])
    })
  }

  async down() {
    this.schema.dropTable('strategic_overrides')
    this.schema.dropTable('grid_fee_adjustments')
    this.schema.dropTable('decision_matrix')
    this.schema.dropTable('icp_sensitivities')
    this.schema.dropTable('region_pressures')
    this.schema.dropTable('country_tiers')
  }
}
