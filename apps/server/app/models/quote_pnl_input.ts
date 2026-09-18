import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Quote from '#models/quote'

export default class QuotePnlInput extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare quoteId: number

  @belongsTo(() => Quote)
  declare quote: BelongsTo<typeof Quote>

  // Explicit columnName: Lucid's automatic camelCase-to-snake_case would
  // produce "year_2_growth_pct" (splitting before the digit), but the actual
  // migrated column is "year2_growth_pct" — same quirk as Quote's icpLevel1Id.
  @column({ columnName: 'year2_growth_pct' })
  declare year2GrowthPct: number

  @column({ columnName: 'year3_growth_pct' })
  declare year3GrowthPct: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
