import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import QuoteSetupFee from '#models/quote_setup_fee'

export default class QuoteMcfPrincipalSlot extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare quoteSetupFeeId: number

  @belongsTo(() => QuoteSetupFee)
  declare quoteSetupFee: BelongsTo<typeof QuoteSetupFee>

  @column()
  declare slotIndex: number

  @column()
  declare label: string

  @column()
  declare startMonth: number

  @column()
  declare endMonth: number | null

  @column()
  declare monthlyPrincipal: number

  @column()
  declare ratePct: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
