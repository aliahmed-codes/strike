import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import { loginValidator } from '#validators/auth'

function serializeUser(user: User) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
  }
}

export default class AuthController {
  async login({ request, response }: HttpContext) {
    const { email, password } = await request.validateUsing(loginValidator)

    const user = await User.verifyCredentials(email, password)
    if (!user.isActive) {
      return response.forbidden({ message: 'This account has been deactivated' })
    }

    const token = await User.accessTokens.create(user, ['*'], { expiresIn: '30 days' })

    return response.ok({
      user: serializeUser(user),
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
    return serializeUser(auth.getUserOrFail())
  }
}
