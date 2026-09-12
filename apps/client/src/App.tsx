import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function App() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>PriceFRAME</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Monorepo scaffold is up. Start building features in{' '}
            <code>apps/client/src/features</code>.
          </p>
          <Button>It works</Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default App
