import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import QuoteApproval from '#models/quote_approval'
import User from '#models/user'

export type QuoteApprovalEventType =
  'submitted' | 'approved' | 'rejected' | 'auto_approved' | 'withdrawn'

export default class QuoteApprovalHistory extends BaseModel {
  // Lucid would otherwise pluralize "history" to the wrong word ("historys");
  // the migration uses the correct English plural table name.
  static table = 'quote_approval_histories'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare approvalId: number

  @belongsTo(() => QuoteApproval, { foreignKey: 'approvalId' })
  declare approval: BelongsTo<typeof QuoteApproval>

  @column()
  declare actorId: number | null

  @belongsTo(() => User, { foreignKey: 'actorId' })
  declare actor: BelongsTo<typeof User>

  @column()
  declare eventType: QuoteApprovalEventType

  @column()
  declare comment: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
