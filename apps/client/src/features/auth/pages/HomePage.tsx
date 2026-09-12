import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useLogout } from '../api/useLogout'
import { useMe } from '../api/useMe'

export function HomePage() {
  const { data: user } = useMe()
  const logout = useLogout()

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>STRIKE</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Logged in as{' '}
            <span className="text-foreground">
              {user?.firstName} {user?.lastName}
            </span>{' '}
            ({user?.email}) — role: {user?.role}
          </p>
          <Button
            variant="outline"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            {logout.isPending ? 'Logging out…' : 'Log out'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
