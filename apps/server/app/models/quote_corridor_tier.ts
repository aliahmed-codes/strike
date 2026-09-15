import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import QuoteCorridor from '#models/quote_corridor'

export default class QuoteCorridorTier extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare quoteCorridorId: number

  @belongsTo(() => QuoteCorridor)
  declare quoteCorridor: BelongsTo<typeof QuoteCorridor>

  @column()
  declare tierNumber: number

  // Inputs
  @column()
  declare yearlyVolumeUsd: number

  @column()
  declare fixedFeeUsd: number

  @column()
  declare variableFeePct: number

  @column()
  declare appliedFxSpread: number

  // Outputs — written only by QuotePricingService
  @column()
  declare yearlyTransactions: number | null

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
  declare grossMarginPct: number | null

  @column()
  declare takeRatePct: number | null

  @column()
  declare needsApproval: boolean

  @column({
    prepare: (value: string[] | null) => (value ? JSON.stringify(value) : null),
  })
  declare approvalReasons: string[] | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
