import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'quotes'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('name', 200).notNullable()
      table
        .enum('status', ['draft', 'submitted', 'approved', 'rejected', 'closed'])
        .notNullable()
        .defaultTo('draft')
      table.integer('owner_id').unsigned().notNullable().references('id').inTable('users')
      table.string('opportunity_type', 60).nullable()
      table
        .integer('partner_country_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('countries')
      table.integer('use_case_id').unsigned().nullable().references('id').inTable('use_cases')
      table
        .integer('integration_type_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('integration_types')
      table.integer('icp_node_id').unsigned().nullable().references('id').inTable('icp_nodes')
      table.integer('contract_length_years').nullable()
      table.integer('waived_months').notNullable().defaultTo(0)
      table.string('partner_pr_code', 60).nullable()
      table
        .integer('funding_currency_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('currencies')
      table
        .integer('source_currency_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('currencies')
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
