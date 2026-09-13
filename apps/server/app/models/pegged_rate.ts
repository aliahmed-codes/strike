import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Currency from '#models/currency'

export default class PeggedRate extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare currencyId: number

  @belongsTo(() => Currency)
  declare currency: BelongsTo<typeof Currency>

  @column()
  declare rateToUsd: number

  @column.date()
  declare effectiveFrom: DateTime

  @column.date()
  declare effectiveTo: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
