import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import IcpNode from '#models/icp_node'

export default class GridFeeAdjustment extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare regionPressure: 'High' | 'Medium' | 'Low'

  @column()
  declare corridorTier: 'G10' | 'G20' | 'Exotic'

  // Real migrated column is "icp_node_id_l1", not Lucid's default "icp_node_id_l_1".
  @column({ columnName: 'icp_node_id_l1' })
  declare icpNodeIdL1: number

  @belongsTo(() => IcpNode, { foreignKey: 'icpNodeIdL1' })
  declare l1Node: BelongsTo<typeof IcpNode>

  /** Wildcard-capable, e.g. "B2B" — see `matchesTransactionType` in `@strike/shared`. */
  @column()
  declare transactionType: string

  @column()
  declare fixedFeeUsd: number

  @column()
  declare fxSpreadAdjustmentBps: number

  @column()
  declare minimumFxSpreadAdjustmentBps: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
