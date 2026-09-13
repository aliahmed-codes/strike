import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Currency extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare isoCode3: string

  @column()
  declare name: string

  @column()
  declare decimalPlaces: number

  @column()
  declare isSource: boolean

  @column()
  declare isFunding: boolean

  @column()
  declare isPayout: boolean

  @column()
  declare isFee: boolean

  @column()
  declare isHard: boolean

  @column()
  declare isPegged: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
