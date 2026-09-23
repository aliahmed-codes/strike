import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'
import Quote from '#models/quote'
import QuoteCorridor from '#models/quote_corridor'
import QuoteApproval, { type QuoteApprovalSnapshotReason } from '#models/quote_approval'
import QuoteApprovalHistory from '#models/quote_approval_history'
import User, { type ApprovalGroup } from '#models/user'
import { latestAnnexVersion } from '#services/fee_annex_service'
import { buildPnlResponse } from '#services/quote_pnl_service'

const CUSTOM_SCHEDULE_REASON = 'Non-standard payment schedule requires approval.'

export interface ApprovalNeeds {
  networkTeam: QuoteApprovalSnapshotReason[]
  pricingTeam: QuoteApprovalSnapshotReason[]
  managerTarget: { userId: number; reasons: QuoteApprovalSnapshotReason[] } | null
}

function labelFor(corridor: QuoteCorridor): Omit<QuoteApprovalSnapshotReason, 'reason'> {
  return {
    corridorId: corridor.id,
    country: corridor.corridor?.country?.name ?? null,
    service: corridor.corridor?.serviceCode ?? null,
    transactionType: corridor.corridor?.transactionTypeCode ?? null,
  }
}

/**
 * Reuses every approval flag already computed server-side by pricing/P&L/
 * setup-fee services — no competing client-style discrepancy engine. Routes
 * by group the same way the old app did: network exceptions to
 * network_team, everything else pricing/P&L-related to pricing_team, and a
 * custom payment schedule additionally (not instead) targets the quote
 * owner's manager, falling back to pricing_team when there is none.
 */
export async function computeApprovalNeeds(quote: Quote): Promise<ApprovalNeeds> {
  await quote.load('corridors', (q) => {
    q.withScopes((s) => s.priced())
    q.preload('corridor', (cq) => cq.preload('country'))
  })
  await quote.load('owner')
  await quote.load('setupFee')

  const networkTeam: QuoteApprovalSnapshotReason[] = []
  const pricingTeam: QuoteApprovalSnapshotReason[] = []

  for (const corridor of quote.corridors) {
    const label = labelFor(corridor)
    for (const reason of corridor.networkApprovalReasons ?? []) {
      networkTeam.push({ ...label, reason })
    }
    for (const reason of corridor.financialApprovalReasons ?? []) {
      pricingTeam.push({ ...label, reason })
    }
  }

  const pnl = await buildPnlResponse(quote)
  const noLabel = { corridorId: null, country: null, service: null, transactionType: null }
  for (const reason of pnl.approvalReasons) {
    pricingTeam.push({ ...noLabel, reason: `P&L: ${reason}` })
  }

  let managerTarget: ApprovalNeeds['managerTarget'] = null
  const setupReasons = quote.setupFee?.approvalReasons ?? []
  if (setupReasons.length > 0) {
    const hasCustomSchedule = setupReasons.includes(CUSTOM_SCHEDULE_REASON)
    const managerId = hasCustomSchedule ? (quote.owner?.managerId ?? null) : null

    for (const reason of setupReasons) {
      const isCustomScheduleReason = reason === CUSTOM_SCHEDULE_REASON
      const target = isCustomScheduleReason && managerId ? 'manager' : 'pricing'
      const entry = { ...noLabel, reason: `Setup Fee: ${reason}` }
      if (target === 'manager') {
        managerTarget ??= { userId: managerId!, reasons: [] }
        managerTarget.reasons.push(entry)
      } else {
        pricingTeam.push(entry)
      }
    }
  }

  return { networkTeam, pricingTeam, managerTarget }
}

export class ApprovalBlockedError extends Error {}

async function assertReadyForSubmission(quote: Quote): Promise<void> {
  await quote.load('corridors', (q) => q.withScopes((s) => s.priced()))
  if (quote.corridors.length === 0) {
    throw new ApprovalBlockedError('This quote has no priced corridors yet.')
  }
  const setupFee = await quote.related('setupFee').query().first()
  if (!setupFee) {
    throw new ApprovalBlockedError('This quote has no Setup Fee yet.')
  }
  const annex = await latestAnnexVersion(quote.id)
  if (!annex) {
    throw new ApprovalBlockedError('Save a Fee Annex before requesting approval.')
  }
}

async function recordHistory(
  approvalId: number,
  actorId: number | null,
  eventType: QuoteApprovalHistory['eventType'],
  comment: string | null,
  client: TransactionClientContract
): Promise<void> {
  await QuoteApprovalHistory.create({ approvalId, actorId, eventType, comment }, { client })
}

export interface SubmitApprovalInput {
  reason: string
  businessImpact: string | null
  valueImpact: string | null
}

/**
 * Only draft/rejected quotes may be submitted (enforced by the caller's
 * status gate). Creates one row per group/manager-target atomically, or
 * auto-approves in place when nothing needs approval — with honest system
 * attribution, never a client-claimed "auto" decision impersonating a person.
 */
export async function submitForApproval(
  quote: Quote,
  initiator: User,
  input: SubmitApprovalInput
): Promise<QuoteApproval[]> {
  await assertReadyForSubmission(quote)
  const needs = await computeApprovalNeeds(quote)
  const hasAnyNeed =
    needs.networkTeam.length > 0 || needs.pricingTeam.length > 0 || needs.managerTarget !== null

  const trx = await db.transaction()
  try {
    const rows: QuoteApproval[] = []

    if (!hasAnyNeed) {
      const approval = await QuoteApproval.create(
        {
          quoteId: quote.id,
          group: null,
          targetUserId: null,
          status: 'auto_approved',
          reason: input.reason,
          businessImpact: input.businessImpact,
          valueImpact: input.valueImpact,
          snapshotReasons: [],
          initiatorId: initiator.id,
          decidedById: null,
          decisionComment: 'No approval exceptions were detected.',
        },
        { client: trx }
      )
      await recordHistory(approval.id, null, 'auto_approved', approval.decisionComment, trx)
      rows.push(approval)
      quote.status = 'approved'
    } else {
      const groups: {
        group: ApprovalGroup | null
        targetUserId: number | null
        reasons: QuoteApprovalSnapshotReason[]
      }[] = []
      if (needs.networkTeam.length > 0) {
        groups.push({ group: 'network_team', targetUserId: null, reasons: needs.networkTeam })
      }
      if (needs.pricingTeam.length > 0) {
        groups.push({ group: 'pricing_team', targetUserId: null, reasons: needs.pricingTeam })
      }
      if (needs.managerTarget) {
        groups.push({
          group: null,
          targetUserId: needs.managerTarget.userId,
          reasons: needs.managerTarget.reasons,
        })
      }

      for (const g of groups) {
        const approval = await QuoteApproval.create(
          {
            quoteId: quote.id,
            group: g.group,
            targetUserId: g.targetUserId,
            status: 'pending',
            reason: input.reason,
            businessImpact: input.businessImpact,
            valueImpact: input.valueImpact,
            snapshotReasons: g.reasons,
            initiatorId: initiator.id,
          },
          { client: trx }
        )
        await recordHistory(approval.id, initiator.id, 'submitted', null, trx)
        rows.push(approval)
      }
      quote.status = 'submitted'
    }

    await quote.useTransaction(trx).save()
    await trx.commit()
    return rows
  } catch (error) {
    await trx.rollback()
    throw error
  }
}

export function canDecideApproval(user: User, approval: QuoteApproval): boolean {
  if (user.role === 'admin') return true
  if (approval.targetUserId !== null) return approval.targetUserId === user.id
  return approval.group !== null && user.approvalGroup === approval.group
}

export class ApprovalDecisionError extends Error {}

/**
 * Transactional and status-guarded (the old app's real bugs: no pending
 * check, no transaction around decision + quote status). Rejecting one
 * group withdraws every other still-pending row from the same submission —
 * a submission is one all-or-nothing unit, not independent per-group votes.
 */
export async function decideApproval(
  approval: QuoteApproval,
  actor: User,
  action: 'approve' | 'reject',
  comment: string | null
): Promise<QuoteApproval> {
  const trx = await db.transaction()
  try {
    const locked = await QuoteApproval.query({ client: trx })
      .where('id', approval.id)
      .forUpdate()
      .firstOrFail()

    if (locked.status !== 'pending') {
      throw new ApprovalDecisionError('This approval has already been decided.')
    }

    locked.status = action === 'approve' ? 'approved' : 'rejected'
    locked.decidedById = actor.id
    locked.decisionComment = comment
    locked.useTransaction(trx)
    await locked.save()
    await recordHistory(locked.id, actor.id, locked.status, comment, trx)

    const quote = await Quote.query({ client: trx }).where('id', locked.quoteId).firstOrFail()

    if (action === 'reject') {
      await QuoteApproval.query({ client: trx })
        .where('quote_id', quote.id)
        .where('status', 'pending')
        .whereNot('id', locked.id)
        .update({
          status: 'withdrawn',
          decided_by_id: actor.id,
          updated_at: DateTime.now().toSQL(),
        })
      quote.status = 'rejected'
    } else {
      const remainingPending = await QuoteApproval.query({ client: trx })
        .where('quote_id', quote.id)
        .where('status', 'pending')
        .count('* as total')
      if (Number(remainingPending[0].$extras.total) === 0) {
        quote.status = 'approved'
      }
    }
    await quote.useTransaction(trx).save()

    await trx.commit()
    return locked
  } catch (error) {
    await trx.rollback()
    throw error
  }
}

/** Owner or admin, only while a submission is outstanding — cancels every pending row and returns the quote to draft. */
export async function withdrawApprovals(quote: Quote, actor: User): Promise<void> {
  const trx = await db.transaction()
  try {
    await QuoteApproval.query({ client: trx })
      .where('quote_id', quote.id)
      .where('status', 'pending')
      .update({ status: 'withdrawn', decided_by_id: actor.id, updated_at: DateTime.now().toSQL() })

    const pendingRows = await QuoteApproval.query({ client: trx })
      .where('quote_id', quote.id)
      .where('status', 'withdrawn')
      .where('decided_by_id', actor.id)

    for (const row of pendingRows) {
      await recordHistory(row.id, actor.id, 'withdrawn', null, trx)
    }

    quote.status = 'draft'
    await quote.useTransaction(trx).save()
    await trx.commit()
  } catch (error) {
    await trx.rollback()
    throw error
  }
}

/**
 * Snapshot evidence is never mutated, but it is re-filtered for display: a
 * corridor that has since gone to zero volume or been deleted disappears
 * from an old submission's discrepancy list too (matches the old app's
 * display behavior, chosen deliberately even though it can hide part of the
 * historical evidence — the stored row itself is untouched).
 */
export async function listApprovalsForQuote(quote: Quote): Promise<QuoteApproval[]> {
  const approvals = await QuoteApproval.query()
    .where('quote_id', quote.id)
    .preload('initiator')
    .preload('decidedBy')
    .preload('targetUser')
    .preload('history', (q) => q.preload('actor').orderBy('created_at', 'asc'))
    .orderBy('created_at', 'desc')

  const pricedCorridors = await QuoteCorridor.query()
    .where('quote_id', quote.id)
    .withScopes((s) => s.priced())
    .select('id')
  const activeCorridorIds = new Set(pricedCorridors.map((c) => c.id))

  for (const approval of approvals) {
    approval.snapshotReasons = approval.snapshotReasons.filter(
      (entry) => entry.corridorId === null || activeCorridorIds.has(entry.corridorId)
    )
  }

  return approvals
}
