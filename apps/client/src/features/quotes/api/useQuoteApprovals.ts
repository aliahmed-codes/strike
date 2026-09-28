import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { quoteKeys } from './useQuotes'

export type ApprovalGroup = 'network_team' | 'pricing_team' | 'csuite'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'auto_approved' | 'withdrawn'

export interface ApprovalSnapshotReason {
  corridorId: number | null
  country: string | null
  service: string | null
  transactionType: string | null
  reason: string
}

export interface ApprovalHistoryEvent {
  eventType: string
  actorName: string | null
  comment: string | null
  createdAt: string
}

export interface QuoteApproval {
  id: number
  group: ApprovalGroup | null
  targetUserId: number | null
  targetUserName: string | null
  status: ApprovalStatus
  reason: string
  businessImpact: string | null
  valueImpact: string | null
  snapshotReasons: ApprovalSnapshotReason[]
  initiatorName: string | null
  decidedByName: string | null
  decisionComment: string | null
  canDecide: boolean
  history: ApprovalHistoryEvent[]
  createdAt: string
  updatedAt: string
}

export interface QuoteApprovalsResponse {
  status: string
  approvals: QuoteApproval[]
}

export interface ApprovalNeedsPreview {
  networkTeam: ApprovalSnapshotReason[]
  pricingTeam: ApprovalSnapshotReason[]
  managerTarget: { userId: number; reasons: ApprovalSnapshotReason[] } | null
}

export const quoteApprovalKeys = {
  list: (quoteId: number) => ['quote-approvals', quoteId] as const,
  preview: (quoteId: number) => ['quote-approvals-preview', quoteId] as const,
}

export function useQuoteApprovals(quoteId: number | null) {
  return useQuery({
    queryKey: quoteApprovalKeys.list(quoteId ?? -1),
    queryFn: async () =>
      (await apiClient.get<QuoteApprovalsResponse>(`/quotes/${quoteId}/approvals`)).data,
    enabled: quoteId !== null,
  })
}

/** A dry-run of what submitting right now would route to — used to show the user what to expect before they click Request Approval. */
export function useApprovalPreview(quoteId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: quoteApprovalKeys.preview(quoteId ?? -1),
    queryFn: async () =>
      (await apiClient.get<ApprovalNeedsPreview>(`/quotes/${quoteId}/approvals/preview`)).data,
    enabled: quoteId !== null && enabled,
  })
}

function invalidateApprovals(queryClient: ReturnType<typeof useQueryClient>, quoteId: number) {
  void queryClient.invalidateQueries({ queryKey: quoteApprovalKeys.list(quoteId) })
  void queryClient.invalidateQueries({ queryKey: quoteApprovalKeys.preview(quoteId) })
  void queryClient.invalidateQueries({ queryKey: quoteKeys.detail(quoteId) })
}

export function useSubmitApproval(quoteId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      reason: string
      businessImpact?: string
      valueImpact?: string
    }) =>
      (await apiClient.post<QuoteApprovalsResponse>(`/quotes/${quoteId}/approvals`, payload)).data,
    onSuccess: () => invalidateApprovals(queryClient, quoteId),
  })
}

export function useDecideApproval(quoteId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { approvalId: number; action: 'approve' | 'reject'; comment: string }) =>
      (
        await apiClient.post<QuoteApprovalsResponse>(
          `/quotes/${quoteId}/approvals/${payload.approvalId}/decide`,
          { action: payload.action, comment: payload.comment }
        )
      ).data,
    onSuccess: () => invalidateApprovals(queryClient, quoteId),
  })
}

export function useWithdrawApproval(quoteId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      (await apiClient.post<QuoteApprovalsResponse>(`/quotes/${quoteId}/approvals/withdraw`)).data,
    onSuccess: () => invalidateApprovals(queryClient, quoteId),
  })
}
