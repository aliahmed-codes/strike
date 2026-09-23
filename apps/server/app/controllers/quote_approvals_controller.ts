import type { HttpContext } from '@adonisjs/core/http'
import type User from '#models/user'
import Quote from '#models/quote'
import QuoteApproval from '#models/quote_approval'
import { canAccessQuote } from '#services/quote_access_service'
import {
  ApprovalBlockedError,
  ApprovalDecisionError,
  canDecideApproval,
  computeApprovalNeeds,
  decideApproval,
  listApprovalsForQuote,
  submitForApproval,
  withdrawApprovals,
} from '#services/quote_approval_service'
import { decideApprovalValidator, submitApprovalValidator } from '#validators/quote_approval'

function userName(user: { firstName: string; lastName: string } | null | undefined): string | null {
  return user ? `${user.firstName} ${user.lastName}` : null
}

async function loadAccessibleQuote(quoteId: number, user: User) {
  const quote = await Quote.find(quoteId)
  if (!quote) {
    return { error: { status: 404 as const, message: 'Quote not found' } }
  }
  if (!canAccessQuote(user, quote)) {
    return { error: { status: 403 as const, message: 'You do not have access to this quote' } }
  }
  return { quote }
}

function serializeApproval(approval: QuoteApproval, viewer: User) {
  return {
    id: approval.id,
    group: approval.group,
    targetUserId: approval.targetUserId,
    targetUserName: userName(approval.targetUser),
    status: approval.status,
    reason: approval.reason,
    businessImpact: approval.businessImpact,
    valueImpact: approval.valueImpact,
    snapshotReasons: approval.snapshotReasons,
    initiatorName: userName(approval.initiator),
    decidedByName: userName(approval.decidedBy),
    decisionComment: approval.decisionComment,
    canDecide: approval.status === 'pending' && canDecideApproval(viewer, approval),
    history: approval.history.map((event) => ({
      eventType: event.eventType,
      actorName: userName(event.actor),
      comment: event.comment,
      createdAt: event.createdAt.toISO(),
    })),
    createdAt: approval.createdAt.toISO(),
    updatedAt: approval.updatedAt.toISO(),
  }
}

export default class QuoteApprovalsController {
  async index({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { quote, error } = await loadAccessibleQuote(params.quoteId, user)
    if (error) return response.status(error.status).send({ message: error.message })

    const approvals = await listApprovalsForQuote(quote!)
    return response.ok({
      status: quote!.status,
      approvals: approvals.map((a) => serializeApproval(a, user)),
    })
  }

  async submit({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { quote, error } = await loadAccessibleQuote(params.quoteId, user)
    if (error) return response.status(error.status).send({ message: error.message })

    if (quote!.status !== 'draft' && quote!.status !== 'rejected') {
      return response.conflict({ message: 'Quote is not in a state that can be submitted' })
    }

    const payload = await request.validateUsing(submitApprovalValidator)

    try {
      await submitForApproval(quote!, user, {
        reason: payload.reason,
        businessImpact: payload.businessImpact ?? null,
        valueImpact: payload.valueImpact ?? null,
      })
    } catch (submitError) {
      if (submitError instanceof ApprovalBlockedError) {
        return response.unprocessableEntity({
          errors: [{ field: 'submission', message: submitError.message }],
        })
      }
      throw submitError
    }

    const approvals = await listApprovalsForQuote(quote!)
    return response.created({
      status: quote!.status,
      approvals: approvals.map((a) => serializeApproval(a, user)),
    })
  }

  async decide({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const quote = await Quote.find(params.quoteId)
    if (!quote) return response.notFound({ message: 'Quote not found' })

    const approval = await QuoteApproval.query()
      .where('id', params.approvalId)
      .where('quote_id', quote.id)
      .first()
    if (!approval) return response.notFound({ message: 'Approval request not found' })

    // An approver need not own or otherwise have access to the quote itself —
    // being a designated decider for this specific request is enough.
    if (!canAccessQuote(user, quote) && !canDecideApproval(user, approval)) {
      return response.forbidden({ message: 'You do not have access to this quote' })
    }
    if (!canDecideApproval(user, approval)) {
      return response.forbidden({ message: 'You are not an approver for this request' })
    }

    const payload = await request.validateUsing(decideApprovalValidator)

    try {
      await decideApproval(approval, user, payload.action, payload.comment ?? null)
    } catch (decisionError) {
      if (decisionError instanceof ApprovalDecisionError) {
        return response.conflict({ message: decisionError.message })
      }
      throw decisionError
    }

    await quote.refresh()
    const approvals = await listApprovalsForQuote(quote)
    return response.ok({
      status: quote.status,
      approvals: approvals.map((a) => serializeApproval(a, user)),
    })
  }

  async withdraw({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { quote, error } = await loadAccessibleQuote(params.quoteId, user)
    if (error) return response.status(error.status).send({ message: error.message })

    if (quote!.ownerId !== user.id && user.role !== 'admin') {
      return response.forbidden({ message: 'Only the quote owner or an admin can withdraw' })
    }
    if (quote!.status !== 'submitted') {
      return response.conflict({ message: 'This quote has no outstanding submission to withdraw' })
    }

    await withdrawApprovals(quote!, user)

    const approvals = await listApprovalsForQuote(quote!)
    return response.ok({
      status: quote!.status,
      approvals: approvals.map((a) => serializeApproval(a, user)),
    })
  }

  /** A draft/rejected quote's preview of what approval it would need if submitted now — for the frontend to show before the user commits. */
  async preview({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { quote, error } = await loadAccessibleQuote(params.quoteId, user)
    if (error) return response.status(error.status).send({ message: error.message })

    const needs = await computeApprovalNeeds(quote!)
    return response.ok(needs)
  }
}
