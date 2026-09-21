import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Quote from '#models/quote'
import User from '#models/user'

export default class QuoteFeeAnnexVersion extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare quoteId: number

  @belongsTo(() => Quote)
  declare quote: BelongsTo<typeof Quote>

  @column()
  declare version: number

  @column()
  declare name: string

  @column()
  declare content: string

  @column()
  declare modifiedByUserId: number | null

  @belongsTo(() => User, { foreignKey: 'modifiedByUserId' })
  declare modifiedBy: BelongsTo<typeof User>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
