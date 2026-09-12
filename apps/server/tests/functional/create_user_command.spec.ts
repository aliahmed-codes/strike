import { test } from '@japa/runner'
import ace from '@adonisjs/core/services/ace'
import User from '#models/user'

test.group('Ace: create:user command', () => {
  test('creates a user with valid flags', async ({ assert }) => {
    const command = await ace.exec('create:user', [
      '--email=new.user@example.com',
      '--first-name=New',
      '--last-name=User',
      '--password=password123',
      '--role=sales',
    ])

    assert.equal(command.exitCode, 0)
    const user = await User.findBy('email', 'new.user@example.com')
    assert.exists(user)
    assert.equal(user!.role, 'sales')
    assert.isTrue(user!.isActive)
    assert.equal(user!.timezone, 'UTC')
  })

  test('fails when the email already exists', async ({ assert }) => {
    await User.create({
      firstName: 'Existing',
      lastName: 'User',
      email: 'dup@example.com',
      password: 'password123',
      role: 'sales',
    })

    const command = await ace.exec('create:user', [
      '--email=dup@example.com',
      '--first-name=Dup',
      '--last-name=User',
      '--password=password123',
      '--role=sales',
    ])

    assert.equal(command.exitCode, 1)
  })

  test('fails with invalid input', async ({ assert }) => {
    const command = await ace.exec('create:user', [
      '--email=not-an-email',
      '--first-name=X',
      '--last-name=Y',
      '--password=123',
      '--role=sales',
    ])

    assert.equal(command.exitCode, 1)
  })

  test('fails with an unknown role', async ({ assert }) => {
    const command = await ace.exec('create:user', [
      '--email=x@example.com',
      '--first-name=X',
      '--last-name=Y',
      '--password=password123',
      '--role=superadmin',
    ])

    assert.equal(command.exitCode, 1)
  })
})
