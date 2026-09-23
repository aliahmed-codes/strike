import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Quote from '#models/quote'
import User, { type ApprovalGroup } from '#models/user'
import QuoteApprovalHistory from '#models/quote_approval_history'

export type QuoteApprovalStatus =
  'pending' | 'approved' | 'rejected' | 'auto_approved' | 'withdrawn'

export interface QuoteApprovalSnapshotReason {
  corridorId: number | null
  country: string | null
  service: string | null
  transactionType: string | null
  reason: string
}

export default class QuoteApproval extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare quoteId: number

  @belongsTo(() => Quote)
  declare quote: BelongsTo<typeof Quote>

  @column()
  declare group: ApprovalGroup | null

  @column()
  declare targetUserId: number | null

  @belongsTo(() => User, { foreignKey: 'targetUserId' })
  declare targetUser: BelongsTo<typeof User>

  @column()
  declare status: QuoteApprovalStatus

  @column()
  declare reason: string

  @column()
  declare businessImpact: string | null

  @column()
  declare valueImpact: string | null

  @column({
    prepare: (value: QuoteApprovalSnapshotReason[]) => JSON.stringify(value ?? []),
  })
  declare snapshotReasons: QuoteApprovalSnapshotReason[]

  @column()
  declare initiatorId: number | null

  @belongsTo(() => User, { foreignKey: 'initiatorId' })
  declare initiator: BelongsTo<typeof User>

  @column()
  declare decidedById: number | null

  @belongsTo(() => User, { foreignKey: 'decidedById' })
  declare decidedBy: BelongsTo<typeof User>

  @column()
  declare decisionComment: string | null

  @hasMany(() => QuoteApprovalHistory, { foreignKey: 'approvalId' })
  declare history: HasMany<typeof QuoteApprovalHistory>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
