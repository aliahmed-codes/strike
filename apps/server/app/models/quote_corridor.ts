import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Quote from '#models/quote'
import Corridor from '#models/corridor'
import Currency from '#models/currency'
import QuoteCorridorTier from '#models/quote_corridor_tier'

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

  /**
   * False = `fixedFeeUsd` still follows the live Market-Based Pricing (MBP)
   * recommendation and gets recomputed on every save. True = a human typed
   * their own value into the Fixed Fee cell, so it no longer auto-follows
   * MBP even if the quote's Sending Partner Region/ICP category changes
   * later. Flips to true the moment a save actually changes `fixedFeeUsd`
   * away from what MBP+catalog would currently produce.
   */
  @column()
  declare fixedFeeManuallySet: boolean

  @column()
  declare variableFeePct: number

  @column()
  declare appliedFxSpread: number

  @column()
  declare feeDiscountPct: number

  @column()
  declare pricingModel: 'standard' | 'tiered'

  // Per-row overrides of the corridor catalog's own master data — null
  // means "use the catalog value" (see corridor_pricing_math.ts).
  @column()
  declare fxSourceOverride: string | null

  @column()
  declare treasuryFxCostSpreadOverride: number | null

  @column()
  declare costFixedUsdOverride: number | null

  @column()
  declare costVariablePctOverride: number | null

  @hasMany(() => QuoteCorridorTier)
  declare tiers: HasMany<typeof QuoteCorridorTier>

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
  declare marginFeePct: number | null

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

  @column.dateTime()
  declare deletedAt: DateTime | null

  static active = scope((query) => {
    query.whereNull('deleted_at')
  })

  /** The one membership rule official P&L, Summary and Legal share: saved, not deleted, positive volume, priced. */
  static priced = scope((query) => {
    query.whereNull('deleted_at').where('yearly_volume_usd', '>', 0).whereNotNull('total_revenue')
  })
}
