import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useQuotesList } from '../api/useQuotes'
import { useQuoteWorkspaceStore } from '../store/useQuoteWorkspaceStore'

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  closed: 'bg-muted text-muted-foreground',
}

export function QuotesListPage() {
  const navigate = useNavigate()
  const { data: quotes, isLoading } = useQuotesList()
  const openNewDraftTab = useQuoteWorkspaceStore((state) => state.openNewDraftTab)
  const openQuoteTab = useQuoteWorkspaceStore((state) => state.openQuoteTab)

  function handleCreate() {
    const key = openNewDraftTab()
    navigate(`/quotes/${key}`)
  }

  function handleOpen(id: number, name: string) {
    const key = openQuoteTab(id, name)
    navigate(`/quotes/${key}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pricing Requests</h1>
          <p className="text-muted-foreground">All quotes you own</p>
        </div>
        <Button onClick={handleCreate}>New Pricing Request</Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : !quotes || quotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-24 text-center">
          <h2 className="text-lg font-semibold">No pricing requests yet</h2>
          <p className="text-sm text-muted-foreground">Create your first one to get started.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Corridors</th>
                <th className="px-4 py-3 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((quote) => (
                <tr
                  key={quote.id}
                  onClick={() => handleOpen(quote.id, quote.name)}
                  className="cursor-pointer border-b last:border-0 hover:bg-muted/50"
                >
                  <td className="px-4 py-3 font-medium">{quote.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[quote.status] ?? ''}`}
                    >
                      {quote.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{quote.corridorCount ?? 0}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(quote.updatedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
