import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import IcpNode from '#models/icp_node'

export default class IcpSensitivity extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  // Lucid's default camelCase->snake_case would read "L1" as "L"+"1" and
  // produce "icp_node_id_l_1" — the real migrated column is "icp_node_id_l1".
  @column({ columnName: 'icp_node_id_l1' })
  declare icpNodeIdL1: number | null

  @belongsTo(() => IcpNode, { foreignKey: 'icpNodeIdL1' })
  declare l1Node: BelongsTo<typeof IcpNode>

  @column({ columnName: 'icp_node_id_l2' })
  declare icpNodeIdL2: number | null

  @belongsTo(() => IcpNode, { foreignKey: 'icpNodeIdL2' })
  declare l2Node: BelongsTo<typeof IcpNode>

  @column({ columnName: 'icp_node_id_l3' })
  declare icpNodeIdL3: number | null

  @belongsTo(() => IcpNode, { foreignKey: 'icpNodeIdL3' })
  declare l3Node: BelongsTo<typeof IcpNode>

  @column()
  declare transactionType: string

  @column()
  declare sensitivity: 'High' | 'Medium' | 'Low'

  @column()
  declare description: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
