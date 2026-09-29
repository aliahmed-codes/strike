import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Country from '#models/country'
import Currency from '#models/currency'
import Region from '#models/region'
import IcpNode from '#models/icp_node'

export default class StrategicOverride extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare countryId: number | null

  @belongsTo(() => Country)
  declare country: BelongsTo<typeof Country>

  @column()
  declare currencyId: number | null

  @belongsTo(() => Currency)
  declare currency: BelongsTo<typeof Currency>

  @column()
  declare regionId: number | null

  @belongsTo(() => Region)
  declare region: BelongsTo<typeof Region>

  /** null = matches any transaction type; otherwise wildcard-capable, e.g. "C2C". */
  @column()
  declare transactionType: string | null

  // Real migrated columns are "icp_node_id_l1/l2/l3", not Lucid's default "icp_node_id_l_1" etc.
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

  @column({ prepare: (value: string[] | null) => (value ? JSON.stringify(value) : null) })
  declare sensitivities: ('High' | 'Medium' | 'Low')[] | null

  @column({ prepare: (value: string[] | null) => (value ? JSON.stringify(value) : null) })
  declare regionPressures: ('High' | 'Medium' | 'Low')[] | null

  @column()
  declare feeAdjustmentPercent: number | null

  @column()
  declare fxSpreadAdjustmentBps: number | null

  @column()
  declare fixedFeeUsd: number | null

  @column()
  declare fxSpread: number | null

  @column()
  declare minimumFxSpread: number | null

  @column()
  declare overrideMode: 'adjustment' | 'standard'

  @column()
  declare targetingMode: 'exact' | 'mbp'

  @column()
  declare reason: string | null

  @column()
  declare priority: number

  @column()
  declare isActive: boolean

  @column.dateTime()
  declare effectiveFrom: DateTime | null

  @column.dateTime()
  declare effectiveTo: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
