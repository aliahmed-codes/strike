import { BaseSchema } from '@adonisjs/lucid/schema'
import db from '@adonisjs/lucid/services/db'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('first_name', 100).nullable()
      table.string('last_name', 100).nullable()
      table.boolean('is_active').notNullable().defaultTo(true)
      table.string('phone', 20).nullable()
      table.string('timezone', 50).notNullable().defaultTo('UTC')
    })

    const users = await db.from(this.tableName).select('id', 'full_name')
    for (const user of users) {
      const parts = String(user.full_name ?? '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
      await db
        .from(this.tableName)
        .where('id', user.id)
        .update({
          first_name: parts[0] ?? 'Unknown',
          last_name: parts.slice(1).join(' ') || 'Unknown',
        })
    }

    this.schema.alterTable(this.tableName, (table) => {
      table.string('first_name', 100).notNullable().alter()
      table.string('last_name', 100).notNullable().alter()
      table.dropColumn('full_name')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('full_name').nullable()
    })

    const users = await db.from(this.tableName).select('id', 'first_name', 'last_name')
    for (const user of users) {
      await db
        .from(this.tableName)
        .where('id', user.id)
        .update({ full_name: `${user.first_name} ${user.last_name}`.trim() })
    }

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('first_name')
      table.dropColumn('last_name')
      table.dropColumn('is_active')
      table.dropColumn('phone')
      table.dropColumn('timezone')
    })
  }
}
