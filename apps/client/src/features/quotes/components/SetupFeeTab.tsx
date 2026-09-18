import { useMemo, useState } from 'react'
import type {
  FeeType,
  JoiningFeeBillingType,
  McfBillingStart,
  McfType,
  OtherFee,
  OtherFeeConcept,
  PaymentSchedule,
  RebateType,
  SetupFee,
  SetupFeeFields,
} from '@strike/shared'
import {
  MAX_WAIVED_MONTHS,
  OTHER_FEE_CONCEPTS,
  TOTAL_CONTRACT_VALUE_APPROVAL_THRESHOLD_USD,
  YEAR1_REVENUE_APPROVAL_THRESHOLD_USD,
  computeSetupFeeTotals,
  hasCommitmentFeeRamp,
  isTotalContractValueBelowThreshold,
  isYear1RevenueBelowThreshold,
  otherFeeDefault,
  otherFeeDiffersFromDefault,
  otherFeeRequiresCurrency,
} from '@strike/shared'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getApiErrorMessage, getApiFieldErrors } from '@/lib/api-error'
import { useCurrencies } from '../api/useReferenceData'
import { useSetupFee, useUpdateSetupFee } from '../api/useSetupFee'
import { useQuoteWorkspaceStore } from '../store/useQuoteWorkspaceStore'
import { CollapsibleSection } from './CollapsibleSection'
import { FormField } from './FormField'
import { SimpleSelect } from './SimpleSelect'

const FEE_TYPES: { value: FeeType; label: string }[] = [
  { value: 'setup', label: 'Set Up Fee' },
  { value: 'network', label: 'Network Joining Fee' },
]
const PAYMENT_SCHEDULES: { value: PaymentSchedule; label: string }[] = [
  { value: 'full', label: 'On Contract Signature - 100%' },
  { value: 'custom', label: 'Custom' },
]
const JOINING_FEE_BILLING_TYPES: { value: JoiningFeeBillingType; label: string }[] = [
  { value: 'at_signing', label: 'At Contract Signing' },
  { value: 'non_standard', label: 'Non-Standard Terms' },
]
const MCF_TYPES: { value: McfType; label: string }[] = [
  { value: 'standard', label: 'Fee Revenue Based (Standard)' },
  { value: 'principal', label: 'Volume / Principal Based' },
]
const MCF_BILLING_STARTS: { value: McfBillingStart; label: string }[] = [
  { value: 'at_signing', label: 'At Contract Signing' },
  { value: 'at_go_live', label: 'At Go-Live' },
  { value: 'non_standard', label: 'Other / Non-Standard' },
]
const REBATE_TYPES: { value: RebateType; label: string }[] = [
  { value: 'volume', label: 'Volume Amount Based' },
  { value: 'revenue', label: 'Revenue Amount Based' },
  { value: 'transaction_count', label: 'Transaction Count Based' },
  { value: 'other', label: 'Other' },
]

// Concept label + whether it's a percentage — fixed per concept, matching the
// old app's real fields (see FEATURES.md Phase 2 investigation notes).
// Whether a concept needs a currency selected comes from
// @strike/shared's otherFeeRequiresCurrency, not a field here, so the
// frontend's required-field indicator can never disagree with the backend's
// save-time check about which concept(s) it applies to.
const OTHER_FEE_META: Record<OtherFeeConcept, { label: string; isPercentage: boolean }> = {
  reversal_request: { label: 'Service Request Fee (Reversal Request)', isPercentage: false },
  proof_of_payment: { label: 'Service Request Fee (Proof of Payment)', isPercentage: false },
  emergency_funding: { label: 'Emergency Funding Fee', isPercentage: true },
  treasury_management: { label: 'Treasury Management Fee', isPercentage: true },
  business_hub_platform: { label: 'Business Hub Platform Fee', isPercentage: false },
  post_funding_penalty: { label: 'Post-Funding Line Penalty Fee', isPercentage: true },
  corridor_no_usage: { label: 'Corridor No-Usage Fee', isPercentage: false },
  white_glove: { label: 'White-Glove Service', isPercentage: false },
  stablecoin_prefunding: { label: 'Stablecoin Pre-funding Set-up Fee', isPercentage: false },
  digital_asset_icp_setup: { label: 'Digital Asset ICP Setup Fee', isPercentage: false },
  bulk_currency_conversion: { label: 'Bulk Currency Conversion', isPercentage: false },
  currencies_for_treasury: { label: 'Currencies For Treasury Management Fee', isPercentage: false },
}

// Errors on these fields get attached directly under their own input.
// Everything else (nested milestone/slot/other-fee rows, and business-rule
// rejections like "milestones must sum to 100%") is far more work to
// attribute to one exact input, so it renders as its own readable bullet
// list instead — see FEATURES.md's Setup Fee save/error fix notes.
const SCALAR_ERROR_FIELDS = [
  'quotedPrice',
  'waivedMonths',
  'standardCommitmentFee',
  'commitmentFeeDiscountPct',
] as const

// Seeded from the real opportunity-type-aware default (via @strike/shared's
// otherFeeDefault), not a hardcoded 0 — a fresh "New Partner" quote used to
// falsely show 7 of its 12 Other Fees as "differs from default" the moment
// it was saved, purely because the frontend's own idea of "default" (always
// 0) never matched the backend's real one. Any concept flagged `hasCurrency`
// (currently just Treasury Management) also defaults its currency to USD —
// matching the old app's real fallback for this field — instead of staying
// unselected with no visual cue that a choice is expected.
function defaultOtherFees(opportunityType: string | null, defaultCurrencyId: number | null): OtherFee[] {
  return OTHER_FEE_CONCEPTS.map((conceptCode) => ({
    conceptCode,
    amount: otherFeeDefault(conceptCode, opportunityType),
    isPercentage: OTHER_FEE_META[conceptCode].isPercentage,
    currencyId: otherFeeRequiresCurrency(conceptCode) ? defaultCurrencyId : null,
  }))
}

function mergeOtherFees(
  saved: OtherFee[] | undefined,
  opportunityType: string | null,
  defaultCurrencyId: number | null
): OtherFee[] {
  const byCode = new Map((saved ?? []).map((f) => [f.conceptCode, f]))
  return OTHER_FEE_CONCEPTS.map((conceptCode) => {
    const existing = byCode.get(conceptCode)
    if (existing) {
      // A row saved before this fix could still have a null currency on a
      // hasCurrency concept — backfill it the same way a fresh one gets one,
      // rather than leaving old quotes permanently stuck blank.
      return existing.currencyId === null && otherFeeRequiresCurrency(conceptCode)
        ? { ...existing, currencyId: defaultCurrencyId }
        : existing
    }
    return {
      conceptCode,
      amount: otherFeeDefault(conceptCode, opportunityType),
      isPercentage: OTHER_FEE_META[conceptCode].isPercentage,
      currencyId: otherFeeRequiresCurrency(conceptCode) ? defaultCurrencyId : null,
    }
  })
}

function defaultFields(opportunityType: string | null, defaultCurrencyId: number | null): SetupFeeFields {
  return {
    feeType: 'setup',
    quotedPrice: 0,
    paymentSchedule: 'full',
    paymentMilestones: [],
    joiningFeeBillingType: 'at_signing',
    mcfType: 'standard',
    mcfBillingStart: 'at_signing',
    standardCommitmentFee: 0,
    commitmentFeeDiscountPct: 0,
    mcfPrincipalSlots: [],
    mcfBlockFees: [],
    waivedMonths: 0,
    rebateIncentive: false,
    rebateType: null,
    otherFees: defaultOtherFees(opportunityType, defaultCurrencyId),
  }
}

function fieldsFromSetupFee(
  setupFee: SetupFee,
  opportunityType: string | null,
  defaultCurrencyId: number | null
): SetupFeeFields {
  return {
    feeType: setupFee.feeType,
    quotedPrice: setupFee.quotedPrice,
    paymentSchedule: setupFee.paymentSchedule,
    paymentMilestones: setupFee.paymentMilestones ?? [],
    joiningFeeBillingType: setupFee.joiningFeeBillingType,
    mcfType: setupFee.mcfType,
    mcfBillingStart: setupFee.mcfBillingStart,
    standardCommitmentFee: setupFee.standardCommitmentFee ?? 0,
    commitmentFeeDiscountPct: setupFee.commitmentFeeDiscountPct ?? 0,
    mcfPrincipalSlots: setupFee.mcfPrincipalSlots ?? [],
    mcfBlockFees: setupFee.mcfBlockFees ?? [],
    waivedMonths: setupFee.waivedMonths,
    rebateIncentive: setupFee.rebateIncentive,
    rebateType: setupFee.rebateType ?? null,
    otherFees: mergeOtherFees(setupFee.otherFees, opportunityType, defaultCurrencyId),
  }
}

/** Months 1-6, 7-12, 13+ — only the third slot applies to contracts longer than a year. */
function defaultPrincipalSlots(contractLengthYears: number) {
  const slots = [
    { slotIndex: 0, label: 'Months 1-6', startMonth: 1, endMonth: 6, monthlyPrincipal: 0, ratePct: 0 },
    { slotIndex: 1, label: 'Months 7-12', startMonth: 7, endMonth: 12, monthlyPrincipal: 0, ratePct: 0 },
  ]
  if (contractLengthYears * 12 > 12) {
    slots.push({
      slotIndex: 2,
      label: 'Month 13 - end of contract',
      startMonth: 13,
      endMonth: undefined as unknown as number,
      monthlyPrincipal: 0,
      ratePct: 0,
    })
  }
  return slots
}

/** Year 1 splits into two halves, later years are one block each — matches how the old app's schedule is actually used. */
function blockKeysForContract(contractLengthYears: number): { key: string; label: string }[] {
  const blocks = [
    { key: 'y1_h1', label: 'Year 1, Months 1-6' },
    { key: 'y1_h2', label: 'Year 1, Months 7-12' },
  ]
  for (let year = 2; year <= contractLengthYears; year += 1) {
    blocks.push({ key: `y${year}`, label: `Year ${year}` })
  }
  return blocks
}

export function SetupFeeTab({
  tabKey,
  quoteId,
  contractLengthYears,
  opportunityType,
  updateSetupFee,
}: {
  tabKey: string
  quoteId: number | null
  contractLengthYears: number
  opportunityType: string | null
  updateSetupFee: ReturnType<typeof useUpdateSetupFee>
}) {
  if (quoteId === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-24 text-center">
        <h2 className="text-lg font-semibold">Save the draft first</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          The setup fee is saved against a real pricing request. Click "Save Draft" first, then come
          back here.
        </p>
      </div>
    )
  }

  return (
    <SetupFeeTabContent
      tabKey={tabKey}
      quoteId={quoteId}
      contractLengthYears={contractLengthYears}
      opportunityType={opportunityType}
      updateSetupFee={updateSetupFee}
    />
  )
}

function SetupFeeTabContent({
  tabKey,
  quoteId,
  contractLengthYears,
  opportunityType,
  updateSetupFee,
}: {
  tabKey: string
  quoteId: number
  contractLengthYears: number
  opportunityType: string | null
  updateSetupFee: ReturnType<typeof useUpdateSetupFee>
}) {
  const { data: setupFee, isLoading } = useSetupFee(quoteId)
  const { data: currencies } = useCurrencies()
  const defaultCurrencyId = currencies?.find((c) => c.isoCode3 === 'USD')?.id ?? null

  // The tab's draft form lives in the shared workspace store, not local
  // component state — so the single "Save Draft" button can see and save
  // it, and so it survives switching to another tab and back (Radix
  // unmounts inactive TabsContent by default).
  const draft = useQuoteWorkspaceStore((s) => s.pendingSetupFee[tabKey])
  const updateDraftSetupFee = useQuoteWorkspaceStore((s) => s.updateDraftSetupFee)
  const form =
    draft ??
    (setupFee
      ? fieldsFromSetupFee(setupFee, opportunityType, defaultCurrencyId)
      : defaultFields(opportunityType, defaultCurrencyId))

  function setForm(updater: (f: SetupFeeFields) => SetupFeeFields) {
    updateDraftSetupFee(tabKey, updater(form))
  }

  // Live preview, recomputed on every keystroke from the same shared math the
  // backend uses — matches the old app's real-time Year 1/TCV cards instead
  // of only showing numbers after a round-trip to the server.
  const liveTotals = useMemo(
    () =>
      computeSetupFeeTotals({
        quotedPrice: form.quotedPrice,
        mcfType: form.mcfType,
        standardCommitmentFee: form.standardCommitmentFee ?? 0,
        commitmentFeeDiscountPct: form.commitmentFeeDiscountPct ?? 0,
        mcfPrincipalSlots: form.mcfPrincipalSlots ?? [],
        mcfBlockFees: form.mcfBlockFees ?? [],
        waivedMonths: form.waivedMonths,
        contractLengthYears,
      }),
    [form, contractLengthYears]
  )
  const canUseCustomSchedule = form.quotedPrice > YEAR1_REVENUE_APPROVAL_THRESHOLD_USD

  // Live, real-time indicator for the same rule the backend uses to decide
  // approval — no round trip needed to see it, matching the Other Fees
  // indicators above. Upsell bypasses every setup-fee approval check
  // server-side, so it's suppressed here too.
  const isUpsellOpportunity = opportunityType?.trim().toLowerCase() === 'upsell'
  const hasRamp =
    !isUpsellOpportunity && form.mcfType === 'standard' && hasCommitmentFeeRamp(form.mcfBlockFees ?? [])

  // Matches the old app's real-time rule: Custom is only available above the
  // Quoting Price threshold — auto-reset back to the standard schedule the
  // moment the price drops at or below it while Custom is still selected.
  // Handled inline at the point of change (not an effect) to avoid a
  // cascading extra render.
  function handleQuotedPriceChange(raw: string) {
    const quotedPrice = Number(raw)
    setForm((f) => ({
      ...f,
      quotedPrice,
      paymentSchedule:
        f.paymentSchedule === 'custom' && quotedPrice <= YEAR1_REVENUE_APPROVAL_THRESHOLD_USD
          ? 'full'
          : f.paymentSchedule,
    }))
  }

  const [waivedMonthsWarning, setWaivedMonthsWarning] = useState(false)

  function handleWaivedMonthsChange(raw: string) {
    const parsed = Number(raw)
    if (Number.isNaN(parsed)) return
    if (parsed > MAX_WAIVED_MONTHS) {
      setWaivedMonthsWarning(true)
      setForm((f) => ({ ...f, waivedMonths: MAX_WAIVED_MONTHS }))
      return
    }
    setWaivedMonthsWarning(false)
    setForm((f) => ({ ...f, waivedMonths: Math.max(0, parsed) }))
  }

  // Readable error split: fields we can attribute to one exact input show
  // their message right there; everything else (nested rows, business-rule
  // rejections) is a short bullet list instead of one run-on string.
  const fieldErrors = getApiFieldErrors(updateSetupFee.error) ?? []
  const scalarErrors = new Map(
    fieldErrors
      .filter((e) => (SCALAR_ERROR_FIELDS as readonly string[]).includes(e.field))
      .map((e) => [e.field, e.message])
  )
  const otherErrorMessages =
    fieldErrors.length > 0
      ? fieldErrors
          .filter((e) => !(SCALAR_ERROR_FIELDS as readonly string[]).includes(e.field))
          .map((e) => e.message)
      : updateSetupFee.isError
        ? [getApiErrorMessage(updateSetupFee.error)]
        : []

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading setup fee…</p>
  }

  const milestoneTotal = (form.paymentMilestones ?? []).reduce((sum, m) => sum + m.percentage, 0)

  function updateOtherFee(conceptCode: OtherFeeConcept, patch: Partial<OtherFee>) {
    setForm((f) => ({
      ...f,
      otherFees: (f.otherFees ?? []).map((fee) =>
        fee.conceptCode === conceptCode ? { ...fee, ...patch } : fee
      ),
    }))
  }

  function addMilestone() {
    const remaining = Math.max(0, 100 - milestoneTotal)
    setForm((f) => ({
      ...f,
      paymentMilestones: [
        ...(f.paymentMilestones ?? []),
        { milestone: `Milestone ${((f.paymentMilestones ?? []).length ?? 0) + 1}`, percentage: remaining },
      ],
    }))
  }

  function removeMilestone(index: number) {
    setForm((f) => ({
      ...f,
      paymentMilestones: (f.paymentMilestones ?? []).filter((_, i) => i !== index),
    }))
  }

  function switchMcfType(mcfType: McfType) {
    setForm((f) => ({
      ...f,
      mcfType,
      mcfPrincipalSlots:
        mcfType === 'principal' && (f.mcfPrincipalSlots ?? []).length === 0
          ? defaultPrincipalSlots(contractLengthYears)
          : f.mcfPrincipalSlots,
    }))
  }

  function updatePrincipalSlot(slotIndex: number, patch: { monthlyPrincipal?: number; ratePct?: number }) {
    setForm((f) => ({
      ...f,
      mcfPrincipalSlots: (f.mcfPrincipalSlots ?? []).map((slot) =>
        slot.slotIndex === slotIndex ? { ...slot, ...patch } : slot
      ),
    }))
  }

  function updateBlockFee(blockKey: string, commitmentFee: number) {
    setForm((f) => {
      const existing = f.mcfBlockFees ?? []
      const withoutBlock = existing.filter((b) => b.blockKey !== blockKey)
      return { ...f, mcfBlockFees: [...withoutBlock, { blockKey, commitmentFee }] }
    })
  }

  return (
    <div className="space-y-6">
      {otherErrorMessages.length > 0 && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <ul className="list-disc space-y-0.5 pl-5">
            {otherErrorMessages.map((message, i) => (
              <li key={i}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      {setupFee?.needsApproval && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-medium">This setup fee requires approval:</p>
          <ul className="mt-1 list-disc pl-5">
            {setupFee.approvalReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      <CollapsibleSection title="One-Off Fee">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField
            label="One-Off Fee Type"
            caption="The selected fee becomes the quoting price used in TCV calculations"
          >
            <SimpleSelect
              value={form.feeType}
              onValueChange={(v) => setForm((f) => ({ ...f, feeType: v as FeeType }))}
              options={FEE_TYPES}
            />
          </FormField>
          <FormField label="Quoting Price">
            <Input
              type="number"
              value={form.quotedPrice}
              aria-invalid={!!scalarErrors.get('quotedPrice')}
              onChange={(e) => handleQuotedPriceChange(e.target.value)}
            />
            {scalarErrors.get('quotedPrice') && (
              <p className="text-xs text-destructive">{scalarErrors.get('quotedPrice')}</p>
            )}
          </FormField>
          <FormField
            label="Payment Schedule"
            caption={
              canUseCustomSchedule
                ? undefined
                : `Custom requires a Quoting Price above $${YEAR1_REVENUE_APPROVAL_THRESHOLD_USD.toLocaleString()}`
            }
          >
            <SimpleSelect
              value={form.paymentSchedule}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  paymentSchedule: v as PaymentSchedule,
                  paymentMilestones:
                    v === 'custom' && (f.paymentMilestones ?? []).length === 0
                      ? [
                          { milestone: 'On Contract Signature', percentage: 50 },
                          { milestone: 'Within 90 days', percentage: 50 },
                        ]
                      : f.paymentMilestones,
                }))
              }
              options={PAYMENT_SCHEDULES.map((option) =>
                option.value === 'custom' ? { ...option, disabled: !canUseCustomSchedule } : option
              )}
            />
          </FormField>
          <FormField label="Joining Fee Billing Type">
            <SimpleSelect
              value={form.joiningFeeBillingType}
              onValueChange={(v) => setForm((f) => ({ ...f, joiningFeeBillingType: v as JoiningFeeBillingType }))}
              options={JOINING_FEE_BILLING_TYPES}
            />
          </FormField>
        </div>

        {form.paymentSchedule === 'custom' && (
          <div className="mt-4 rounded-md border p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">
                Custom Payment Schedule{' '}
                <span className={milestoneTotal === 100 ? 'text-muted-foreground' : 'text-destructive'}>
                  ({milestoneTotal}% of 100%)
                </span>
              </p>
              <Button type="button" variant="outline" size="sm" onClick={addMilestone}>
                Add milestone
              </Button>
            </div>
            <div className="space-y-2">
              {(form.paymentMilestones ?? []).map((milestone, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={milestone.milestone}
                    placeholder="Milestone"
                    className="flex-1"
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        paymentMilestones: (f.paymentMilestones ?? []).map((m, i) =>
                          i === index ? { ...m, milestone: e.target.value } : m
                        ),
                      }))
                    }
                  />
                  <Input
                    type="number"
                    value={milestone.percentage}
                    className="w-24"
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        paymentMilestones: (f.paymentMilestones ?? []).map((m, i) =>
                          i === index ? { ...m, percentage: Number(e.target.value) } : m
                        ),
                      }))
                    }
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMilestone(index)}
                    disabled={(form.paymentMilestones ?? []).length <= 1}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Monthly Commitment Fee">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="Commitment Fee Type">
            <SimpleSelect
              value={form.mcfType}
              onValueChange={(v) => switchMcfType(v as McfType)}
              options={MCF_TYPES}
            />
          </FormField>
          <FormField label="MCF Billing Start">
            <SimpleSelect
              value={form.mcfBillingStart}
              onValueChange={(v) => setForm((f) => ({ ...f, mcfBillingStart: v as McfBillingStart }))}
              options={MCF_BILLING_STARTS}
            />
          </FormField>
          <FormField
            label="Waived Months"
            caption={
              waivedMonthsWarning || scalarErrors.get('waivedMonths')
                ? undefined
                : `0-${MAX_WAIVED_MONTHS}; 4 or more requires approval`
            }
          >
            <Input
              type="number"
              min={0}
              max={MAX_WAIVED_MONTHS}
              value={form.waivedMonths}
              aria-invalid={waivedMonthsWarning || !!scalarErrors.get('waivedMonths')}
              onChange={(e) => handleWaivedMonthsChange(e.target.value)}
            />
            {waivedMonthsWarning && (
              <p className="text-xs text-destructive">Max {MAX_WAIVED_MONTHS} months allowed.</p>
            )}
            {!waivedMonthsWarning && scalarErrors.get('waivedMonths') && (
              <p className="text-xs text-destructive">{scalarErrors.get('waivedMonths')}</p>
            )}
          </FormField>

          {form.mcfType === 'standard' && (
            <>
              <FormField label="Monthly Commitment Fee">
                <Input
                  type="number"
                  value={form.standardCommitmentFee}
                  aria-invalid={!!scalarErrors.get('standardCommitmentFee')}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, standardCommitmentFee: Number(e.target.value) }))
                  }
                />
                {scalarErrors.get('standardCommitmentFee') && (
                  <p className="text-xs text-destructive">{scalarErrors.get('standardCommitmentFee')}</p>
                )}
              </FormField>
              <FormField label="Commitment Fee Discount %">
                <Input
                  type="number"
                  value={form.commitmentFeeDiscountPct}
                  aria-invalid={!!scalarErrors.get('commitmentFeeDiscountPct')}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, commitmentFeeDiscountPct: Number(e.target.value) }))
                  }
                />
                {scalarErrors.get('commitmentFeeDiscountPct') && (
                  <p className="text-xs text-destructive">{scalarErrors.get('commitmentFeeDiscountPct')}</p>
                )}
              </FormField>
            </>
          )}
        </div>

        {form.mcfType === 'principal' && (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium">Committed Principal by Period</p>
            {(form.mcfPrincipalSlots ?? []).map((slot) => (
              <div key={slot.slotIndex} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-4">
                <p className="text-sm text-muted-foreground sm:col-span-1">{slot.label}</p>
                <FormField label="Monthly Committed Principal">
                  <Input
                    type="number"
                    value={slot.monthlyPrincipal}
                    onChange={(e) =>
                      updatePrincipalSlot(slot.slotIndex, { monthlyPrincipal: Number(e.target.value) })
                    }
                  />
                </FormField>
                <FormField label="Variable Commitment Fee (%)">
                  <Input
                    type="number"
                    step="0.01"
                    value={slot.ratePct}
                    onChange={(e) => updatePrincipalSlot(slot.slotIndex, { ratePct: Number(e.target.value) })}
                  />
                </FormField>
                <p className="text-sm text-muted-foreground">
                  Fee: ${((slot.monthlyPrincipal * slot.ratePct) / 100).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}

        {form.mcfType === 'standard' && (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium">
              Commitment Fee by Period{' '}
              <span className="font-normal text-muted-foreground">
                (optional — leave blank to use the fee above for that period)
              </span>
            </p>
            {hasRamp && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                These per-period fees differ from each other — needs approval
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {blockKeysForContract(contractLengthYears).map(({ key, label }) => {
                const override = (form.mcfBlockFees ?? []).find((b) => b.blockKey === key)
                return (
                  <FormField key={key} label={label}>
                    <Input
                      type="number"
                      placeholder={String(form.standardCommitmentFee ?? 0)}
                      value={override?.commitmentFee ?? ''}
                      onChange={(e) => updateBlockFee(key, Number(e.target.value))}
                    />
                  </FormField>
                )
              })}
            </div>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Other Fees">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(form.otherFees ?? []).map((fee) => {
            const meta = OTHER_FEE_META[fee.conceptCode]
            // Live, per-field indicator — computed with the exact same
            // shared function the backend uses to decide approval, so it
            // can never show a false positive/negative relative to what
            // Save will actually flag. Upsell bypasses every setup-fee
            // approval check server-side, so it never shows here either.
            const isUpsell = opportunityType?.trim().toLowerCase() === 'upsell'
            const differsFromDefault =
              !isUpsell && otherFeeDiffersFromDefault(fee.conceptCode, fee.amount, opportunityType)
            return (
              <FormField key={fee.conceptCode} label={meta.label}>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step={meta.isPercentage ? '0.01' : '1'}
                    value={fee.amount}
                    aria-invalid={differsFromDefault}
                    onChange={(e) => updateOtherFee(fee.conceptCode, { amount: Number(e.target.value) })}
                  />
                  <span className="text-sm text-muted-foreground">{meta.isPercentage ? '%' : '$'}</span>
                </div>
                {differsFromDefault && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Differs from the default of{' '}
                    {meta.isPercentage
                      ? `${otherFeeDefault(fee.conceptCode, opportunityType)}%`
                      : `$${otherFeeDefault(fee.conceptCode, opportunityType)}`}{' '}
                    — needs approval
                  </p>
                )}
                {otherFeeRequiresCurrency(fee.conceptCode) && (
                  <>
                    <SimpleSelect
                      value={fee.currencyId ? String(fee.currencyId) : ''}
                      onValueChange={(v) => updateOtherFee(fee.conceptCode, { currencyId: Number(v) })}
                      options={(currencies ?? []).map((c) => ({ value: String(c.id), label: c.isoCode3 }))}
                      placeholder="Currency"
                      ariaInvalid={fee.currencyId === null}
                    />
                    {fee.currencyId === null && (
                      <p className="text-xs text-destructive">A currency is required for this fee.</p>
                    )}
                  </>
                )}
              </FormField>
            )
          })}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Rebate Incentive">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="Rebate Incentive"
            caption="Requires Pricing Team approval — no auto-approval"
          >
            <SimpleSelect
              value={form.rebateIncentive ? 'yes' : 'no'}
              onValueChange={(v) => setForm((f) => ({ ...f, rebateIncentive: v === 'yes' }))}
              options={[
                { value: 'no', label: 'NO' },
                { value: 'yes', label: 'YES' },
              ]}
            />
          </FormField>
          {form.rebateIncentive && (
            <FormField label="Rebate Type">
              <SimpleSelect
                value={form.rebateType ?? ''}
                onValueChange={(v) => setForm((f) => ({ ...f, rebateType: v as RebateType }))}
                options={REBATE_TYPES}
                ariaInvalid={form.rebateType === null}
              />
              {form.rebateType === null && (
                <p className="text-xs text-destructive">Required when Rebate Incentive is enabled.</p>
              )}
            </FormField>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Computed Summary" defaultOpen>
        <p className="mb-3 text-xs text-muted-foreground">
          Updates live as you edit — matches what the backend will compute on save. Click "Save
          Draft" at the top of the page to save this along with everything else.
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryStat label="Final Commitment Fee" value={liveTotals.finalCommitmentFee} />
          <SummaryStat label="Year 1 Commitment Fees" value={liveTotals.year1CommitmentFees} />
          <SummaryStat label="Year 1 Committed Revenue" value={liveTotals.year1CommittedRevenue} />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ThresholdCard
            title="Year 1 Contract Value"
            value={liveTotals.year1CommittedRevenue}
            isBelowThreshold={isYear1RevenueBelowThreshold(liveTotals.year1CommittedRevenue)}
            thresholdLabel={`$${YEAR1_REVENUE_APPROVAL_THRESHOLD_USD.toLocaleString()}`}
          />
          <ThresholdCard
            title="Total Contract Value"
            value={liveTotals.totalContractValue}
            isBelowThreshold={isTotalContractValueBelowThreshold(liveTotals.totalContractValue)}
            thresholdLabel={`$${TOTAL_CONTRACT_VALUE_APPROVAL_THRESHOLD_USD.toLocaleString()}`}
          />
        </div>
      </CollapsibleSection>

      {opportunityType?.trim().toLowerCase() === 'upsell' && (
        <p className="text-xs text-muted-foreground">
          Opportunity Type is "Upsell" — approval checks above are bypassed for this quote, matching
          standard policy for existing partners.
        </p>
      )}
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div>
      <p className="text-lg font-bold">${(value ?? 0).toLocaleString()}</p>
      <p className="text-xs text-muted-foreground uppercase">{label}</p>
    </div>
  )
}

/** Matches the old app's real-time Year 1/TCV cards: red "Below $X minimum" or green "Meets $X minimum". */
function ThresholdCard({
  title,
  value,
  isBelowThreshold,
  thresholdLabel,
}: {
  title: string
  value: number
  isBelowThreshold: boolean
  thresholdLabel: string
}) {
  return (
    <div
      className={cn(
        'rounded-md border p-3',
        isBelowThreshold
          ? 'border-destructive/50 bg-destructive/10'
          : 'border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950'
      )}
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="text-lg font-bold">${value.toLocaleString()}</p>
      <p
        className={cn(
          'text-xs font-medium',
          isBelowThreshold ? 'text-destructive' : 'text-green-700 dark:text-green-300'
        )}
      >
        {isBelowThreshold ? `Below ${thresholdLabel} minimum - Needs Approval` : `Meets ${thresholdLabel} minimum`}
      </p>
    </div>
  )
}
