import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { QuoteFields } from '@strike/shared'

/**
 * Matches the old app's real behavior (confirmed by reading its code, not
 * guessing from a screenshot): clicking "New Pricing Request" does NOT hit
 * the backend — it opens a client-only draft. Editing fields only updates
 * this store; nothing is persisted server-side until "Save Draft" is
 * clicked, which creates the real quote (or updates it, if already saved).
 *
 * One tab = one open quote editor (new draft or existing). `quoteId` is
 * null until the draft's first save. `pendingFields` holds only the field
 * values that differ from what's on the server (empty object = no unsaved
 * changes) — for a brand-new draft, every typed field lives here until save.
 */
export interface QuoteTab {
  key: string
  quoteId: number | null
  label: string
}

interface QuoteWorkspaceState {
  tabs: QuoteTab[]
  activeKey: string | null
  pendingFields: Record<string, Partial<QuoteFields>>

  openNewDraftTab: () => string
  openQuoteTab: (quoteId: number, label: string) => string
  closeTab: (key: string) => void
  setActiveTab: (key: string) => void
  updateDraftField: <K extends keyof QuoteFields>(key: string, field: K, value: QuoteFields[K]) => void
  markSaved: (key: string, quoteId: number, label: string) => void
  isDirty: (key: string) => boolean
}

function makeDraftKey() {
  return `draft-${crypto.randomUUID()}`
}

export const useQuoteWorkspaceStore = create<QuoteWorkspaceState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeKey: null,
      pendingFields: {},

      openNewDraftTab: () => {
        const existingEmptyDraft = get().tabs.find(
          (tab) => tab.quoteId === null && Object.keys(get().pendingFields[tab.key] ?? {}).length === 0
        )
        if (existingEmptyDraft) {
          set({ activeKey: existingEmptyDraft.key })
          return existingEmptyDraft.key
        }

        const key = makeDraftKey()
        set((state) => ({
          tabs: [...state.tabs, { key, quoteId: null, label: 'New Pricing Request' }],
          activeKey: key,
          pendingFields: { ...state.pendingFields, [key]: {} },
        }))
        return key
      },

      openQuoteTab: (quoteId, label) => {
        const existing = get().tabs.find((tab) => tab.quoteId === quoteId)
        if (existing) {
          set({ activeKey: existing.key })
          return existing.key
        }

        const key = `quote-${quoteId}`
        set((state) => ({
          tabs: [...state.tabs, { key, quoteId, label }],
          activeKey: key,
          pendingFields: { ...state.pendingFields, [key]: {} },
        }))
        return key
      },

      closeTab: (key) => {
        set((state) => {
          const tabs = state.tabs.filter((tab) => tab.key !== key)
          const { [key]: _removed, ...pendingFields } = state.pendingFields
          const activeKey =
            state.activeKey === key ? (tabs.length > 0 ? tabs[tabs.length - 1].key : null) : state.activeKey
          return { tabs, pendingFields, activeKey }
        })
      },

      setActiveTab: (key) => set({ activeKey: key }),

      updateDraftField: (key, field, value) => {
        set((state) => ({
          pendingFields: {
            ...state.pendingFields,
            [key]: { ...state.pendingFields[key], [field]: value },
          },
        }))
      },

      markSaved: (key, quoteId, label) => {
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.key === key ? { ...tab, quoteId, label } : tab)),
          pendingFields: { ...state.pendingFields, [key]: {} },
        }))
      },

      isDirty: (key) => Object.keys(get().pendingFields[key] ?? {}).length > 0,
    }),
    { name: 'strike-quote-workspace' }
  )
)
