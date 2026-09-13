import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import QuoteSetupFee from '#models/quote_setup_fee'

export default class QuoteMcfBlockFee extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare quoteSetupFeeId: number

  @belongsTo(() => QuoteSetupFee)
  declare quoteSetupFee: BelongsTo<typeof QuoteSetupFee>

  /** 'y1_h1' | 'y1_h2' | 'y2' | 'y3' ... */
  @column()
  declare blockKey: string

  @column()
  declare commitmentFee: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
