import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import { loginValidator, registerValidator } from '#validators/auth'

export default class AuthController {
  async register({ request, response }: HttpContext) {
    const { fullName, email, password } = await request.validateUsing(registerValidator)

    const existing = await User.findBy('email', email)
    if (existing) {
      return response.conflict({ message: 'An account with this email already exists' })
    }

    const user = await User.create({ fullName, email, password, role: 'sales' })
    const token = await User.accessTokens.create(user, ['*'], { expiresIn: '30 days' })

    return response.created({
      user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role },
      token: token.value!.release(),
      expiresAt: token.expiresAt ? token.expiresAt.toISOString() : null,
    })
  }

  async login({ request, response }: HttpContext) {
    const { email, password } = await request.validateUsing(loginValidator)

    const user = await User.verifyCredentials(email, password)
    const token = await User.accessTokens.create(user, ['*'], { expiresIn: '30 days' })

    return response.ok({
      user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role },
      token: token.value!.release(),
      expiresAt: token.expiresAt ? token.expiresAt.toISOString() : null,
    })
  }

  async logout({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()

    await User.accessTokens.delete(user, user.currentAccessToken!.identifier)

    return response.noContent()
  }

  async me({ auth }: HttpContext) {
    const user = auth.getUserOrFail()
    return { id: user.id, fullName: user.fullName, email: user.email, role: user.role }
  }
}
