import { useState } from 'react'
import { isAxiosError } from 'axios'
import { useMe } from '@/features/auth/api/useMe'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { getApiErrorMessage } from '@/lib/api-error'
import { useQuote } from '../api/useQuotes'
import {
  useApprovalPreview,
  useDecideApproval,
  useQuoteApprovals,
  useSubmitApproval,
  useWithdrawApproval,
  type ApprovalNeedsPreview,
  type ApprovalSnapshotReason,
  type QuoteApproval,
} from '../api/useQuoteApprovals'
import { CollapsibleSection } from './CollapsibleSection'

const textareaClass =
  'w-full min-h-20 rounded-lg border border-input bg-transparent p-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

const GROUP_LABEL: Record<string, string> = {
  network_team: 'Network Team',
  pricing_team: 'Pricing Team',
  csuite: 'C-Suite',
}

const STATUS_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'secondary',
  approved: 'default',
  auto_approved: 'default',
  rejected: 'destructive',
  withdrawn: 'outline',
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  auto_approved: 'Auto-approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

function targetLabel(
  approval: Pick<QuoteApproval, 'group' | 'targetUserId' | 'targetUserName'>
): string {
  if (approval.targetUserId !== null || approval.targetUserName) {
    return `Manager: ${approval.targetUserName ?? 'Unknown'}`
  }
  return approval.group ? (GROUP_LABEL[approval.group] ?? approval.group) : 'Unknown'
}

function ReasonList({ reasons }: { reasons: ApprovalSnapshotReason[] }) {
  if (reasons.length === 0) return null
  return (
    <ul className="list-disc space-y-0.5 pl-5 text-sm">
      {reasons.map((r, i) => (
        <li key={i}>
          {r.country && (
            <span className="text-muted-foreground">
              {r.country} · {r.service} · {r.transactionType} —{' '}
            </span>
          )}
          {r.reason}
        </li>
      ))}
    </ul>
  )
}

export function ApprovalsTab({ quoteId }: { quoteId: number | null }) {
  if (quoteId === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-24 text-center">
        <h2 className="text-lg font-semibold">Save the draft first</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          A quote can only be submitted for approval once it has been saved. Click "Save Draft"
          above, then come back to this tab.
        </p>
      </div>
    )
  }

  return <ApprovalsTabContent quoteId={quoteId} />
}

function ApprovalsTabContent({ quoteId }: { quoteId: number }) {
  const { data: me } = useMe()
  const { data: quoteData } = useQuote(quoteId)
  const { data, isLoading, isError, error } = useQuoteApprovals(quoteId)

  const quote = quoteData?.quote
  const canManage = Boolean(quote && me && (quote.ownerId === me.id || me.role === 'admin'))
  const isSubmittable = quote?.status === 'draft' || quote?.status === 'rejected'
  const isSubmitted = quote?.status === 'submitted'

  const preview = useApprovalPreview(quoteId, isSubmittable && canManage)
  const withdraw = useWithdrawApproval(quoteId)
  const [submitOpen, setSubmitOpen] = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading approvals…</p>
  }
  if (isError) {
    return <p className="text-sm text-destructive">{getApiErrorMessage(error)}</p>
  }

  const approvals = data?.approvals ?? []

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Status: <span className="font-medium text-foreground">{data?.status ?? quote?.status}</span>
      </p>

      {isSubmittable && canManage && (
        <CollapsibleSection title="Request Approval" defaultOpen>
          <RequestApprovalSection quoteId={quoteId} preview={preview.data} onOpen={() => setSubmitOpen(true)} />
        </CollapsibleSection>
      )}

      {isSubmitted && canManage && (
        <div className="flex items-center justify-between rounded-md border px-4 py-3">
          <p className="text-sm">This quote is awaiting a decision from its approver(s).</p>
          <Button variant="outline" onClick={() => setWithdrawOpen(true)}>
            Withdraw Submission
          </Button>
        </div>
      )}

      <CollapsibleSection title="Approval History" defaultOpen>
        {approvals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No approvals yet — request approval above to get started.
          </p>
        ) : (
          <div className="space-y-4">
            {approvals.map((approval) => (
              <ApprovalCard key={approval.id} quoteId={quoteId} approval={approval} />
            ))}
          </div>
        )}
      </CollapsibleSection>

      <SubmitApprovalDialog quoteId={quoteId} open={submitOpen} onOpenChange={setSubmitOpen} />

      <AlertDialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw this submission?</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">
            Every pending approval on this submission will be cancelled and the quote returns to
            draft, editable again.
          </p>
          {withdraw.isError && (
            <p className="text-sm text-destructive">{getApiErrorMessage(withdraw.error)}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                withdraw.mutate(undefined, { onSuccess: () => setWithdrawOpen(false) })
              }}
              disabled={withdraw.isPending}
            >
              {withdraw.isPending ? 'Withdrawing…' : 'Withdraw'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function RequestApprovalSection({
  preview,
  onOpen,
}: {
  quoteId: number
  preview: ApprovalNeedsPreview | undefined
  onOpen: () => void
}) {
  const hasExceptions = Boolean(
    preview && (preview.networkTeam.length > 0 || preview.pricingTeam.length > 0 || preview.managerTarget)
  )

  return (
    <div className="space-y-3">
      {preview &&
        (hasExceptions ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Submitting now will route to the following approver(s):
            </p>
            {preview.networkTeam.length > 0 && (
              <div>
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Network Team
                </p>
                <ReasonList reasons={preview.networkTeam} />
              </div>
            )}
            {preview.pricingTeam.length > 0 && (
              <div>
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Pricing Team
                </p>
                <ReasonList reasons={preview.pricingTeam} />
              </div>
            )}
            {preview.managerTarget && (
              <div>
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Manager sign-off
                </p>
                <ReasonList reasons={preview.managerTarget.reasons} />
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing on this quote currently needs approval — submitting will approve it
            automatically.
          </p>
        ))}
      <Button onClick={onOpen}>Request Approval</Button>
    </div>
  )
}

function SubmitApprovalDialog({
  quoteId,
  open,
  onOpenChange,
}: {
  quoteId: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const submit = useSubmitApproval(quoteId)
  const [reason, setReason] = useState('')
  const [businessImpact, setBusinessImpact] = useState('')
  const [valueImpact, setValueImpact] = useState('')

  const blockers = isAxiosError(submit.error)
    ? (submit.error.response?.data as { errors?: { message: string }[] } | undefined)?.errors
    : undefined

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          setReason('')
          setBusinessImpact('')
          setValueImpact('')
          submit.reset()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request Approval</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Why is approval needed?</label>
            <textarea
              className={textareaClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain the discrepancy or exception"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Business Impact</label>
            <textarea
              className={textareaClass}
              value={businessImpact}
              onChange={(e) => setBusinessImpact(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Value / Amount Impact</label>
            <Input
              value={valueImpact}
              onChange={(e) => setValueImpact(e.target.value)}
              placeholder="e.g. $50,000"
            />
          </div>
          {submit.isError && (
            <div className="text-sm text-destructive">
              <p>{getApiErrorMessage(submit.error)}</p>
              {blockers && blockers.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {blockers.map((b) => (
                    <li key={b.message}>{b.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!reason.trim() || submit.isPending}
            onClick={() =>
              submit.mutate(
                {
                  reason,
                  businessImpact: businessImpact.trim() || undefined,
                  valueImpact: valueImpact.trim() || undefined,
                },
                { onSuccess: () => onOpenChange(false) }
              )
            }
          >
            {submit.isPending ? 'Sending…' : 'Send for Approval'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ApprovalCard({ quoteId, approval }: { quoteId: number; approval: QuoteApproval }) {
  const decide = useDecideApproval(quoteId)
  const [action, setAction] = useState<'approve' | 'reject' | null>(null)
  const [comment, setComment] = useState('')

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{targetLabel(approval)}</p>
          <p className="text-xs text-muted-foreground">
            Requested by {approval.initiatorName ?? 'Unknown'} ·{' '}
            {new Date(approval.createdAt).toLocaleString()}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[approval.status] ?? 'outline'}>
          {STATUS_LABEL[approval.status] ?? approval.status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Why is approval needed?
          </p>
          <p className="text-sm">{approval.reason}</p>
        </div>
        {approval.businessImpact && (
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Business Impact
            </p>
            <p className="text-sm">{approval.businessImpact}</p>
          </div>
        )}
        {approval.valueImpact && (
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Value / Amount Impact
            </p>
            <p className="text-sm">{approval.valueImpact}</p>
          </div>
        )}
      </div>

      {approval.snapshotReasons.length > 0 && (
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Discrepancies
          </p>
          <ReasonList reasons={approval.snapshotReasons} />
        </div>
      )}

      {approval.decisionComment && (
        <p className="text-sm">
          <span className="text-muted-foreground">
            {approval.decidedByName ?? 'System'}:
          </span>{' '}
          {approval.decisionComment}
        </p>
      )}

      {approval.history.length > 0 && (
        <div className="space-y-1 border-t pt-2">
          {approval.history.map((event, i) => (
            <p key={i} className="text-xs text-muted-foreground">
              {new Date(event.createdAt).toLocaleString()} — {event.eventType.replace('_', ' ')}
              {event.actorName ? ` by ${event.actorName}` : ''}
              {event.comment ? `: ${event.comment}` : ''}
            </p>
          ))}
        </div>
      )}

      {approval.canDecide && (
        <div className="flex gap-2 border-t pt-3">
          <Button size="sm" onClick={() => setAction('approve')}>
            Approve
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setAction('reject')}>
            Reject
          </Button>
        </div>
      )}

      <AlertDialog open={action !== null} onOpenChange={(open) => !open && setAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {action === 'approve' ? 'Approve this request?' : 'Reject this request?'}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-1">
            <label className="text-sm font-medium">Comment</label>
            <textarea
              className={textareaClass}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Explain your decision"
            />
          </div>
          {decide.isError && (
            <p className="text-sm text-destructive">{getApiErrorMessage(decide.error)}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={action === 'reject' ? 'destructive' : 'default'}
              disabled={!comment.trim() || decide.isPending}
              onClick={(e) => {
                e.preventDefault()
                if (!action) return
                decide.mutate(
                  { approvalId: approval.id, action, comment },
                  {
                    onSuccess: () => {
                      setAction(null)
                      setComment('')
                    },
                  }
                )
              }}
            >
              {decide.isPending ? 'Saving…' : action === 'approve' ? 'Approve' : 'Reject'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
