import { useRef, useState } from 'react'
import { Bold, Heading2, Italic, List, ListOrdered, Underline } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { getApiErrorMessage } from '@/lib/api-error'
import {
  useFeeAnnex,
  useFillFeeAnnex,
  useImportFeeAnnexTemplate,
  useSaveFeeAnnex,
} from '../api/useQuoteFeeAnnex'

interface ToolbarAction {
  label: string
  icon: typeof Bold
  command: string
  value?: string
}

const TOOLBAR: ToolbarAction[] = [
  { label: 'Bold', icon: Bold, command: 'bold' },
  { label: 'Italic', icon: Italic, command: 'italic' },
  { label: 'Underline', icon: Underline, command: 'underline' },
  { label: 'Heading', icon: Heading2, command: 'formatBlock', value: 'h2' },
  { label: 'Bullet list', icon: List, command: 'insertUnorderedList' },
  { label: 'Numbered list', icon: ListOrdered, command: 'insertOrderedList' },
]

/**
 * Renders the document as an editable page: the same fonts/spacing/table
 * borders the PDF and DOCX downloads use, so what you edit is what you get.
 */
const DOCUMENT_STYLES = `
  .annex-document { font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 1.5; color: #222; }
  .annex-document h1, .annex-document h2, .annex-document h3 { font-weight: bold; margin: 14px 0 8px; }
  .annex-document h1 { font-size: 18px; } .annex-document h2 { font-size: 15px; } .annex-document h3 { font-size: 13px; }
  .annex-document p { margin: 0 0 8px; }
  .annex-document ul, .annex-document ol { margin: 0 0 8px; padding-left: 22px; }
  .annex-document table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  .annex-document th, .annex-document td { padding: 5px 7px; border: 1px solid #ccc; text-align: left; vertical-align: top; }
`

export function FeeAnnexEditorDialog({
  quoteId,
  open,
  onOpenChange,
}: {
  quoteId: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: annexData } = useFeeAnnex(quoteId)
  const fillMutation = useFillFeeAnnex(quoteId)
  const importMutation = useImportFeeAnnexTemplate(quoteId)
  const saveMutation = useSaveFeeAnnex(quoteId)
  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  // loadedHtml only changes on an explicit load (open/import/refresh) and drives the
  // editor's initial markup; content tracks live keystrokes for Save, kept apart so
  // typing never re-sets innerHTML underneath the user's cursor.
  const [loadedHtml, setLoadedHtml] = useState('')
  const [content, setContent] = useState('')
  const [hasDocument, setHasDocument] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [savedVersion, setSavedVersion] = useState<number | null>(null)
  const [wasOpen, setWasOpen] = useState(false)
  // Bumped on every explicit load so the contentEditable remounts with the fresh
  // markup; between loads it stays put so typing never resets the cursor.
  const [loadVersion, setLoadVersion] = useState(0)

  if (open && !wasOpen && annexData) {
    setWasOpen(true)
    const initial = annexData.annex?.content ?? ''
    setName(annexData.annex?.name ?? annexData.suggestedName)
    setLoadedHtml(initial)
    setContent(initial)
    setHasDocument(initial !== '')
    setWarnings([])
    setSavedVersion(annexData.annex?.version ?? null)
    setLoadVersion((v) => v + 1)
  } else if (!open && wasOpen) {
    setWasOpen(false)
  }

  const isStale = annexData?.annex?.isStale ?? false

  const load = (result: { content: string; warnings: string[] }) => {
    setLoadedHtml(result.content)
    setContent(result.content)
    setHasDocument(true)
    setWarnings(result.warnings)
    setLoadVersion((v) => v + 1)
  }

  const handleImport = (file: File) => {
    importMutation.mutate(file, { onSuccess: load })
  }

  const handleRefresh = () => {
    fillMutation.mutate(content, { onSuccess: load })
  }

  const handleSave = () => {
    saveMutation.mutate(
      { name, content },
      { onSuccess: (result) => setSavedVersion(result.annex.version) }
    )
  }

  const runCommand = (command: string, value?: string) => {
    editorRef.current?.focus()
    document.execCommand(command, false, value)
    if (editorRef.current) setContent(editorRef.current.innerHTML)
  }

  const busy = fillMutation.isPending || importMutation.isPending || saveMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] w-[95vw] max-w-5xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Fee Annex{savedVersion !== null ? ` — version ${savedVersion}` : ''}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-3 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Annex name"
              className="max-w-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              {hasDocument ? 'Import New Template' : 'Upload Template'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.html,.htm"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleImport(file)
                e.target.value = ''
              }}
            />
            {hasDocument && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={handleRefresh}
              >
                {fillMutation.isPending ? 'Refreshing…' : 'Refresh from Quote Data'}
              </Button>
            )}
          </div>

          {isStale && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              This annex no longer matches the quote's current data. Click "Refresh from Quote Data"
              to update it.
            </p>
          )}
          {warnings.length > 0 && (
            <ul className="list-disc rounded-md border border-amber-300 bg-amber-50 px-6 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          {(fillMutation.isError || importMutation.isError || saveMutation.isError) && (
            <p className="text-xs text-destructive">
              {getApiErrorMessage(
                fillMutation.error ?? importMutation.error ?? saveMutation.error
              )}
            </p>
          )}

          {!hasDocument ? (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              Upload a .docx or .html Fee Annex template to get started.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-1">
                {TOOLBAR.map(({ label, icon: Icon, command, value }) => (
                  <Button
                    key={label}
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    title={label}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => runCommand(command, value)}
                  >
                    <Icon />
                  </Button>
                ))}
              </div>
              <style>{DOCUMENT_STYLES}</style>
              <div
                key={loadVersion}
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={(e) => setContent(e.currentTarget.innerHTML)}
                dangerouslySetInnerHTML={{ __html: loadedHtml }}
                className="annex-document flex-1 overflow-auto rounded-lg border bg-white p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" disabled={!hasDocument || busy} onClick={handleSave}>
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
