import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import Country from '#models/country'
import UseCase from '#models/use_case'
import IntegrationType from '#models/integration_type'
import IcpNode from '#models/icp_node'
import Currency from '#models/currency'
import QuoteCorridor from '#models/quote_corridor'

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

  @column()
  declare useCaseId: number | null

  @belongsTo(() => UseCase)
  declare useCase: BelongsTo<typeof UseCase>

  @column()
  declare integrationTypeId: number | null

  @belongsTo(() => IntegrationType)
  declare integrationType: BelongsTo<typeof IntegrationType>

  @column()
  declare icpNodeId: number | null

  @belongsTo(() => IcpNode)
  declare icpNode: BelongsTo<typeof IcpNode>

  @column()
  declare contractLengthYears: number | null

  @column()
  declare waivedMonths: number

  @column()
  declare partnerPrCode: string | null

  @column()
  declare fundingCurrencyId: number | null

  @belongsTo(() => Currency, { foreignKey: 'fundingCurrencyId' })
  declare fundingCurrency: BelongsTo<typeof Currency>

  @column()
  declare sourceCurrencyId: number | null

  @belongsTo(() => Currency, { foreignKey: 'sourceCurrencyId' })
  declare sourceCurrency: BelongsTo<typeof Currency>

  @hasMany(() => QuoteCorridor)
  declare corridors: HasMany<typeof QuoteCorridor>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
