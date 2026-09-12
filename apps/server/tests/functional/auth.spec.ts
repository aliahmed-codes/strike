import { test } from '@japa/runner'
import User from '#models/user'

const validRegisterPayload = {
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'password123',
}

test.group('Auth: register', () => {
  test('registers a new user and returns a token', async ({ client, assert }) => {
    const response = await client.post('/auth/register').json(validRegisterPayload)

    response.assertStatus(201)
    response.assertBodyContains({
      user: {
        fullName: 'Ada Lovelace',
        email: 'ada@example.com',
        role: 'sales',
      },
    })
    assert.isString(response.body().token)
    assert.notProperty(response.body().user, 'password')
  })

  test('rejects registration with an already-used email', async ({ client }) => {
    await User.create({ ...validRegisterPayload, role: 'sales' })

    const response = await client.post('/auth/register').json(validRegisterPayload)

    response.assertStatus(409)
  })

  test('rejects registration with invalid input', async ({ client }) => {
    const response = await client
      .post('/auth/register')
      .json({ fullName: '', email: 'not-an-email', password: '123' })

    response.assertStatus(422)
  })
})

test.group('Auth: login', (group) => {
  group.each.setup(async () => {
    await User.create({ ...validRegisterPayload, role: 'sales' })
  })

  test('logs in with correct credentials', async ({ client, assert }) => {
    const response = await client.post('/auth/login').json({
      email: validRegisterPayload.email,
      password: validRegisterPayload.password,
    })

    response.assertStatus(200)
    assert.isString(response.body().token)
  })

  test('rejects login with the wrong password', async ({ client }) => {
    const response = await client.post('/auth/login').json({
      email: validRegisterPayload.email,
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
})

test.group('Auth: me + logout', (group) => {
  group.each.setup(async () => {
    await User.create({ ...validRegisterPayload, role: 'sales' })
  })

  test('rejects /me without a token', async ({ client }) => {
    const response = await client.get('/auth/me')

    response.assertStatus(401)
  })

  test('returns the current user for a valid token', async ({ client }) => {
    const login = await client.post('/auth/login').json({
      email: validRegisterPayload.email,
      password: validRegisterPayload.password,
    })
    const token = login.body().token as string

    const response = await client.get('/auth/me').header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    response.assertBodyContains({ email: validRegisterPayload.email })
  })

  test('logout revokes the token so it can no longer be used', async ({ client }) => {
    const login = await client.post('/auth/login').json({
      email: validRegisterPayload.email,
      password: validRegisterPayload.password,
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
