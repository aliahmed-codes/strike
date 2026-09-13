import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCreateQuote, useQuote, useUpdateQuote } from '../api/useQuotes'
import { useQuoteWorkspaceStore } from '../store/useQuoteWorkspaceStore'
import { SummaryTab } from '../components/SummaryTab'
import { PricingTab } from '../components/PricingTab'
import { PlaceholderTab } from '../components/PlaceholderTab'

export function QuoteEditorPage() {
  const { tabKey } = useParams<{ tabKey: string }>()
  const navigate = useNavigate()

  const tab = useQuoteWorkspaceStore((state) => state.tabs.find((t) => t.key === tabKey))
  const isDirty = useQuoteWorkspaceStore((state) => (tabKey ? state.isDirty(tabKey) : false))
  const pendingFields = useQuoteWorkspaceStore((state) => (tabKey ? state.pendingFields[tabKey] : undefined))
  const markSaved = useQuoteWorkspaceStore((state) => state.markSaved)

  const { data, isLoading } = useQuote(tab?.quoteId ?? null)
  const createQuote = useCreateQuote()
  const updateQuote = useUpdateQuote(tab?.quoteId ?? null)

  useEffect(() => {
    if (!tab) navigate('/', { replace: true })
  }, [tab, navigate])

  if (!tab || !tabKey) return null

  const quote = data?.quote

  function handleSave() {
    if (!tabKey) return
    const fields = pendingFields ?? {}

    if (tab!.quoteId === null) {
      createQuote.mutate(
        { name: 'New Pricing Request', ...fields },
        {
          onSuccess: (created) => markSaved(tabKey, created.id, created.name),
        }
      )
    } else {
      updateQuote.mutate(fields, {
        onSuccess: (updated) => markSaved(tabKey, updated.id, updated.name),
      })
    }
  }

  const isSaving = createQuote.isPending || updateQuote.isPending

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tab.label}</h1>
          <p className="text-sm text-muted-foreground">Status: {quote?.status ?? 'Draft'}</p>
          {quote && (
            <p className="text-xs text-muted-foreground">
              Owner: {quote.owner ? `${quote.owner.firstName} ${quote.owner.lastName} (${quote.owner.email})` : '—'}
              {' · '}
              Created: {new Date(quote.createdAt).toLocaleString()} · Updated:{' '}
              {new Date(quote.updatedAt).toLocaleString()}
            </p>
          )}
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save Draft'}
        </Button>
      </div>

      {isDirty && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="size-4" />
          You have unsaved changes
        </div>
      )}

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="setup-fee">Setup Fee</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="pnl">P&L</TabsTrigger>
          <TabsTrigger value="quoting-summary">Quoting Summary</TabsTrigger>
          <TabsTrigger value="legal">Legal</TabsTrigger>
          <TabsTrigger value="approvals">Approvals</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4">
          <SummaryTab
            tabKey={tabKey}
            quote={quote}
            totals={data?.totals}
            isLoading={isLoading && tab.quoteId !== null}
          />
        </TabsContent>
        <TabsContent value="setup-fee" className="mt-4">
          <PlaceholderTab title="Setup Fee" />
        </TabsContent>
        <TabsContent value="pricing" className="mt-4">
          <PricingTab tabKey={tabKey} quoteId={tab.quoteId} />
        </TabsContent>
        <TabsContent value="pnl" className="mt-4">
          <PlaceholderTab title="P&L" />
        </TabsContent>
        <TabsContent value="quoting-summary" className="mt-4">
          <PlaceholderTab title="Quoting Summary" />
        </TabsContent>
        <TabsContent value="legal" className="mt-4">
          <PlaceholderTab title="Legal" />
        </TabsContent>
        <TabsContent value="approvals" className="mt-4">
          <PlaceholderTab title="Approvals" />
        </TabsContent>
      </Tabs>
    </div>
  )
}
