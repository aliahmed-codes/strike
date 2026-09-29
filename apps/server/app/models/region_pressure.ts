import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Region from '#models/region'

export default class RegionPressure extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare regionId: number

  @belongsTo(() => Region)
  declare region: BelongsTo<typeof Region>

  /** Wildcard-capable, e.g. "B2B" or "C2X/B2C" — see `matchesTransactionType` in `@strike/shared`. */
  @column()
  declare transactionType: string

  @column()
  declare pressureLevel: 'High' | 'Medium' | 'Low'

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
