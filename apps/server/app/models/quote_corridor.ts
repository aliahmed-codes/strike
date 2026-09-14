import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Quote from '#models/quote'
import Corridor from '#models/corridor'
import Currency from '#models/currency'

export default class QuoteCorridor extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare quoteId: number

  @belongsTo(() => Quote)
  declare quote: BelongsTo<typeof Quote>

  @column()
  declare corridorId: number

  @belongsTo(() => Corridor)
  declare corridor: BelongsTo<typeof Corridor>

  @column()
  declare fundingCurrencyId: number | null

  @belongsTo(() => Currency, { foreignKey: 'fundingCurrencyId' })
  declare fundingCurrency: BelongsTo<typeof Currency>

  // Inputs
  @column()
  declare atvUsd: number

  @column()
  declare yearlyVolumeUsd: number

  @column()
  declare yearlyTransactions: number

  @column()
  declare fixedFeeUsd: number

  @column()
  declare variableFeePct: number

  @column()
  declare appliedFxSpread: number

  @column()
  declare feeDiscountPct: number

  // Outputs — written only by QuotePricingService
  @column()
  declare revenueFee: number | null

  @column()
  declare fxMargin: number | null

  @column()
  declare fxMarginPct: number | null

  @column()
  declare marginFee: number | null

  @column()
  declare totalRevenue: number | null

  @column()
  declare totalMargin: number | null

  @column()
  declare marginPct: number | null

  @column()
  declare grossMarginPct: number | null

  @column()
  declare takeRatePct: number | null

  @column.dateTime()
  declare computedAt: DateTime | null

  @column()
  declare needsApproval: boolean

  @column({
    prepare: (value: string[] | null) => (value ? JSON.stringify(value) : null),
  })
  declare approvalReasons: string[] | null

  @column()
  declare needsFinancialApproval: boolean

  @column({
    prepare: (value: string[] | null) => (value ? JSON.stringify(value) : null),
  })
  declare financialApprovalReasons: string[] | null

  @column()
  declare needsNetworkApproval: boolean

  @column({
    prepare: (value: string[] | null) => (value ? JSON.stringify(value) : null),
  })
  declare networkApprovalReasons: string[] | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
