import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import QuoteSetupFee from '#models/quote_setup_fee'
import Currency from '#models/currency'

export default class QuoteOtherFee extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare quoteSetupFeeId: number

  @belongsTo(() => QuoteSetupFee)
  declare quoteSetupFee: BelongsTo<typeof QuoteSetupFee>

  @column()
  declare conceptCode: string

  @column()
  declare amount: number

  @column()
  declare isPercentage: boolean

  @column()
  declare currencyId: number | null

  @belongsTo(() => Currency)
  declare currency: BelongsTo<typeof Currency>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
