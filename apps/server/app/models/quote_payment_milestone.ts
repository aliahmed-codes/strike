import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import QuoteSetupFee from '#models/quote_setup_fee'

export default class QuotePaymentMilestone extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare quoteSetupFeeId: number

  @belongsTo(() => QuoteSetupFee)
  declare quoteSetupFee: BelongsTo<typeof QuoteSetupFee>

  @column()
  declare milestone: string

  @column()
  declare percentage: number

  @column()
  declare description: string | null

  @column()
  declare sortOrder: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
