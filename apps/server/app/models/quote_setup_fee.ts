import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Quote from '#models/quote'
import QuotePaymentMilestone from '#models/quote_payment_milestone'
import QuoteMcfPrincipalSlot from '#models/quote_mcf_principal_slot'
import QuoteMcfBlockFee from '#models/quote_mcf_block_fee'
import QuoteOtherFee from '#models/quote_other_fee'

export default class QuoteSetupFee extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare quoteId: number

  @belongsTo(() => Quote)
  declare quote: BelongsTo<typeof Quote>

  @column()
  declare feeType: 'setup' | 'network'

  @column()
  declare quotedPrice: number

  @column()
  declare paymentSchedule: 'full' | 'custom'

  @column()
  declare joiningFeeBillingType: 'at_signing' | 'non_standard'

  @column()
  declare mcfType: 'standard' | 'principal'

  @column()
  declare mcfBillingStart: 'at_signing' | 'at_go_live' | 'non_standard'

  @column()
  declare standardCommitmentFee: number

  @column()
  declare commitmentFeeDiscountPct: number

  @column()
  declare waivedMonths: number

  @column()
  declare rebateIncentive: boolean

  @column()
  declare rebateType: 'volume' | 'revenue' | 'transaction_count' | 'other' | null

  // Backend-computed, never trusted from the client — same pattern as quote_corridors.
  @column()
  declare needsApproval: boolean

  @column({
    prepare: (value: string[] | null) => (value ? JSON.stringify(value) : null),
  })
  declare approvalReasons: string[] | null

  @column.dateTime()
  declare computedAt: DateTime | null

  @hasMany(() => QuotePaymentMilestone, { foreignKey: 'quoteSetupFeeId' })
  declare paymentMilestones: HasMany<typeof QuotePaymentMilestone>

  @hasMany(() => QuoteMcfPrincipalSlot, { foreignKey: 'quoteSetupFeeId' })
  declare mcfPrincipalSlots: HasMany<typeof QuoteMcfPrincipalSlot>

  @hasMany(() => QuoteMcfBlockFee, { foreignKey: 'quoteSetupFeeId' })
  declare mcfBlockFees: HasMany<typeof QuoteMcfBlockFee>

  @hasMany(() => QuoteOtherFee, { foreignKey: 'quoteSetupFeeId' })
  declare otherFees: HasMany<typeof QuoteOtherFee>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
