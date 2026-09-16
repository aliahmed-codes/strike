import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { QuoteFields } from '@strike/shared'
import type { CorridorFacetFilters } from '../api/useReferenceData'

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
  // Which sub-tab (summary/pricing/etc.) is showing within each quote tab —
  // persisted so a page refresh reopens the same sub-tab instead of always
  // resetting to Summary.
  activeSubTab: Record<string, string>
  // The "Corridors to Offer" filter selection actually applied to the
  // Pricing tab's preview rows — separate from the live filter checkboxes,
  // which only change what's *selected*, not what's previewed. Only updated
  // by clicking "Apply Filters". Absent until the first click, at which
  // point the caller falls back to the quote's last-saved filter fields.
  appliedCorridorFilters: Record<string, CorridorFacetFilters>

  openNewDraftTab: () => string
  openQuoteTab: (quoteId: number, label: string) => string
  closeTab: (key: string) => void
  setActiveTab: (key: string) => void
  setActiveSubTab: (key: string, subTab: string) => void
  applyCorridorFilters: (key: string, filters: CorridorFacetFilters) => void
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
      activeSubTab: {},
      appliedCorridorFilters: {},

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
          const { [key]: _removedSubTab, ...activeSubTab } = state.activeSubTab
          const { [key]: _removedFilters, ...appliedCorridorFilters } = state.appliedCorridorFilters
          const activeKey =
            state.activeKey === key ? (tabs.length > 0 ? tabs[tabs.length - 1].key : null) : state.activeKey
          return { tabs, pendingFields, activeSubTab, appliedCorridorFilters, activeKey }
        })
      },

      setActiveTab: (key) => set({ activeKey: key }),

      setActiveSubTab: (key, subTab) =>
        set((state) => ({ activeSubTab: { ...state.activeSubTab, [key]: subTab } })),

      applyCorridorFilters: (key, filters) =>
        set((state) => ({
          appliedCorridorFilters: { ...state.appliedCorridorFilters, [key]: filters },
        })),

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
