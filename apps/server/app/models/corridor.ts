import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Country from '#models/country'
import Currency from '#models/currency'

export default class Corridor extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare countryId: number

  @belongsTo(() => Country)
  declare country: BelongsTo<typeof Country>

  @column()
  declare serviceCode: string

  @column()
  declare transactionTypeCode: string

  @column()
  declare payerCode: string

  @column()
  declare payoutCurrencyId: number

  @belongsTo(() => Currency, { foreignKey: 'payoutCurrencyId' })
  declare payoutCurrency: BelongsTo<typeof Currency>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
