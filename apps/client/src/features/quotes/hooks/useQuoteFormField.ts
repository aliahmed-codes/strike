import type { QuoteFields } from '@strike/shared'
import { useQuoteWorkspaceStore } from '../store/useQuoteWorkspaceStore'

/**
 * A form field's value is either a pending (unsaved) local edit, or —
 * if untouched since the last save — whatever the server has. This is
 * the one place that layering happens, so every field in the editor
 * behaves consistently with the "buffer locally, save explicitly" model.
 */
export function useQuoteFormField<K extends keyof QuoteFields>(
  tabKey: string,
  serverValue: QuoteFields[K] | undefined,
  field: K,
  fallback: Exclude<QuoteFields[K], undefined>
) {
  const pending = useQuoteWorkspaceStore((state) => state.pendingFields[tabKey]?.[field])
  const updateDraftField = useQuoteWorkspaceStore((state) => state.updateDraftField)

  const value = (pending !== undefined ? pending : (serverValue ?? fallback)) as Exclude<
    QuoteFields[K],
    undefined
  >

  const setValue = (next: QuoteFields[K]) => updateDraftField(tabKey, field, next)

  return [value, setValue] as const
}
