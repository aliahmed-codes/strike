import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/** One cell of the 3x3 ICP-sensitivity x region-pressure fee-adjustment grid. */
export default class DecisionMatrixEntry extends BaseModel {
  static table = 'decision_matrix'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare icpSensitivity: 'High' | 'Medium' | 'Low'

  @column()
  declare regionPressure: 'High' | 'Medium' | 'Low'

  @column()
  declare pricingDecision: string

  @column()
  declare feeAdjustmentPercent: number

  @column()
  declare fxSpreadAdjustmentBps: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
