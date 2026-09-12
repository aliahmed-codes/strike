export interface AuthUser {
  id: number
  fullName: string
  email: string
  role: 'admin' | 'sales' | 'viewer'
}

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  fullName: string
  email: string
  password: string
}

export interface AuthSession {
  user: AuthUser
  token: string
  expiresAt: string | null
}
