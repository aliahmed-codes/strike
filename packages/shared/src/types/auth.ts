export interface AuthUser {
  id: number
  firstName: string
  lastName: string
  email: string
  role: 'admin' | 'sales' | 'viewer'
}

export interface LoginPayload {
  email: string
  password: string
}

export interface AuthSession {
  user: AuthUser
  token: string
  expiresAt: string | null
}
