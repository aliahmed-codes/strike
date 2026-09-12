import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import ThunesLogo from '@/assets/ThunesLogo.png'
import BuyFrameLogo from '@/assets/BF2026.png'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getApiErrorMessage } from '@/lib/api-error'
import { useLogin } from '../api/useLogin'
import { useMe } from '../api/useMe'

export function LoginPage() {
  const navigate = useNavigate()
  const { data: currentUser } = useMe()
  const login = useLogin()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  if (currentUser) {
    return <Navigate to="/" replace />
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    login.mutate(
      { email, password },
      { onSuccess: () => navigate('/', { replace: true }) }
    )
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 bg-background p-8">
      <img src={ThunesLogo} alt="Thunes" className="h-12 object-contain" />

      <Card className="w-full max-w-sm">
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {login.isError && (
              <p className="text-sm text-destructive">{getApiErrorMessage(login.error)}</p>
            )}
            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending ? 'Signing in…' : 'Sign in with Email'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex w-full max-w-sm items-center gap-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-sm text-muted-foreground">Powered by</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <img src={BuyFrameLogo} alt="BuyFRAME Logo" className="h-12 object-contain" />
    </div>
  )
}
