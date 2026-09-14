import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany, hasOne, manyToMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, HasOne, ManyToMany } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import Country from '#models/country'
import UseCase from '#models/use_case'
import IntegrationType from '#models/integration_type'
import IcpNode from '#models/icp_node'
import Currency from '#models/currency'
import QuoteCorridor from '#models/quote_corridor'
import QuoteSetupFee from '#models/quote_setup_fee'

export type QuoteStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'closed'

export default class Quote extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare status: QuoteStatus

  @column()
  declare ownerId: number

  @belongsTo(() => User, { foreignKey: 'ownerId' })
  declare owner: BelongsTo<typeof User>

  @column()
  declare opportunityType: string | null

  @column()
  declare partnerCountryId: number | null

  @belongsTo(() => Country, { foreignKey: 'partnerCountryId' })
  declare partnerCountry: BelongsTo<typeof Country>

  @manyToMany(() => UseCase, { pivotTable: 'quote_use_cases' })
  declare useCases: ManyToMany<typeof UseCase>

  @column()
  declare integrationTypeId: number | null

  @belongsTo(() => IntegrationType)
  declare integrationType: BelongsTo<typeof IntegrationType>

  // Explicit columnName: Lucid's automatic camelCase-to-snake_case would
  // produce "icp_level_1_id" (splitting before the digit), but the actual
  // migrated column is "icp_level1_id".
  @column({ columnName: 'icp_level1_id' })
  declare icpLevel1Id: number | null

  @belongsTo(() => IcpNode, { foreignKey: 'icpLevel1Id' })
  declare icpLevel1: BelongsTo<typeof IcpNode>

  @column({ columnName: 'icp_level2_id' })
  declare icpLevel2Id: number | null

  @belongsTo(() => IcpNode, { foreignKey: 'icpLevel2Id' })
  declare icpLevel2: BelongsTo<typeof IcpNode>

  @column({ columnName: 'icp_level3_id' })
  declare icpLevel3Id: number | null

  @belongsTo(() => IcpNode, { foreignKey: 'icpLevel3Id' })
  declare icpLevel3: BelongsTo<typeof IcpNode>

  @column()
  declare contractLengthYears: number | null

  @column()
  declare partnerPrCode: string | null

  @column()
  declare showFxSourceInContract: boolean

  @column()
  declare showFxSpreadInContract: boolean

  @column()
  declare fxModel: string | null

  @column()
  declare selectedPricingStrategy: string | null

  @column()
  declare selectedFxPricing: string | null

  /** The default/primary funding currency — the full selectable set is `fundingCurrencies`. */
  @column()
  declare fundingCurrencyId: number | null

  @belongsTo(() => Currency, { foreignKey: 'fundingCurrencyId' })
  declare fundingCurrency: BelongsTo<typeof Currency>

  @manyToMany(() => Currency, {
    pivotTable: 'quote_funding_currencies',
    pivotForeignKey: 'quote_id',
    pivotRelatedForeignKey: 'currency_id',
  })
  declare fundingCurrencies: ManyToMany<typeof Currency>

  /** The default/primary source currency — the full selectable set is `sourceCurrencies`. */
  @column()
  declare sourceCurrencyId: number | null

  @belongsTo(() => Currency, { foreignKey: 'sourceCurrencyId' })
  declare sourceCurrency: BelongsTo<typeof Currency>

  @manyToMany(() => Currency, {
    pivotTable: 'quote_source_currencies',
    pivotForeignKey: 'quote_id',
    pivotRelatedForeignKey: 'currency_id',
  })
  declare sourceCurrencies: ManyToMany<typeof Currency>

  @column()
  declare defaultFeeCurrencyId: number | null

  @belongsTo(() => Currency, { foreignKey: 'defaultFeeCurrencyId' })
  declare defaultFeeCurrency: BelongsTo<typeof Currency>

  @hasMany(() => QuoteCorridor)
  declare corridors: HasMany<typeof QuoteCorridor>

  @hasOne(() => QuoteSetupFee)
  declare setupFee: HasOne<typeof QuoteSetupFee>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
