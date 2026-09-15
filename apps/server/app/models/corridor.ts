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
  declare receivingPartner: string

  @column()
  declare payoutCurrencyId: number

  @belongsTo(() => Currency, { foreignKey: 'payoutCurrencyId' })
  declare payoutCurrency: BelongsTo<typeof Currency>

  @column()
  declare fxSource: string | null

  @column()
  declare treasuryFxCostSpread: number | null

  @column()
  declare costFixedUsd: number | null

  @column()
  declare costVariablePct: number | null

  @column()
  declare networkNeedApprovalRaw: string | null

  @column()
  declare internalRaw: string | null

  @column()
  declare centralBankRaw: string | null

  @column()
  declare stdFixedFeeUsd: number | null

  @column()
  declare stdVariableFeePct: number | null

  @column()
  declare historicalAtv: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
