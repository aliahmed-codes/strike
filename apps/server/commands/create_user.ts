import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import User from '#models/user'
import { createUserValidator } from '#validators/auth'

/**
 * There is no public self-service registration in this app — accounts are
 * created by an admin (eventually via the admin dashboard's user
 * management UI, see FEATURES.md). Until that UI exists, this command is
 * the interim way to create a user for local development or a demo.
 */
export default class CreateUser extends BaseCommand {
  static commandName = 'create:user'
  static description = 'Create a user account (interim stand-in for admin-created users)'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.string({ description: 'Email address' })
  declare email?: string

  @flags.string({ description: 'First name' })
  declare firstName?: string

  @flags.string({ description: 'Last name' })
  declare lastName?: string

  @flags.string({ description: 'Password (min 8 characters)' })
  declare password?: string

  @flags.string({ description: 'Role: admin, sales, or viewer (default: sales)' })
  declare role?: string

  @flags.string({ description: 'Phone number (optional)' })
  declare phone?: string

  @flags.string({ description: 'Timezone, e.g. UTC (default: UTC)' })
  declare timezone?: string

  async run() {
    const email = this.email ?? (await this.prompt.ask('Email address'))
    const firstName = this.firstName ?? (await this.prompt.ask('First name'))
    const lastName = this.lastName ?? (await this.prompt.ask('Last name'))
    const password = this.password ?? (await this.prompt.secure('Password (min 8 characters)'))
    const role: string =
      this.role ??
      (await this.prompt.choice('Role', ['admin', 'sales', 'viewer'], { default: 'sales' })) ??
      'sales'

    if (!['admin', 'sales', 'viewer'].includes(role)) {
      this.logger.error(`Invalid role "${role}". Must be one of: admin, sales, viewer.`)
      this.exitCode = 1
      return
    }

    let validated: {
      email: string
      firstName: string
      lastName: string
      password: string
      phone?: string
      timezone?: string
    }
    try {
      validated = await createUserValidator.validate({
        email,
        firstName,
        lastName,
        password,
        phone: this.phone,
        timezone: this.timezone,
      })
    } catch (error) {
      this.logger.error('Invalid input:')
      for (const issue of error.messages ?? []) {
        this.logger.error(`  - ${issue.message}`)
      }
      this.exitCode = 1
      return
    }

    const existing = await User.findBy('email', validated.email)
    if (existing) {
      this.logger.error(`A user with email "${validated.email}" already exists.`)
      this.exitCode = 1
      return
    }

    const user = await User.create({
      ...validated,
      role: role as 'admin' | 'sales' | 'viewer',
      timezone: validated.timezone ?? 'UTC',
    })
    this.logger.success(
      `Created user #${user.id} — ${user.email} (${user.firstName} ${user.lastName}, role: ${user.role})`
    )
  }
}
