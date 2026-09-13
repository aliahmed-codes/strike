import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import type User from '#models/user'
import Quote from '#models/quote'
import QuoteSetupFee from '#models/quote_setup_fee'
import { canAccessQuote } from '#services/quote_access_service'
import { computeSetupFee, validateSetupFeeConsistency } from '#services/setup_fee_pricing_service'
import { updateSetupFeeValidator } from '#validators/setup_fee'

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

function serializeSetupFee(setupFee: QuoteSetupFee) {
  return {
    ...setupFee.serialize(),
    paymentMilestones: setupFee.paymentMilestones?.map((m) => m.serialize()) ?? [],
    mcfPrincipalSlots: setupFee.mcfPrincipalSlots?.map((s) => s.serialize()) ?? [],
    mcfBlockFees: setupFee.mcfBlockFees?.map((b) => b.serialize()) ?? [],
    otherFees: setupFee.otherFees?.map((f) => f.serialize()) ?? [],
  }
}

export default class SetupFeeController {
  async show({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { quote, error } = await loadAccessibleQuote(params.quoteId, user)
    if (error) return response.status(error.status).send({ message: error.message })

    const setupFee = await QuoteSetupFee.query()
      .where('quoteId', quote!.id)
      .preload('paymentMilestones')
      .preload('mcfPrincipalSlots')
      .preload('mcfBlockFees')
      .preload('otherFees')
      .first()

    if (!setupFee) {
      return response.ok({ setupFee: null })
    }

    return response.ok({ setupFee: serializeSetupFee(setupFee) })
  }

  async update({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { quote, error } = await loadAccessibleQuote(params.quoteId, user)
    if (error) return response.status(error.status).send({ message: error.message })

    if (quote!.status !== 'draft') {
      return response.conflict({ message: 'Quote is not editable in its current status' })
    }

    const payload = await request.validateUsing(updateSetupFeeValidator)

    const consistencyErrors = validateSetupFeeConsistency({
      feeType: payload.feeType,
      quotedPrice: payload.quotedPrice,
      paymentSchedule: payload.paymentSchedule,
      paymentMilestones: payload.paymentMilestones ?? [],
      mcfType: payload.mcfType,
      standardCommitmentFee: payload.standardCommitmentFee ?? 0,
      commitmentFeeDiscountPct: payload.commitmentFeeDiscountPct ?? 0,
      mcfPrincipalSlots: payload.mcfPrincipalSlots ?? [],
      mcfBlockFees: payload.mcfBlockFees ?? [],
      waivedMonths: payload.waivedMonths,
      rebateIncentive: payload.rebateIncentive,
      otherFees: payload.otherFees ?? [],
      contractLengthYears: quote!.contractLengthYears ?? 1,
      opportunityType: quote!.opportunityType,
    })
    if (consistencyErrors.length > 0) {
      return response.unprocessableEntity({ errors: consistencyErrors })
    }

    const computed = computeSetupFee({
      feeType: payload.feeType,
      quotedPrice: payload.quotedPrice,
      paymentSchedule: payload.paymentSchedule,
      paymentMilestones: payload.paymentMilestones ?? [],
      mcfType: payload.mcfType,
      standardCommitmentFee: payload.standardCommitmentFee ?? 0,
      commitmentFeeDiscountPct: payload.commitmentFeeDiscountPct ?? 0,
      mcfPrincipalSlots: payload.mcfPrincipalSlots ?? [],
      mcfBlockFees: payload.mcfBlockFees ?? [],
      waivedMonths: payload.waivedMonths,
      rebateIncentive: payload.rebateIncentive,
      otherFees: payload.otherFees ?? [],
      contractLengthYears: quote!.contractLengthYears ?? 1,
      opportunityType: quote!.opportunityType,
    })

    const setupFee = await QuoteSetupFee.updateOrCreate(
      { quoteId: quote!.id },
      {
        quoteId: quote!.id,
        feeType: payload.feeType,
        quotedPrice: payload.quotedPrice,
        paymentSchedule: payload.paymentSchedule,
        joiningFeeBillingType: payload.joiningFeeBillingType,
        mcfType: payload.mcfType,
        mcfBillingStart: payload.mcfBillingStart,
        standardCommitmentFee: payload.standardCommitmentFee ?? 0,
        commitmentFeeDiscountPct: payload.commitmentFeeDiscountPct ?? 0,
        waivedMonths: payload.waivedMonths,
        rebateIncentive: payload.rebateIncentive,
        rebateType: payload.rebateType ?? null,
        needsApproval: computed.needsApproval,
        approvalReasons: computed.approvalReasons,
        computedAt: DateTime.now(),
      }
    )

    await setupFee.related('paymentMilestones').query().delete()
    if (payload.paymentMilestones?.length) {
      await setupFee
        .related('paymentMilestones')
        .createMany(payload.paymentMilestones.map((m, index) => ({ ...m, sortOrder: index })))
    }

    await setupFee.related('mcfPrincipalSlots').query().delete()
    if (payload.mcfPrincipalSlots?.length) {
      await setupFee.related('mcfPrincipalSlots').createMany(payload.mcfPrincipalSlots)
    }

    await setupFee.related('mcfBlockFees').query().delete()
    if (payload.mcfBlockFees?.length) {
      await setupFee.related('mcfBlockFees').createMany(payload.mcfBlockFees)
    }

    await setupFee.related('otherFees').query().delete()
    if (payload.otherFees?.length) {
      await setupFee
        .related('otherFees')
        .createMany(payload.otherFees.map((f) => ({ ...f, currencyId: f.currencyId ?? null })))
    }

    await setupFee.load('paymentMilestones')
    await setupFee.load('mcfPrincipalSlots')
    await setupFee.load('mcfBlockFees')
    await setupFee.load('otherFees')

    return response.ok({ setupFee: { ...serializeSetupFee(setupFee), ...computed } })
  }
}
