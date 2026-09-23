import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import type { AccessToken } from '@adonisjs/auth/access_tokens'

export type ApprovalGroup = 'network_team' | 'pricing_team' | 'csuite'

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email'],
  passwordColumnName: 'password',
})

export default class User extends compose(BaseModel, AuthFinder) {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare firstName: string

  @column()
  declare lastName: string

  @column()
  declare email: string

  @column({ serializeAs: null })
  declare password: string

  @column()
  declare role: 'admin' | 'sales' | 'viewer'

  @column()
  declare isActive: boolean

  @column()
  declare phone: string | null

  @column()
  declare timezone: string

  @column()
  declare approvalGroup: ApprovalGroup | null

  @column()
  declare managerId: number | null

  @belongsTo(() => User, { foreignKey: 'managerId' })
  declare manager: BelongsTo<typeof User>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  static accessTokens = DbAccessTokensProvider.forModel(User)
  currentAccessToken?: AccessToken
}
