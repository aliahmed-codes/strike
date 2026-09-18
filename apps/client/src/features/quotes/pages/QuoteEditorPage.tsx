import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCreateQuote, useQuote, useUpdateQuote } from '../api/useQuotes'
import { useUpdateSetupFee } from '../api/useSetupFee'
import { useUpdateQuotePnl } from '../api/useQuotePnl'
import { useQuoteWorkspaceStore } from '../store/useQuoteWorkspaceStore'
import { SummaryTab } from '../components/SummaryTab'
import { PricingTab } from '../components/PricingTab'
import { SetupFeeTab } from '../components/SetupFeeTab'
import { PnlTab } from '../components/PnlTab'
import { PlaceholderTab } from '../components/PlaceholderTab'

export function QuoteEditorPage() {
  const { tabKey } = useParams<{ tabKey: string }>()
  const navigate = useNavigate()

  const tab = useQuoteWorkspaceStore((state) => state.tabs.find((t) => t.key === tabKey))
  const isDirty = useQuoteWorkspaceStore((state) => (tabKey ? state.isDirty(tabKey) : false))
  const pendingFields = useQuoteWorkspaceStore((state) => (tabKey ? state.pendingFields[tabKey] : undefined))
  const pendingSetupFee = useQuoteWorkspaceStore((state) =>
    tabKey ? state.pendingSetupFee[tabKey] : undefined
  )
  const pendingPnlInputs = useQuoteWorkspaceStore((state) =>
    tabKey ? state.pendingPnlInputs[tabKey] : undefined
  )
  const markSaved = useQuoteWorkspaceStore((state) => state.markSaved)
  const clearDraftSetupFee = useQuoteWorkspaceStore((state) => state.clearDraftSetupFee)
  const clearDraftPnlInputs = useQuoteWorkspaceStore((state) => state.clearDraftPnlInputs)
  const activeSubTab = useQuoteWorkspaceStore((state) => (tabKey ? state.activeSubTab[tabKey] : undefined))
  const setActiveSubTab = useQuoteWorkspaceStore((state) => state.setActiveSubTab)

  const { data, isLoading } = useQuote(tab?.quoteId ?? null)
  const createQuote = useCreateQuote()
  const updateQuote = useUpdateQuote(tab?.quoteId ?? null)
  // Setup Fee/P&L can only ever have a pending draft once the quote already
  // has a real id (both tabs are gated behind "Save the draft first" until
  // then), so these are always bound to the correct id by the time there's
  // anything of theirs left to save — the -1 sentinel here only covers the
  // render before that first save, when there's nothing to save anyway.
  const updateSetupFee = useUpdateSetupFee(tab?.quoteId ?? -1)
  const updatePnl = useUpdateQuotePnl(tab?.quoteId ?? -1)

  useEffect(() => {
    if (!tab) navigate('/', { replace: true })
  }, [tab, navigate])

  if (!tab || !tabKey) return null

  const quote = data?.quote
  // Same "pending edit wins over saved value" rule useQuoteFormField applies
  // on the Summary tab itself — Setup Fee/P&L must see the Opportunity
  // Type/Contract Length you just typed, not only what's already saved, or
  // a fresh quote's Other Fee defaults (which depend on Opportunity Type)
  // stay wrong until a save round-trip most users don't realize is required.
  const opportunityType = pendingFields?.opportunityType ?? quote?.opportunityType ?? null
  const contractLengthYears = pendingFields?.contractLengthYears ?? quote?.contractLengthYears ?? 1

  // A single "Save Draft" click saves the header, then Setup Fee, then P&L —
  // each independently (atomic per section): if Setup Fee fails validation,
  // its draft is kept and its error shown inline on that tab, but this
  // doesn't block the header or P&L from saving successfully. Matches the
  // old app's single-save-button UX instead of the three separate buttons
  // this used to require.
  async function handleSave() {
    if (!tabKey) return
    const fields = pendingFields ?? {}

    try {
      if (tab!.quoteId === null) {
        const created = await createQuote.mutateAsync({ name: 'New Pricing Request', ...fields })
        markSaved(tabKey, created.id, created.name)
      } else {
        const updated = await updateQuote.mutateAsync(fields)
        markSaved(tabKey, updated.id, updated.name)
      }
    } catch {
      return
    }

    if (pendingSetupFee !== undefined) {
      try {
        await updateSetupFee.mutateAsync(pendingSetupFee)
        clearDraftSetupFee(tabKey)
      } catch {
        // Draft stays in place; SetupFeeTab shows updateSetupFee.error inline.
      }
    }

    if (pendingPnlInputs !== undefined) {
      try {
        await updatePnl.mutateAsync(pendingPnlInputs)
        clearDraftPnlInputs(tabKey)
      } catch {
        // Draft stays in place; PnlTab shows updatePnl.error inline.
      }
    }
  }

  const isSaving =
    createQuote.isPending || updateQuote.isPending || updateSetupFee.isPending || updatePnl.isPending

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

      <Tabs
        value={activeSubTab ?? 'summary'}
        onValueChange={(value) => setActiveSubTab(tabKey, value)}
      >
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
          <SetupFeeTab
            tabKey={tabKey}
            quoteId={tab.quoteId}
            contractLengthYears={contractLengthYears}
            opportunityType={opportunityType}
            updateSetupFee={updateSetupFee}
          />
        </TabsContent>
        <TabsContent value="pricing" className="mt-4">
          <PricingTab tabKey={tabKey} quoteId={tab.quoteId} />
        </TabsContent>
        <TabsContent value="pnl" className="mt-4">
          <PnlTab
            tabKey={tabKey}
            quoteId={tab.quoteId}
            contractLengthYears={contractLengthYears}
            opportunityType={opportunityType}
            updatePnl={updatePnl}
          />
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
