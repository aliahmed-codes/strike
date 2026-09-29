import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Pending, unsaved edits to a corridor row on the Pricing tab, staged
 * locally until the user clicks "Save Edited Corridors". Only ever cleared
 * for a row after that row's save call has actually succeeded, never before.
 *
 * Keyed by `tabKey` (one open quote tab) then by row key (`String(rowId)`
 * for an already-saved row, `preview-${corridorId}:${fundingCurrencyId ?? 'none'}`
 * for one only matched by the "Corridors to Offer" filters and not yet
 * promoted to a real row) — see `DisplayRow` in PricingTab.tsx. Living in its
 * own persisted Zustand store (rather than component state) is what makes
 * edits survive switching to the Summary tab and back, since Radix's
 * `TabsContent` unmounts inactive panels by default.
 *
 * `fundingCurrencyId` is deliberately not a field here — a row's funding
 * currency is fixed by which of the quote's funding currencies it was
 * generated for, not user-editable after the fact.
 */
export type CorridorRowEdit = Partial<{
  atvUsd: number
  yearlyVolumeUsd: number
  yearlyTransactions: number
  fixedFeeUsd: number
  variableFeePct: number
  appliedFxSpread: number
  feeDiscountPct: number
  fxSourceOverride: string | null
  treasuryFxCostSpreadOverride: number | null
  costFixedUsdOverride: number | null
  costVariablePctOverride: number | null
}>

interface CorridorEditsState {
  edits: Record<string, Record<string, CorridorRowEdit>>

  setField: <K extends keyof CorridorRowEdit>(
    tabKey: string,
    rowKey: string,
    field: K,
    value: CorridorRowEdit[K]
  ) => void
  /** Renames a row's pending edits to a new key, e.g. once a preview row is promoted to a real saved row and gets a real id. */
  renameRowKey: (tabKey: string, fromKey: string, toKey: string) => void
  clearRow: (tabKey: string, rowKey: string) => void
}

export const useCorridorEditsStore = create<CorridorEditsState>()(
  persist(
    (set) => ({
      edits: {},

      setField: (tabKey, rowKey, field, value) =>
        set((state) => {
          const tabEdits = state.edits[tabKey] ?? {}
          return {
            edits: {
              ...state.edits,
              [tabKey]: { ...tabEdits, [rowKey]: { ...tabEdits[rowKey], [field]: value } },
            },
          }
        }),

      renameRowKey: (tabKey, fromKey, toKey) =>
        set((state) => {
          const tabEdits = state.edits[tabKey] ?? {}
          const moved = tabEdits[fromKey]
          if (moved === undefined) return state
          const rest = { ...tabEdits }
          delete rest[fromKey]
          return { edits: { ...state.edits, [tabKey]: { ...rest, [toKey]: moved } } }
        }),

      clearRow: (tabKey, rowKey) =>
        set((state) => {
          const tabEdits = state.edits[tabKey]
          if (!tabEdits || !(rowKey in tabEdits)) return state
          const rest = { ...tabEdits }
          delete rest[rowKey]
          return { edits: { ...state.edits, [tabKey]: rest } }
        }),
    }),
    { name: 'strike-corridor-edits' }
  )
)
