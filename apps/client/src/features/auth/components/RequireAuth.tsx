import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useMe } from '../api/useMe'
import { getToken } from '@/lib/token-storage'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isLoading, isError } = useMe()

  if (!getToken() || isError) {
    return <Navigate to="/login" replace />
  }

  if (isLoading || !user) {
    return null
  }

  return <>{children}</>
}
