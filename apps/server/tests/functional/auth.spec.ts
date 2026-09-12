import { test } from '@japa/runner'
import User from '#models/user'

const validCredentials = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  password: 'password123',
}

test.group('Auth: login', (group) => {
  group.each.setup(async () => {
    await User.create({ ...validCredentials, role: 'sales' })
  })

  test('logs in with correct credentials', async ({ client, assert }) => {
    const response = await client.post('/auth/login').json({
      email: validCredentials.email,
      password: validCredentials.password,
    })

    response.assertStatus(200)
    assert.isString(response.body().token)
  })

  test('rejects login with the wrong password', async ({ client }) => {
    const response = await client.post('/auth/login').json({
      email: validCredentials.email,
      password: 'wrong-password',
    })

    response.assertStatus(400)
  })

  test('rejects login for an unknown email', async ({ client }) => {
    const response = await client.post('/auth/login').json({
      email: 'nobody@example.com',
      password: 'password123',
    })

    response.assertStatus(400)
  })

  test('rejects login for a deactivated account', async ({ client }) => {
    await User.create({
      ...validCredentials,
      email: 'inactive@example.com',
      role: 'sales',
      isActive: false,
    })

    const response = await client.post('/auth/login').json({
      email: 'inactive@example.com',
      password: validCredentials.password,
    })

    response.assertStatus(403)
  })
})

test.group('Auth: me + logout', (group) => {
  group.each.setup(async () => {
    await User.create({ ...validCredentials, role: 'sales' })
  })

  test('rejects /me without a token', async ({ client }) => {
    const response = await client.get('/auth/me')

    response.assertStatus(401)
  })

  test('returns the current user for a valid token', async ({ client }) => {
    const login = await client.post('/auth/login').json({
      email: validCredentials.email,
      password: validCredentials.password,
    })
    const token = login.body().token as string

    const response = await client.get('/auth/me').header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    response.assertBodyContains({ email: validCredentials.email })
  })

  test('logout revokes the token so it can no longer be used', async ({ client }) => {
    const login = await client.post('/auth/login').json({
      email: validCredentials.email,
      password: validCredentials.password,
    })
    const token = login.body().token as string

    const logoutResponse = await client
      .post('/auth/logout')
      .header('Authorization', `Bearer ${token}`)
    logoutResponse.assertStatus(204)

    const meResponse = await client.get('/auth/me').header('Authorization', `Bearer ${token}`)
    meResponse.assertStatus(401)
  })
})
