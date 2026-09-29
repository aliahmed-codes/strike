import { Fragment, useState, type ReactNode } from 'react'
import ExcelJS from 'exceljs'
import { AlertTriangle, Filter } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  CORRIDOR_FIELD_LIMITS,
  computeCorridorPricing,
  computeFxDefaultSpreadPct,
  computeFxMinimumSpreadPct,
  computeQuoteTotals,
  computeTieredCorridorPricing,
  computeTreasuryFxCostPct,
  computeYearlyTransactions,
  feeCurrencyToUsd,
  resolveMbpFee,
  seedQuoteCorridorFromCatalog,
  usdToFeeCurrencyAmount,
  validateCorridorField,
  validateTierAllocation,
  type Corridor,
  type CorridorLimitedField,
  type CorridorTierInput,
  type MbpAdjustmentResult,
  type PricedCorridor,
  type PricingModel,
  type QuoteCorridor,
  type QuoteCorridorInput,
} from '@strike/shared'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { getApiErrorMessage, getApiFieldErrors } from '@/lib/api-error'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { useCorridorCatalog, useCorridorFacets, useCurrencies, useMatchingCorridors } from '../api/useReferenceData'
import { useQuote } from '../api/useQuotes'
import {
  useAddQuoteCorridor,
  useBulkDeleteQuoteCorridors,
  useBulkRestoreQuoteCorridors,
  useDeletedQuoteCorridors,
  useRemoveQuoteCorridor,
  useUpdateQuoteCorridor,
} from '../api/useQuoteCorridors'
import { CollapsibleSection } from './CollapsibleSection'
import { CorridorsToOfferSection, corridorLabel, useAppliedCorridorFilters } from './CorridorsToOfferSection'
import { useQuoteFormField } from '../hooks/useQuoteFormField'
import { FormField } from './FormField'
import { SimpleSelect } from './SimpleSelect'
import { useCorridorEditsStore, type CorridorRowEdit } from '../store/useCorridorEditsStore'

const RESTRICTED_USE_CASE_LABELS = new Set(['last mile payout', 'account top-up'])

/** Radix Select can't take an empty-string item value, so "use the catalog's own FX Source" needs a real sentinel instead of null/''. */
const FX_SOURCE_CATALOG_DEFAULT = '__catalog_default__'

// A stable reference for "no pending edits" — a fresh `{}` literal from the
// Zustand selector below would look like a store change on every render to
// `useSyncExternalStore`, causing an infinite re-render loop.
const NO_ROW_EDITS: Record<string, CorridorRowEdit> = {}

interface EditableFields {
  atvUsd: number
  yearlyVolumeUsd: number
  /** Never directly typed — always `computeYearlyTransactions(yearlyVolumeUsd, atvUsd)`, matching the old app's real non-editable "Yearly transactions" column. */
  yearlyTransactions: number
  fixedFeeUsd: number
  variableFeePct: number
  appliedFxSpread: number
  feeDiscountPct: number
  /** Per-row overrides of the corridor catalog's own master data — null means "use the catalog value". The old app's real editable "Fx Source"/"T.E FX Cost Spread %"/"Fixed Cost in USD"/"Variable Cost %" cells. */
  fxSourceOverride: string | null
  treasuryFxCostSpreadOverride: number | null
  costFixedUsdOverride: number | null
  costVariablePctOverride: number | null
}

/** The subset of `EditableFields` that's a plain number the generic numeric-input handler can write — `fxSourceOverride` is a string and goes through its own dropdown handler instead. */
type NumericEditableField = Exclude<keyof EditableFields, 'fxSourceOverride'>

/** A row's effective treasury FX cost — its override if set, else the catalog value — the single place every FX-spread-preset/margin display reads from, so an edit is guaranteed to affect every dependent number consistently (see corridor_pricing_math.ts). */
function effectiveTreasuryFxCostSpread(current: EditableFields, corridor: Corridor): number | null {
  return current.treasuryFxCostSpreadOverride ?? corridor.treasuryFxCostSpread
}

/** The fields both a standard and a tiered pricing result share, so the table can display either uniformly. */
interface PricingSummary {
  totalRevenue: number
  totalMargin: number
  fxMargin: number
  fxMarginPct: number
  marginFee: number
  marginFeePct: number
  marginPct: number
  grossMarginPct: number
  takeRatePct: number
  needsApproval: boolean
  needsFinancialApproval: boolean
  financialApprovalReasons: string[]
  needsNetworkApproval: boolean
  networkApprovalReasons: string[]
}

/**
 * One row on the "Priced Corridors" table — either a real saved
 * `quote_corridors` row, or a corridor matched by the "Corridors to Offer"
 * filters that hasn't been edited (and therefore saved) yet. Saved rows
 * always render, unconditionally, regardless of the current filters — only
 * preview rows come and go as filters change.
 */
type DisplayRow =
  | { kind: 'saved'; key: string; row: QuoteCorridor }
  | { kind: 'preview'; key: string; corridor: Corridor; fundingCurrencyId: number | null }

/** One preview row per matching corridor per quote funding currency, e.g. `preview-42:7` or `preview-42:none`. */
function previewKey(corridorId: number, fundingCurrencyId: number | null): string {
  return `preview-${corridorId}:${fundingCurrencyId ?? 'none'}`
}

function parsePreviewKey(key: string): { corridorId: number; fundingCurrencyId: number | null } {
  const [corridorPart, currencyPart] = key.slice('preview-'.length).split(':')
  return {
    corridorId: Number(corridorPart),
    fundingCurrencyId: currencyPart === 'none' ? null : Number(currencyPart),
  }
}

function savedPairKey(corridorId: number, fundingCurrencyId: number | null): string {
  return `${corridorId}:${fundingCurrencyId ?? 'none'}`
}

/**
 * One computed view per displayed row (saved or preview) — the single place
 * that resolves "what does this row currently show," reused for rendering,
 * for the Pricing tab's own column filter/sort, and for the Summary totals.
 * A row's effective totalRevenue/marginPct/etc. is its live preview value
 * when dirty/unsaved, or its saved value otherwise — the same fallback the
 * table cells already display.
 */
interface RowView {
  item: DisplayRow
  corridor: Corridor | undefined
  savedRow: QuoteCorridor | null
  isPreview: boolean
  current: EditableFields
  isTiered: boolean
  currentTiers: CorridorTierInput[]
  fundingCurrencyId: number | null
  fundingCurrencyObj: { isoCode3: string; feeConversionRateToUsd: number | null } | undefined
  isDirty: boolean
  previewSummary: PricingSummary | null
  totalRevenue: number | null
  totalMargin: number | null
  fxMargin: number | null
  fxMarginPct: number | null
  marginFee: number | null
  marginFeePct: number | null
  marginPct: number | null
  grossMarginPct: number | null
  takeRatePct: number | null
  needsApproval: boolean
  needsFinancialApproval: boolean
  needsNetworkApproval: boolean
  /** The live Market-Based Pricing result for a saved row (recomputed fresh on every quote fetch) or a preview row (from the quoteId-aware matching-corridors preview) — `null` if no rule currently matches. */
  mbp: MbpAdjustmentResult | null
  /** False for every preview row (nothing saved yet to have been manually touched). For a saved row, mirrors `savedRow.fixedFeeManuallySet`. */
  fixedFeeManuallySet: boolean
  /** What MBP (or the catalog, if no rule matches) currently says the fee should be — compared against `current.fixedFeeUsd` to show the "out of date" hint. */
  liveMbpFee: number | null
}

type SortField = 'corridor' | 'fundingCurrency' | 'volume' | 'revenue' | 'marginPct' | 'takeRate' | 'approval'
type SortDirection = 'asc' | 'desc'
interface SortState {
  field: SortField
  direction: SortDirection
}

/** Click cycles asc -> desc -> unsorted, matching the old app's real sort-header behavior. */
function cycleSort(previous: SortState | null, field: SortField): SortState | null {
  if (!previous || previous.field !== field) return { field, direction: 'asc' }
  if (previous.direction === 'asc') return { field, direction: 'desc' }
  return null
}

function sortValue(row: RowView, field: SortField): string | number {
  switch (field) {
    case 'corridor':
      return row.corridor ? corridorLabel(row.corridor) : ''
    case 'fundingCurrency':
      return row.fundingCurrencyObj?.isoCode3 ?? ''
    case 'volume':
      return row.current.yearlyVolumeUsd
    case 'revenue':
      return row.totalRevenue ?? -Infinity
    case 'marginPct':
      return row.marginPct ?? -Infinity
    case 'takeRate':
      return row.takeRatePct ?? -Infinity
    case 'approval':
      return row.needsApproval ? 1 : 0
  }
}

function sortRows(rows: RowView[], sort: SortState | null): RowView[] {
  if (!sort) return rows
  const sorted = [...rows].sort((a, b) => {
    const av = sortValue(a, sort.field)
    const bv = sortValue(b, sort.field)
    return typeof av === 'string' && typeof bv === 'string' ? av.localeCompare(bv) : (av as number) - (bv as number)
  })
  return sort.direction === 'desc' ? sorted.reverse() : sorted
}

type ApprovalFilterValue = 'yes' | 'no'

/**
 * Matches the old app's real "Filter Corridors" modal dimension-for-
 * dimension, but as one flat model applied through a single function below
 * instead of the old app's duplicated filter-application code and six
 * separate hardcoded "negative value" booleans scattered across two places.
 */
interface TableFilters {
  regionIds: number[]
  countryIds: number[]
  transactionTypeCodes: string[]
  serviceCodes: string[]
  payoutCurrencyIds: number[]
  fxSources: string[]
  fundingCurrencyIds: number[]
  /** Empty = no filter on this dimension; otherwise only rows whose value is in this set. */
  financialApproval: ApprovalFilterValue[]
  networkApproval: ApprovalFilterValue[]
  showOnlyUsdSwift: boolean
  hideUsdSwift: boolean
  showOnlyZeroVolume: boolean
  showOnlyNonZeroVolume: boolean
  negativeMarginFee: boolean
  negativeMarginFeePercent: boolean
  negativeFxMargin: boolean
  negativeFxMarginPercent: boolean
  negativeMarginPercent: boolean
  negativeGrossMarginPercent: boolean
}

const DEFAULT_TABLE_FILTERS: TableFilters = {
  regionIds: [],
  countryIds: [],
  transactionTypeCodes: [],
  serviceCodes: [],
  payoutCurrencyIds: [],
  fxSources: [],
  fundingCurrencyIds: [],
  financialApproval: [],
  networkApproval: [],
  showOnlyUsdSwift: false,
  hideUsdSwift: false,
  showOnlyZeroVolume: false,
  showOnlyNonZeroVolume: false,
  negativeMarginFee: false,
  negativeMarginFeePercent: false,
  negativeFxMargin: false,
  negativeFxMarginPercent: false,
  negativeMarginPercent: false,
  negativeGrossMarginPercent: false,
}

function isTableFiltersActive(filters: TableFilters): boolean {
  return JSON.stringify(filters) !== JSON.stringify(DEFAULT_TABLE_FILTERS)
}

/** Same rule the backend's "Hide USD SWIFT" facet filter uses (corridor_facet_service.ts), so the two never disagree. */
function isUsdSwiftCorridor(corridor: Corridor): boolean {
  return corridor.payerCode.toLowerCase().includes('swift wire transfer')
}

function matchesTableFilters(row: RowView, filters: TableFilters): boolean {
  const corridor = row.corridor
  if (filters.regionIds.length > 0) {
    const regionId = corridor?.country?.region?.id
    if (regionId === undefined || !filters.regionIds.includes(regionId)) return false
  }
  if (filters.countryIds.length > 0 && !filters.countryIds.includes(corridor?.countryId ?? -1)) return false
  if (
    filters.transactionTypeCodes.length > 0 &&
    !filters.transactionTypeCodes.includes(corridor?.transactionTypeCode ?? '')
  )
    return false
  if (filters.serviceCodes.length > 0 && !filters.serviceCodes.includes(corridor?.serviceCode ?? '')) return false
  if (
    filters.payoutCurrencyIds.length > 0 &&
    !filters.payoutCurrencyIds.includes(corridor?.payoutCurrencyId ?? -1)
  )
    return false
  if (filters.fxSources.length > 0 && !filters.fxSources.includes(corridor?.fxSource ?? '')) return false
  if (
    filters.fundingCurrencyIds.length > 0 &&
    (row.fundingCurrencyId === null || !filters.fundingCurrencyIds.includes(row.fundingCurrencyId))
  )
    return false
  if (filters.financialApproval.length > 0) {
    const value: ApprovalFilterValue = row.needsFinancialApproval ? 'yes' : 'no'
    if (!filters.financialApproval.includes(value)) return false
  }
  if (filters.networkApproval.length > 0) {
    const value: ApprovalFilterValue = row.needsNetworkApproval ? 'yes' : 'no'
    if (!filters.networkApproval.includes(value)) return false
  }
  if (filters.showOnlyUsdSwift && !(corridor && isUsdSwiftCorridor(corridor))) return false
  if (filters.hideUsdSwift && corridor && isUsdSwiftCorridor(corridor)) return false
  if (filters.showOnlyZeroVolume && row.current.yearlyVolumeUsd !== 0) return false
  if (filters.showOnlyNonZeroVolume && row.current.yearlyVolumeUsd <= 0) return false
  // "Show corridors with negative values" — any checked box is a reason to
  // include the row (OR across the group), matching the group's own label:
  // each checkbox names an additional condition to surface, not a stricter
  // requirement to satisfy all of them at once.
  const negativeChecks: [boolean, number | null][] = [
    [filters.negativeMarginFee, row.marginFee],
    [filters.negativeMarginFeePercent, row.marginFeePct],
    [filters.negativeFxMargin, row.fxMargin],
    [filters.negativeFxMarginPercent, row.fxMarginPct],
    [filters.negativeMarginPercent, row.marginPct],
    [filters.negativeGrossMarginPercent, row.grossMarginPct],
  ]
  const activeNegativeChecks = negativeChecks.filter(([enabled]) => enabled)
  if (activeNegativeChecks.length > 0 && !activeNegativeChecks.some(([, value]) => value !== null && value < 0)) {
    return false
  }
  return true
}

const EMPTY_TIER: Omit<CorridorTierInput, 'tierNumber'> = {
  yearlyVolumeUsd: 0,
  fixedFeeUsd: 0,
  variableFeePct: 0,
  appliedFxSpread: 0,
}

type BulkEditField = keyof EditableFields | 'fixedFeeInSelectedCurrency' | 'mbpPricing'

const BULK_EDIT_FIELDS: {
  field: BulkEditField
  label: string
  isPercent: boolean
  allowNegative: boolean
  /** No real data source exists for this yet (see FEATURES.md) — shown in the dropdown for visual parity with the old app, but Apply stays disabled rather than silently applying fake/zeroed values. */
  notYetAvailable?: boolean
}[] = [
  { field: 'atvUsd', label: 'ATV (USD)', isPercent: false, allowNegative: false },
  { field: 'yearlyVolumeUsd', label: 'Yearly Volume (USD)', isPercent: false, allowNegative: false },
  { field: 'yearlyTransactions', label: 'Yearly Transactions', isPercent: false, allowNegative: false },
  { field: 'fixedFeeUsd', label: 'Fixed Fee (USD)', isPercent: false, allowNegative: false },
  { field: 'fixedFeeInSelectedCurrency', label: 'Fixed Fee (Selected Currency)', isPercent: false, allowNegative: false },
  { field: 'variableFeePct', label: 'Variable Fee %', isPercent: true, allowNegative: false },
  { field: 'appliedFxSpread', label: 'Applied FX Spread %', isPercent: true, allowNegative: false },
  { field: 'feeDiscountPct', label: 'Fee Discount %', isPercent: true, allowNegative: true },
  { field: 'mbpPricing', label: 'Apply Market-Based Pricing (MBP)', isPercent: false, allowNegative: false, notYetAvailable: true },
]

const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(2)}%`)
const money = (n: number | null) =>
  n === null ? '—' : `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
const round2 = (n: number) => Math.round(n * 100) / 100

/** Live-preview math — the exact same function the backend uses to compute and validate on save, so this can never drift from what actually gets persisted. */
function previewPricing(
  fields: EditableFields,
  corridor: Corridor,
  fundingCurrencyId: number | null,
  opportunityType: string | null
): PricingSummary {
  return computeCorridorPricing({
    ...fields,
    transactionTypeCode: corridor.transactionTypeCode,
    fundingCurrencyId,
    payoutCurrencyId: corridor.payoutCurrencyId,
    opportunityType,
    corridor: {
      fxSource: corridor.fxSource,
      treasuryFxCostSpread: corridor.treasuryFxCostSpread,
      costFixedUsd: corridor.costFixedUsd,
      costVariablePct: corridor.costVariablePct,
      networkNeedApprovalRaw: corridor.networkNeedApprovalRaw,
      internalRaw: corridor.internalRaw,
      centralBankRaw: corridor.centralBankRaw,
    },
  })
}

/** Same idea, but splitting volume across tiers plus a standard remainder — see packages/shared/src/lib/tiered_pricing_math.ts. */
function previewTieredPricing(
  fields: EditableFields,
  atvUsd: number,
  tiers: CorridorTierInput[],
  corridor: Corridor,
  fundingCurrencyId: number | null,
  opportunityType: string | null
): PricingSummary {
  return computeTieredCorridorPricing({
    totalYearlyVolumeUsd: fields.yearlyVolumeUsd,
    atvUsd,
    standardFixedFeeUsd: fields.fixedFeeUsd,
    standardVariableFeePct: fields.variableFeePct,
    standardAppliedFxSpread: fields.appliedFxSpread,
    feeDiscountPct: fields.feeDiscountPct,
    tiers,
    transactionTypeCode: corridor.transactionTypeCode,
    fundingCurrencyId,
    payoutCurrencyId: corridor.payoutCurrencyId,
    opportunityType,
    corridor: {
      fxSource: corridor.fxSource,
      treasuryFxCostSpread: corridor.treasuryFxCostSpread,
      costFixedUsd: corridor.costFixedUsd,
      costVariablePct: corridor.costVariablePct,
      networkNeedApprovalRaw: corridor.networkNeedApprovalRaw,
      internalRaw: corridor.internalRaw,
      centralBankRaw: corridor.centralBankRaw,
    },
    fxSourceOverride: fields.fxSourceOverride,
    treasuryFxCostSpreadOverride: fields.treasuryFxCostSpreadOverride,
    costFixedUsdOverride: fields.costFixedUsdOverride,
    costVariablePctOverride: fields.costVariablePctOverride,
  })
}

/** A preview row's starting numbers — same seed used to build its promote-on-edit payload, so it never shows different numbers than the row it becomes. Reads `corridor.mbp` (only present when the matching-corridors query was made with a `quoteId`) so a corridor's previewed fee already reflects Market-Based Pricing before it's ever added. */
function previewFieldsFor(corridor: Corridor): EditableFields {
  const seed = seedQuoteCorridorFromCatalog(corridor, corridor.mbp ?? null)
  return {
    atvUsd: seed.atvUsd ?? 0,
    yearlyVolumeUsd: seed.yearlyVolumeUsd,
    yearlyTransactions: seed.yearlyTransactions,
    fixedFeeUsd: seed.fixedFeeUsd,
    variableFeePct: seed.variableFeePct,
    appliedFxSpread: seed.appliedFxSpread,
    feeDiscountPct: seed.feeDiscountPct ?? 0,
    fxSourceOverride: seed.fxSourceOverride ?? null,
    treasuryFxCostSpreadOverride: seed.treasuryFxCostSpreadOverride ?? null,
    costFixedUsdOverride: seed.costFixedUsdOverride ?? null,
    costVariablePctOverride: seed.costVariablePctOverride ?? null,
  }
}

function ApprovalBadge({
  label,
  needed,
  reasons,
}: {
  label: string
  needed: boolean
  reasons: string[]
}) {
  if (!needed) return null
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-200"
        >
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <PopoverTitle>{label} approval needed</PopoverTitle>
        <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

function ApprovalCell({
  needsFinancial,
  financialReasons,
  needsNetwork,
  networkReasons,
}: {
  needsFinancial: boolean
  financialReasons: string[]
  needsNetwork: boolean
  networkReasons: string[]
}) {
  if (!needsFinancial && !needsNetwork) {
    return <span className="text-xs text-muted-foreground">—</span>
  }
  return (
    <div className="flex justify-end gap-1">
      <ApprovalBadge label="Financial" needed={needsFinancial} reasons={financialReasons} />
      <ApprovalBadge label="Network" needed={needsNetwork} reasons={networkReasons} />
    </div>
  )
}

const MBP_SOURCE_LABEL: Record<MbpAdjustmentResult['source'], string> = {
  strategic_override: 'Exception',
  grid: 'Market rule',
  decision_matrix: 'Market adjustment',
}

/** A small pill explaining why Market-Based Pricing changed this corridor's fee — click to see which rule fired and why. */
function MbpBadge({ mbp }: { mbp: MbpAdjustmentResult }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800 hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-200"
        >
          MBP: {MBP_SOURCE_LABEL[mbp.source]}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <PopoverTitle>Market-Based Pricing applied</PopoverTitle>
        <p className="text-xs text-muted-foreground">
          {mbp.reason ?? 'This corridor matched a Market-Based Pricing rule for the current Sending Partner Region and ICP category.'}
        </p>
      </PopoverContent>
    </Popover>
  )
}

/** Shown when the row's fee no longer matches what MBP currently recommends — either it's genuinely stale (auto-following, hasn't been re-saved since a rule change) or it was manually set to something else on purpose. */
function MbpStaleHint({
  row,
  onApply,
}: {
  row: RowView
  onApply: () => void
}) {
  if (row.liveMbpFee === null || row.liveMbpFee === row.current.fixedFeeUsd) return null
  return (
    <div className="mt-1 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
      <span>MBP now suggests {money(row.liveMbpFee)}</span>
      <button type="button" className="font-medium underline hover:no-underline" onClick={onApply}>
        Update
      </button>
    </div>
  )
}

function SortableHeader({
  label,
  field,
  sortState,
  onSort,
  align = 'left',
}: {
  label: string
  field: SortField
  sortState: SortState | null
  onSort: (field: SortField) => void
  align?: 'left' | 'right'
}) {
  const isActive = sortState?.field === field
  return (
    <th
      className={`pb-2 pr-3 cursor-pointer font-medium select-none hover:text-foreground ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => onSort(field)}
    >
      {label}
      {isActive && (sortState!.direction === 'asc' ? ' ▲' : ' ▼')}
    </th>
  )
}

/** One banner cell spanning a column group in the Pricing table's grouped header — an empty label renders a plain unlabeled spacer cell (matching the old app's own unlabeled Funding/Source Currency + cost-override group). */
function GroupBanner({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <th
      colSpan={colSpan}
      className={
        label
          ? 'border-b bg-muted/60 px-2 py-1 text-left first:pl-0'
          : 'border-b bg-transparent px-2 py-1'
      }
    >
      {label}
    </th>
  )
}

/** A small multi-select checklist — used for every "Filter Corridors" dimension so there's one consistent look, not a bespoke control per field. */
function CheckboxGroup<T extends string | number>({
  title,
  options,
  selected,
  onToggle,
  extraHeader,
}: {
  title: string
  options: { value: T; label: string }[]
  selected: T[]
  onToggle: (value: T) => void
  extraHeader?: ReactNode
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">{title}</p>
        {extraHeader}
      </div>
      {options.length === 0 ? (
        <p className="text-xs text-muted-foreground">No values</p>
      ) : (
        <div className="space-y-1.5">
          {options.map((option) => (
            <label key={String(option.value)} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={() => onToggle(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

/** Toggles a value in/out of a selection array — the shared behavior every checkbox group's onToggle uses. */
function toggleInArray<T>(array: T[], value: T): T[] {
  return array.includes(value) ? array.filter((v) => v !== value) : [...array, value]
}

export function PricingTab({
  tabKey,
  quoteId,
}: {
  tabKey: string
  quoteId: number | null
}) {
  if (quoteId === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-24 text-center">
        <h2 className="text-lg font-semibold">Save the draft first</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Corridors are priced against a saved pricing request. Click "Save Draft" above, then come
          back to this tab to add corridors.
        </p>
      </div>
    )
  }

  return <PricingTabContent tabKey={tabKey} quoteId={quoteId} />
}

function PricingTabContent({ tabKey, quoteId }: { tabKey: string; quoteId: number }) {
  const { data, isLoading } = useQuote(quoteId)
  const { data: corridorCatalog } = useCorridorCatalog()
  const { data: currencies } = useCurrencies()

  const addCorridor = useAddQuoteCorridor(quoteId)
  const updateCorridor = useUpdateQuoteCorridor(quoteId)
  const removeCorridor = useRemoveQuoteCorridor(quoteId)

  // Per-row in-progress edits, keyed by a string row key — `String(id)` for a
  // saved row, `preview-${corridorId}` for one still only matched by filters
  // — holding only the fields touched since the row last loaded/saved/
  // promoted. Lives in a persisted store (not component state) so it
  // survives switching to the Summary tab and back, and is only cleared once
  // the explicit "Save Edited Corridors" action actually succeeds for that
  // row — never optimistically, so a failed save never loses the edit.
  const rowEdits = useCorridorEditsStore((s) => s.edits[tabKey] ?? NO_ROW_EDITS)
  const setRowField = useCorridorEditsStore((s) => s.setField)
  const renameRowEditKey = useCorridorEditsStore((s) => s.renameRowKey)
  const clearRowEdit = useCorridorEditsStore((s) => s.clearRow)
  const [isSavingCorridors, setIsSavingCorridors] = useState(false)
  const [saveCorridorsError, setSaveCorridorsError] = useState<string | null>(null)
  // Per-row field-level validation messages — populated live as the user
  // types (against the same limits the backend enforces) and by a rejected
  // save (the server's real reason, not a generic "check your connection").
  // `_general` holds a message with no single field to attach to, e.g. the
  // cross-tier allocation check firing on a stale save.
  const [rowFieldErrors, setRowFieldErrors] = useState<Record<string, Record<string, string>>>({})
  // Per-row in-progress tier edits — replaces the whole tier set for that
  // row until "Save Tiers" is clicked, then cleared so the saved data takes over.
  const [tierDrafts, setTierDrafts] = useState<Record<string, CorridorTierInput[]>>({})
  const [expandedTierRows, setExpandedTierRows] = useState<Set<string>>(new Set())
  // Preview row keys currently being promoted (POSTed) — a guard so two
  // rapid Save clicks (or a re-render mid-save) for the same still-unsaved
  // row don't both create a real row (the backend's 409-on-duplicate would
  // otherwise surface as a visible error). Keyed by the full corridor+
  // funding-currency preview key, not just corridor id, so promoting one
  // currency's preview for a corridor never blocks another currency's.
  const [promotingKeys, setPromotingKeys] = useState<Set<string>>(new Set())
  // A preview row (never saved) the user dismissed — kept client-side only,
  // for this session, so it doesn't immediately reappear while it still
  // matches the active filters. A *saved* row's removal is real and
  // persisted server-side (soft-delete, restorable — see Bulk Delete/Restore
  // below); this set only ever needs to cover preview rows, which have
  // nothing on the server to soft-delete in the first place.
  // Keyed by corridor+funding-currency pair, not corridor alone.
  const [dismissedPairKeys, setDismissedPairKeys] = useState<Set<string>>(new Set())
  // The Pricing tab's own column sort/filter — a view-only preference over
  // whatever's currently displayed, separate from "Corridors to Offer"
  // (which decides *which corridors match*, not how the resulting table is
  // sorted/filtered) and not persisted, since it's not quote data.
  const [sortState, setSortState] = useState<SortState | null>(null)
  const [tableFilters, setTableFilters] = useState<TableFilters>(DEFAULT_TABLE_FILTERS)
  const [showFilterModal, setShowFilterModal] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set())
  const [showBulkEditModal, setShowBulkEditModal] = useState(false)
  const [bulkEditField, setBulkEditField] = useState<BulkEditField | ''>('')
  const [bulkEditValue, setBulkEditValue] = useState('')
  const [fxSpreadMode, setFxSpreadMode] = useState<'custom' | 'default' | 'minimum' | 'markup'>('custom')
  const [fxMarkupValue, setFxMarkupValue] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showRestoreModal, setShowRestoreModal] = useState(false)
  const [restoreSelection, setRestoreSelection] = useState<Set<number>>(new Set())
  const [bulkActionError, setBulkActionError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const { data: deletedCorridors } = useDeletedQuoteCorridors(quoteId)
  const bulkDeleteCorridors = useBulkDeleteQuoteCorridors(quoteId)
  const bulkRestoreCorridors = useBulkRestoreQuoteCorridors(quoteId)

  const quote = data?.quote
  // The Pricing tab previews against the *applied* filters, not the live
  // checkboxes — those only take effect once "Apply Filters" is clicked on
  // "Corridors to Offer", so toggling a checkbox there doesn't reshuffle
  // this table until the user is ready.
  const appliedFilters = useAppliedCorridorFilters(tabKey, quote)
  const restrictToUseCaseAllowedCountries = (quote?.useCases ?? []).some((u) =>
    RESTRICTED_USE_CASE_LABELS.has(u.label.toLowerCase())
  )
  const filterParams = { ...appliedFilters, restrictToUseCaseAllowedCountries }
  const { data: facets } = useCorridorFacets(filterParams)
  const { data: matches, isPending: matchesLoading, isError: matchesError } = useMatchingCorridors(
    filterParams,
    true,
    quoteId
  )
  // Funding currencies are a buffered field like everything else on Summary
  // (see useQuoteFormField) — must read the pending value here too, not just
  // the saved quote's, or this stays out of sync until the next Save Draft.
  const [pendingFundingCurrencyIds] = useQuoteFormField(
    tabKey,
    quote?.fundingCurrencies?.map((c) => c.id),
    'fundingCurrencyIds',
    []
  )
  const [pendingDefaultFeeCurrencyId] = useQuoteFormField(
    tabKey,
    quote?.defaultFeeCurrencyId,
    'defaultFeeCurrencyId',
    null
  )

  if (isLoading || !data) {
    return <Skeleton className="h-64" />
  }

  const opportunityType = data.quote.opportunityType ?? null
  // The quote-level "Default Fee Currency" (Summary tab) — independent of
  // any corridor's funding/payout currency. Resolved from the pending
  // (unsaved) selection first, same reasoning as funding currencies above.
  const feeCurrency = currencies?.find((c) => c.id === pendingDefaultFeeCurrencyId)
  const corridors = data.quote.corridors ?? []
  const savedPairKeys = new Set(
    corridors.map((c) => savedPairKey(c.corridorId, c.fundingCurrencyId ?? null))
  )
  // A soft-deleted corridor is, from the matching-corridors query's point of
  // view, indistinguishable from one that was never added — it still
  // matches the active filters, so without this it would immediately
  // reappear as a blank preview row the moment it's deleted. Sourced from
  // the real, persisted deleted-corridors list (not session-only state), so
  // this holds across a page refresh too, until the corridor is restored.
  const deletedPairKeys = new Set(
    (deletedCorridors ?? []).map((c) => savedPairKey(c.corridorId, c.fundingCurrencyId ?? null))
  )
  // One preview row per matching corridor per quote funding currency, or a
  // single currency-less row if the quote has none selected yet.
  const quoteFundingCurrencyIds =
    pendingFundingCurrencyIds.length > 0 ? pendingFundingCurrencyIds : [null]
  const previewRows: { corridor: Corridor; fundingCurrencyId: number | null }[] = []
  for (const corridor of matchesError ? [] : (matches ?? [])) {
    for (const fundingCurrencyId of quoteFundingCurrencyIds) {
      const pairKey = savedPairKey(corridor.id, fundingCurrencyId)
      if (savedPairKeys.has(pairKey) || dismissedPairKeys.has(pairKey) || deletedPairKeys.has(pairKey)) continue
      previewRows.push({ corridor, fundingCurrencyId })
    }
  }
  const displayRows: DisplayRow[] = [
    ...corridors.map((row): DisplayRow => ({ kind: 'saved', key: String(row.id), row })),
    ...previewRows.map(
      ({ corridor, fundingCurrencyId }): DisplayRow => ({
        kind: 'preview',
        key: previewKey(corridor.id, fundingCurrencyId),
        corridor,
        fundingCurrencyId,
      })
    ),
  ]
  function buildRowView(item: DisplayRow): RowView {
    const corridor = item.kind === 'saved' ? item.row.corridor : item.corridor
    const savedRow = item.kind === 'saved' ? item.row : null
    const isPreview = item.kind === 'preview'
    const saved: EditableFields =
      item.kind === 'saved'
        ? {
            atvUsd: item.row.atvUsd ?? 0,
            yearlyVolumeUsd: item.row.yearlyVolumeUsd,
            yearlyTransactions: item.row.yearlyTransactions,
            fixedFeeUsd: item.row.fixedFeeUsd,
            variableFeePct: item.row.variableFeePct,
            appliedFxSpread: item.row.appliedFxSpread,
            feeDiscountPct: item.row.feeDiscountPct ?? 0,
            fxSourceOverride: item.row.fxSourceOverride ?? null,
            treasuryFxCostSpreadOverride: item.row.treasuryFxCostSpreadOverride ?? null,
            costFixedUsdOverride: item.row.costFixedUsdOverride ?? null,
            costVariablePctOverride: item.row.costVariablePctOverride ?? null,
          }
        : previewFieldsFor(item.corridor)
    const current: EditableFields = {
      atvUsd: fieldFor(item.key, saved, 'atvUsd'),
      yearlyVolumeUsd: fieldFor(item.key, saved, 'yearlyVolumeUsd'),
      // Never read from a pending edit or the saved row directly — always
      // re-derived below, so it can never drift from volume/ATV even if a
      // stale edit or saved value is sitting in the store.
      yearlyTransactions: 0,
      fixedFeeUsd: fieldFor(item.key, saved, 'fixedFeeUsd'),
      variableFeePct: fieldFor(item.key, saved, 'variableFeePct'),
      appliedFxSpread: fieldFor(item.key, saved, 'appliedFxSpread'),
      feeDiscountPct: fieldFor(item.key, saved, 'feeDiscountPct'),
      fxSourceOverride: fieldFor(item.key, saved, 'fxSourceOverride'),
      treasuryFxCostSpreadOverride: fieldFor(item.key, saved, 'treasuryFxCostSpreadOverride'),
      costFixedUsdOverride: fieldFor(item.key, saved, 'costFixedUsdOverride'),
      costVariablePctOverride: fieldFor(item.key, saved, 'costVariablePctOverride'),
    }
    current.yearlyTransactions = computeYearlyTransactions(current.yearlyVolumeUsd, current.atvUsd)
    const isTiered = savedRow?.pricingModel === 'tiered'
    const currentTiers = savedRow ? tiersFor(savedRow) : []
    const fundingCurrencyId =
      item.kind === 'preview' ? item.fundingCurrencyId : (savedRow?.fundingCurrencyId ?? null)
    const pendingEdit = rowEdits[item.key]
    const isDirty = Object.keys(pendingEdit ?? {}).length > 0
    const previewSummary: PricingSummary | null = !corridor
      ? null
      : isTiered
        ? previewTieredPricing(current, current.atvUsd, currentTiers, corridor, fundingCurrencyId, opportunityType)
        : previewPricing(current, corridor, fundingCurrencyId, opportunityType)
    const fundingCurrencyObj = savedRow
      ? savedRow.fundingCurrency
      : (currencies ?? []).find((c) => c.id === fundingCurrencyId)

    // Saved rows carry the live MBP result directly (`GET /quotes/:id`
    // recomputes it fresh on every fetch); preview rows carry it on the
    // underlying catalog corridor, only when the matching-corridors query
    // included this quote's id (see `useMatchingCorridors`).
    const mbp = savedRow ? savedRow.mbp : (item.kind === 'preview' ? (item.corridor.mbp ?? null) : null)
    const fixedFeeManuallySet = savedRow?.fixedFeeManuallySet ?? false
    const liveMbpFee = corridor ? resolveMbpFee(mbp, corridor.stdFixedFeeUsd) : null

    return {
      item,
      corridor,
      savedRow,
      isPreview,
      current,
      isTiered,
      currentTiers,
      fundingCurrencyId,
      fundingCurrencyObj,
      isDirty,
      previewSummary,
      totalRevenue: previewSummary ? previewSummary.totalRevenue : (savedRow?.totalRevenue ?? null),
      totalMargin: previewSummary ? previewSummary.totalMargin : (savedRow?.totalMargin ?? null),
      fxMargin: previewSummary ? previewSummary.fxMargin : (savedRow?.fxMargin ?? null),
      fxMarginPct: previewSummary ? previewSummary.fxMarginPct : (savedRow?.fxMarginPct ?? null),
      marginFee: previewSummary ? previewSummary.marginFee : (savedRow?.marginFee ?? null),
      marginFeePct: previewSummary ? previewSummary.marginFeePct : (savedRow?.marginFeePct ?? null),
      marginPct: previewSummary ? previewSummary.marginPct : (savedRow?.marginPct ?? null),
      grossMarginPct: previewSummary ? previewSummary.grossMarginPct : (savedRow?.grossMarginPct ?? null),
      takeRatePct: previewSummary ? previewSummary.takeRatePct : (savedRow?.takeRatePct ?? null),
      needsApproval: previewSummary ? previewSummary.needsApproval : (savedRow?.needsApproval ?? false),
      needsFinancialApproval: previewSummary
        ? previewSummary.needsFinancialApproval
        : (savedRow?.needsFinancialApproval ?? false),
      needsNetworkApproval: previewSummary
        ? previewSummary.needsNetworkApproval
        : (savedRow?.needsNetworkApproval ?? false),
      mbp,
      fixedFeeManuallySet,
      liveMbpFee,
    }
  }

  function fieldFor<K extends keyof EditableFields>(key: string, saved: EditableFields, field: K): EditableFields[K] {
    return (rowEdits[key]?.[field] as EditableFields[K] | undefined) ?? saved[field]
  }

  function handleFieldChange(key: string, field: NumericEditableField, value: number | null) {
    setRowField(tabKey, key, field, value)
    if (value !== null && field in CORRIDOR_FIELD_LIMITS) {
      const message = validateCorridorField(field as CorridorLimitedField, value)
      setRowFieldErrors((prev) => {
        const nextRow = { ...prev[key] }
        if (message) nextRow[field] = message
        else delete nextRow[field]
        return { ...prev, [key]: nextRow }
      })
    }
  }

  /** `fxSourceOverride` is a string (or null for "use catalog default"), not a number — its own small setter rather than overloading `handleFieldChange`. */
  function handleFxSourceOverrideChange(key: string, value: string | null) {
    setRowField(tabKey, key, 'fxSourceOverride', value)
  }

  /**
   * Applying a discount/fee against a corridor's own standard reference fee
   * (falling back through fixed fee, then variable fee, per corridor) —
   * shared between manual bulk-field entry and its reciprocal, so both
   * directions use identical fallback logic.
   */
  function reciprocalFeeDiscountEdits(
    row: RowView,
    field: 'feeDiscountPct' | 'fixedFeeUsd' | 'variableFeePct',
    value: number
  ): Partial<EditableFields> {
    const std = row.corridor
    if (field === 'feeDiscountPct') {
      if (std?.stdFixedFeeUsd) return { fixedFeeUsd: round2(std.stdFixedFeeUsd * (1 - value / 100)) }
      if (std?.stdVariableFeePct) return { variableFeePct: round2(std.stdVariableFeePct * (1 - value / 100)) }
      return {}
    }
    const reference = field === 'fixedFeeUsd' ? std?.stdFixedFeeUsd : std?.stdVariableFeePct
    if (!reference) return {}
    return { feeDiscountPct: round2((1 - value / reference) * 100) }
  }

  /**
   * The FX Spread presets need a per-row value (each corridor has its own
   * treasury cost and currencies), unlike every other bulk-edit field which
   * applies one shared value to every selected row.
   */
  function resolveFxSpreadForRow(row: RowView): number | null {
    if (fxSpreadMode === 'custom') {
      const value = Number(bulkEditValue)
      return Number.isNaN(value) ? null : value
    }
    if (!row.corridor) return null
    const fundingIso = row.fundingCurrencyObj?.isoCode3
    const payoutIso = row.corridor.payoutCurrency?.isoCode3 ?? ''
    const treasuryCost = effectiveTreasuryFxCostSpread(row.current, row.corridor)
    if (fxSpreadMode === 'default') {
      return computeFxDefaultSpreadPct(treasuryCost, fundingIso, payoutIso, row.mbp)
    }
    if (fxSpreadMode === 'minimum') {
      return computeFxMinimumSpreadPct(treasuryCost, fundingIso, payoutIso, row.mbp)
    }
    // markup: treasury cost + a user-entered markup on top, per the old app's real preset.
    const markup = Number(fxMarkupValue)
    if (Number.isNaN(markup)) return null
    return round2(computeTreasuryFxCostPct(treasuryCost) + markup)
  }

  function applyBulkEdit() {
    if (!bulkEditField) return
    if (BULK_EDIT_FIELDS.find((f) => f.field === bulkEditField)?.notYetAvailable) return

    if (bulkEditField === 'appliedFxSpread') {
      for (const key of selectedRowKeys) {
        const row = rowViews.find((r) => r.item.key === key)
        if (!row) continue
        const spread = resolveFxSpreadForRow(row)
        if (spread !== null) setRowField(tabKey, key, 'appliedFxSpread', spread)
      }
      setShowBulkEditModal(false)
      setBulkEditField('')
      setBulkEditValue('')
      setFxSpreadMode('custom')
      setFxMarkupValue('')
      return
    }

    const value = Number(bulkEditValue)
    if (Number.isNaN(value)) return

    // "Fixed Fee (Selected Currency)" isn't a stored field itself — it
    // reverse-converts to fixedFeeUsd (same quote-level rate for every
    // selected row), then behaves exactly like a Fixed Fee (USD) bulk edit.
    const resolvedField: keyof EditableFields | null =
      bulkEditField === 'fixedFeeInSelectedCurrency' ? 'fixedFeeUsd' : bulkEditField === 'mbpPricing' ? null : bulkEditField
    const resolvedValue =
      bulkEditField === 'fixedFeeInSelectedCurrency' ? feeCurrencyToUsd(value, feeCurrency) : value
    if (resolvedField === null || resolvedValue === null) return

    for (const key of selectedRowKeys) {
      const row = rowViews.find((r) => r.item.key === key)
      if (!row) continue

      setRowField(tabKey, key, resolvedField, resolvedValue)

      if (resolvedField === 'feeDiscountPct' || resolvedField === 'fixedFeeUsd' || resolvedField === 'variableFeePct') {
        for (const [field, reciprocalValue] of Object.entries(
          reciprocalFeeDiscountEdits(row, resolvedField, resolvedValue)
        )) {
          setRowField(tabKey, key, field as keyof EditableFields, reciprocalValue as number)
        }
      } else if (resolvedField === 'yearlyVolumeUsd' || resolvedField === 'atvUsd') {
        const atv = resolvedField === 'atvUsd' ? resolvedValue : row.current.atvUsd
        const volume = resolvedField === 'yearlyVolumeUsd' ? resolvedValue : row.current.yearlyVolumeUsd
        if (atv > 0) setRowField(tabKey, key, 'yearlyTransactions', Math.round(volume / atv))
      }
    }

    setShowBulkEditModal(false)
    setBulkEditField('')
    setBulkEditValue('')
  }

  /**
   * Promotes a still-preview corridor to a real saved row — seeded from the
   * catalog's own reference data plus whatever the user staged, so the new
   * row's numbers exactly match what the preview row was already showing.
   * `fundingCurrencyId` is fixed by which preview slot this was, not
   * user-editable, so it can't come from staged edits. Only called from the
   * explicit "Save Edited Corridors" action, never on blur.
   */
  async function promoteRow(
    corridor: Corridor,
    key: string,
    fundingCurrencyId: number | null
  ): Promise<void> {
    if (promotingKeys.has(key)) return
    const sentEdits = useCorridorEditsStore.getState().edits[tabKey]?.[key]
    const seed = seedQuoteCorridorFromCatalog(corridor, corridor.mbp ?? null)
    const payload: QuoteCorridorInput = {
      corridorId: corridor.id,
      ...seed,
      ...sentEdits,
      fundingCurrencyId,
    }

    setPromotingKeys((prev) => new Set(prev).add(key))
    try {
      const created = await addCorridor.mutateAsync(payload)
      const latest = useCorridorEditsStore.getState().edits[tabKey]?.[key]
      // Only carry edits made *after* we snapshotted the payload above — if
      // nothing changed in the meantime, `latest` is still the same object
      // we already sent, so there's nothing left to reconcile.
      if (latest === sentEdits) {
        clearRowEdit(tabKey, key)
      } else if (latest) {
        renameRowEditKey(tabKey, key, String(created.id))
      }
    } finally {
      setPromotingKeys((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  /** Saved row: PATCHes only if the edits sent are still the latest ones — if the user typed more while this was in flight, leave it dirty for the next Save click rather than trying to merge partial diffs. */
  async function saveRow(rowId: number, key: string): Promise<void> {
    const edits = useCorridorEditsStore.getState().edits[tabKey]?.[key]
    if (!edits || Object.keys(edits).length === 0) return
    await updateCorridor.mutateAsync({ corridorRowId: rowId, input: edits })
    const latest = useCorridorEditsStore.getState().edits[tabKey]?.[key]
    if (latest === edits) clearRowEdit(tabKey, key)
  }

  /**
   * "Update" on the MBP stale hint — re-syncs the row's fee to what MBP
   * currently says. For a saved row, this is an immediate PATCH (not
   * staged): sending back exactly the live MBP number is recognized
   * server-side as "still following MBP," not a manual override, so the
   * row resumes auto-following from here on (see
   * `mbp_pricing_service.ts`'s `isFixedFeeManuallySet`). For a preview
   * row, nothing's saved yet — just stage the value like any other edit.
   */
  function applyMbpFee(row: RowView) {
    if (row.liveMbpFee === null) return
    if (row.savedRow) {
      updateCorridor.mutate({ corridorRowId: row.savedRow.id, input: { fixedFeeUsd: row.liveMbpFee } })
    } else {
      handleFieldChange(row.item.key, 'fixedFeeUsd', row.liveMbpFee)
    }
  }

  function labelForRowKey(key: string): string {
    if (key.startsWith('preview-')) {
      const { corridorId } = parsePreviewKey(key)
      const corridor = (corridorCatalog ?? []).find((c) => c.id === corridorId)
      return corridor ? corridorLabel(corridor) : `Corridor #${corridorId}`
    }
    const row = corridors.find((r) => String(r.id) === key)
    return row?.corridor ? corridorLabel(row.corridor) : `Row ${key}`
  }

  // Scoped to rows that are actually currently displayed — `rowEdits` is a
  // persisted store that can outlive the row it was staged for (e.g. an
  // older key format from before this feature changed shape, or a preview
  // whose corridor+currency pair has since been saved through another
  // path). An edit for a row that no longer exists can never be saved
  // successfully, so counting/retrying it would otherwise show a
  // permanently-stuck "1 to save" that fails every time, no matter what's
  // actually edited.
  const displayRowKeys = new Set(displayRows.map((r) => r.key))
  const dirtyRowKeys = Object.keys(rowEdits).filter(
    (key) => displayRowKeys.has(key) && Object.keys(rowEdits[key] ?? {}).length > 0
  )
  const hasBlockingFieldErrors = dirtyRowKeys.some(
    (key) => Object.keys(rowFieldErrors[key] ?? {}).length > 0
  )

  /**
   * The one explicit save action for every staged corridor edit — new-row
   * promotions and existing-row updates alike. Saves each dirty row
   * independently: a failure on one row never blocks or discards the
   * others, and a row whose save fails stays staged (still marked unsaved)
   * so nothing the user typed is lost.
   */
  async function handleSaveEditedCorridors() {
    setIsSavingCorridors(true)
    setSaveCorridorsError(null)
    const failedLabels: string[] = []

    for (const key of dirtyRowKeys) {
      try {
        if (key.startsWith('preview-')) {
          const { corridorId, fundingCurrencyId } = parsePreviewKey(key)
          const corridor = (corridorCatalog ?? []).find((c) => c.id === corridorId)
          if (!corridor) continue
          await promoteRow(corridor, key, fundingCurrencyId)
        } else {
          await saveRow(Number(key), key)
        }
        setRowFieldErrors((prev) => {
          if (!prev[key]) return prev
          const next = { ...prev }
          delete next[key]
          return next
        })
      } catch (error) {
        failedLabels.push(labelForRowKey(key))
        const fieldErrors = getApiFieldErrors(error)
        setRowFieldErrors((prev) => ({
          ...prev,
          [key]: fieldErrors
            ? Object.fromEntries(fieldErrors.map((fe) => [fe.field, fe.message]))
            : { _general: getApiErrorMessage(error) },
        }))
      }
    }

    setIsSavingCorridors(false)
    setSaveCorridorsError(
      failedLabels.length > 0
        ? `Couldn't save ${failedLabels.length} corridor${failedLabels.length > 1 ? 's' : ''}: ${failedLabels.join(', ')}. Your edits are still here — see the details below.`
        : null
    )
  }

  function handleRemoveOrDismiss(item: DisplayRow) {
    if (item.kind === 'saved') {
      const pairKey = savedPairKey(item.row.corridorId, item.row.fundingCurrencyId ?? null)
      removeCorridor.mutate(item.row.id, {
        onSuccess: () => {
          setDismissedPairKeys((prev) => new Set(prev).add(pairKey))
          clearRowEdit(tabKey, item.key)
        },
      })
    } else {
      const pairKey = savedPairKey(item.corridor.id, item.fundingCurrencyId)
      setDismissedPairKeys((prev) => new Set(prev).add(pairKey))
      clearRowEdit(tabKey, item.key)
    }
  }

  /**
   * A selected preview row was never saved, so "deleting" it is the same
   * local dismiss the single-row "Dismiss" action already does — only saved
   * rows go through the real (restorable) bulk-delete endpoint.
   */
  function handleBulkDelete() {
    const savedIds: number[] = []
    for (const key of selectedRowKeys) {
      if (key.startsWith('preview-')) {
        const { corridorId, fundingCurrencyId } = parsePreviewKey(key)
        setDismissedPairKeys((prev) => new Set(prev).add(savedPairKey(corridorId, fundingCurrencyId)))
        clearRowEdit(tabKey, key)
      } else {
        savedIds.push(Number(key))
      }
    }

    if (savedIds.length > 0) {
      bulkDeleteCorridors.mutate(savedIds, {
        onSuccess: (result) => {
          setBulkActionError(
            result.notFoundIds.length > 0
              ? `${result.deletedIds?.length ?? 0} deleted; ${result.notFoundIds.length} could not be found (already gone or out of date — try refreshing).`
              : null
          )
        },
        onError: () => setBulkActionError("Couldn't delete the selected corridors. Check your connection and try again."),
      })
    }

    setSelectedRowKeys(new Set())
    setShowDeleteConfirm(false)
  }

  function handleRestoreSelected() {
    bulkRestoreCorridors.mutate([...restoreSelection], {
      onSuccess: (result) => {
        setBulkActionError(
          result.notFoundIds.length > 0
            ? `${result.restoredIds?.length ?? 0} restored; ${result.notFoundIds.length} could not be found (already restored or out of date — try refreshing).`
            : null
        )
      },
      onError: () => setBulkActionError("Couldn't restore the selected corridors. Check your connection and try again."),
    })
    setRestoreSelection(new Set())
    setShowRestoreModal(false)
  }

  function tiersFor(row: QuoteCorridor): CorridorTierInput[] {
    return (
      tierDrafts[String(row.id)] ??
      (row.tiers ?? []).map((t) => ({
        tierNumber: t.tierNumber,
        yearlyVolumeUsd: t.yearlyVolumeUsd,
        fixedFeeUsd: t.fixedFeeUsd,
        variableFeePct: t.variableFeePct,
        appliedFxSpread: t.appliedFxSpread,
      }))
    )
  }

  function setPricingModel(rowId: number, pricingModel: PricingModel) {
    updateCorridor.mutate({ corridorRowId: rowId, input: { pricingModel } })
    if (pricingModel === 'tiered') {
      setExpandedTierRows((prev) => new Set(prev).add(String(rowId)))
    }
  }

  function updateTierField(
    rowId: number,
    currentTiers: CorridorTierInput[],
    tierNumber: number,
    field: keyof Omit<CorridorTierInput, 'tierNumber'>,
    value: number
  ) {
    setTierDrafts((prev) => ({
      ...prev,
      [String(rowId)]: currentTiers.map((t) =>
        t.tierNumber === tierNumber ? { ...t, [field]: value } : t
      ),
    }))
  }

  function addTier(rowId: number, currentTiers: CorridorTierInput[]) {
    const used = new Set(currentTiers.map((t) => t.tierNumber))
    const nextNumber = [1, 2, 3].find((n) => !used.has(n))
    if (nextNumber === undefined) return
    setTierDrafts((prev) => ({
      ...prev,
      [String(rowId)]: [...currentTiers, { tierNumber: nextNumber, ...EMPTY_TIER }],
    }))
  }

  function removeTier(rowId: number, currentTiers: CorridorTierInput[], tierNumber: number) {
    setTierDrafts((prev) => ({
      ...prev,
      [String(rowId)]: currentTiers.filter((t) => t.tierNumber !== tierNumber),
    }))
  }

  function saveTiers(rowId: number, currentTiers: CorridorTierInput[]) {
    updateCorridor.mutate(
      { corridorRowId: rowId, input: { tiers: currentTiers } },
      {
        onSuccess: () => {
          setTierDrafts((prev) => {
            const next = { ...prev }
            delete next[String(rowId)]
            return next
          })
        },
      }
    )
  }

  const previewRowCount = displayRows.filter((r) => r.kind === 'preview').length

  // One pass building a computed view per row, then the table's own
  // filter/sort is applied on top — the Summary totals below are computed
  // from the *filtered* set (not sorting, which doesn't affect a sum),
  // matching the old app's real behavior of totalling exactly what the
  // table currently shows (docs/old-app-reference §3-4).
  const rowViews = displayRows.map(buildRowView)
  const filteredRowViews = rowViews.filter((r) => matchesTableFilters(r, tableFilters))
  const visibleRowViews = sortRows(filteredRowViews, sortState)
  const pricedCorridors: PricedCorridor[] = filteredRowViews.map((r) => ({
    totalRevenue: r.totalRevenue,
    totalMargin: r.totalMargin,
    yearlyVolumeUsd: r.current.yearlyVolumeUsd,
    yearlyTransactions: r.current.yearlyTransactions,
    needsApproval: r.needsApproval,
  }))
  const quoteTotals = computeQuoteTotals(pricedCorridors)

  // The single source of truth for the Excel export's columns — reusing the
  // same RowView the table renders from, so an export can never silently
  // omit a real column the way the old app's hand-typed, never-imported
  // export header list drifted from its own on-screen column definitions.
  const exportColumns: { label: string; value: (row: RowView) => string | number | null }[] = [
    { label: 'Corridor', value: (r) => (r.corridor ? corridorLabel(r.corridor) : r.savedRow ? `#${r.savedRow.corridorId}` : '') },
    { label: 'Pricing Model', value: (r) => (r.savedRow?.pricingModel === 'tiered' ? 'Tiered' : 'Standard') },
    { label: 'Funding Currency', value: (r) => r.fundingCurrencyObj?.isoCode3 ?? '' },
    { label: 'Source Currency', value: () => quote?.sourceCurrency?.isoCode3 ?? '' },
    { label: 'Std Fixed Fee', value: (r) => r.corridor?.stdFixedFeeUsd ?? null },
    { label: 'Std Variable Fee %', value: (r) => r.corridor?.stdVariableFeePct ?? null },
    { label: 'ATV (USD)', value: (r) => r.current.atvUsd },
    { label: 'Yearly Volume', value: (r) => r.current.yearlyVolumeUsd },
    { label: 'Yearly Transactions', value: (r) => r.current.yearlyTransactions },
    { label: 'Fixed Fee (USD)', value: (r) => r.current.fixedFeeUsd },
    {
      label: `Fee (${feeCurrency?.isoCode3 ?? 'Selected Currency'})`,
      value: (r) => usdToFeeCurrencyAmount(r.current.fixedFeeUsd, feeCurrency),
    },
    { label: 'Variable Fee %', value: (r) => r.current.variableFeePct },
    { label: 'Fee Discount %', value: (r) => r.current.feeDiscountPct },
    { label: 'FX Spread', value: (r) => r.current.appliedFxSpread },
    { label: 'Revenue', value: (r) => r.totalRevenue },
    { label: 'FX Margin %', value: (r) => r.fxMarginPct },
    { label: 'Margin Fee', value: (r) => r.marginFee },
    { label: 'Margin Fee %', value: (r) => r.marginFeePct },
    { label: 'Margin %', value: (r) => r.marginPct },
    { label: 'Gross Margin %', value: (r) => r.grossMarginPct },
    { label: 'Take Rate %', value: (r) => r.takeRatePct },
    { label: 'Financial Approval', value: (r) => (r.needsFinancialApproval ? 'Yes' : 'No') },
    { label: 'Network Approval', value: (r) => (r.needsNetworkApproval ? 'Yes' : 'No') },
    { label: 'Status', value: (r) => (r.isPreview ? 'Not saved (preview)' : r.isDirty ? 'Unsaved changes' : 'Saved') },
  ]

  const tierBreakdownColumns: { label: string; value: (row: RowView, tier: NonNullable<QuoteCorridor['tiers']>[number]) => string | number | null }[] = [
    { label: 'Corridor', value: (r) => (r.corridor ? corridorLabel(r.corridor) : '') },
    { label: 'Tier Number', value: (_r, t) => t.tierNumber },
    { label: 'Yearly Volume', value: (_r, t) => t.yearlyVolumeUsd },
    { label: 'Fixed Fee', value: (_r, t) => t.fixedFeeUsd },
    { label: 'Variable Fee %', value: (_r, t) => t.variableFeePct },
    { label: 'FX Spread', value: (_r, t) => t.appliedFxSpread },
    { label: 'Yearly Transactions', value: (_r, t) => t.yearlyTransactions },
    { label: 'Revenue Fee', value: (_r, t) => t.revenueFee },
    { label: 'FX Margin', value: (_r, t) => t.fxMargin },
    { label: 'FX Margin %', value: (_r, t) => t.fxMarginPct },
    { label: 'Margin Fee', value: (_r, t) => t.marginFee },
    { label: 'Margin Fee %', value: (_r, t) => t.marginFeePct },
    { label: 'Total Revenue', value: (_r, t) => t.totalRevenue },
    { label: 'Total Margin', value: (_r, t) => t.totalMargin },
    { label: 'Margin %', value: (_r, t) => t.marginPct },
    { label: 'Gross Margin %', value: (_r, t) => t.grossMarginPct },
    { label: 'Take Rate %', value: (_r, t) => t.takeRatePct },
    { label: 'Needs Approval', value: (_r, t) => (t.needsApproval ? 'Yes' : 'No') },
  ]

  /**
   * Reads from the exact same `visibleRowViews` the table renders/filters/
   * sorts from, so the export inherits active filters, sort order, and
   * soft-delete exclusion for free — matching the one part of the old app's
   * export that was actually correct, rather than re-deriving a separate set.
   */
  async function handleExportCorridors() {
    setIsExporting(true)
    setBulkActionError(null)
    try {
      const workbook = new ExcelJS.Workbook()

      const corridorsSheet = workbook.addWorksheet('Corridors')
      corridorsSheet.addRow(exportColumns.map((c) => c.label))
      for (const row of visibleRowViews) {
        corridorsSheet.addRow(exportColumns.map((c) => c.value(row)))
      }

      const tiersSheet = workbook.addWorksheet('Tier Breakdown')
      tiersSheet.addRow(tierBreakdownColumns.map((c) => c.label))
      for (const row of visibleRowViews) {
        if (!row.isTiered) continue
        for (const tier of row.savedRow?.tiers ?? []) {
          tiersSheet.addRow(tierBreakdownColumns.map((c) => c.value(row, tier)))
        }
      }

      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `Corridors_${(quote?.name ?? 'Export').replace(/[^a-z0-9]+/gi, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      setBulkActionError("Couldn't generate the export. Please try again.")
    } finally {
      setIsExporting(false)
    }
  }

  // Every "Filter Corridors" option list is derived from what's currently
  // displayed (unfiltered by this same filter — options don't narrow
  // themselves away), matching the old app's real modal: it only ever
  // offers values that actually exist among the corridors already shown,
  // not the full global catalog.
  const uniqueById = <T extends { id: number }>(items: (T | null | undefined)[]): T[] =>
    Array.from(new Map(items.filter((v): v is T => !!v).map((item) => [item.id, item])).values())
  const uniqueStrings = (values: (string | null | undefined)[]): string[] =>
    Array.from(new Set(values.filter((v): v is string => !!v)))

  const regionOptions = uniqueById(rowViews.map((r) => r.corridor?.country?.region))
  const countryOptions = uniqueById(rowViews.map((r) => r.corridor?.country))
  const transactionTypeOptions = uniqueStrings(rowViews.map((r) => r.corridor?.transactionTypeCode))
  const serviceOptions = uniqueStrings(rowViews.map((r) => r.corridor?.serviceCode))
  const payoutCurrencyOptions = uniqueById(rowViews.map((r) => r.corridor?.payoutCurrency))
  const fxSourceOptions = uniqueStrings(rowViews.map((r) => r.corridor?.fxSource))
  const fundingCurrencyOptions = uniqueById(
    rowViews.map((r) =>
      r.fundingCurrencyId !== null && r.fundingCurrencyObj
        ? { id: r.fundingCurrencyId, isoCode3: r.fundingCurrencyObj.isoCode3 }
        : null
    )
  )

  return (
    <div className="space-y-6">
      <CorridorsToOfferSection
        tabKey={tabKey}
        quote={data.quote}
        restrictToUseCaseAllowedCountries={restrictToUseCaseAllowedCountries}
        defaultOpen={false}
      />

      <CollapsibleSection
        title="Priced Corridors"
        actions={
          <div className="flex items-center gap-3">
            {previewRowCount > 0 && (
              <span className="text-xs text-primary-foreground/80">
                {previewRowCount} previewing — not saved
              </span>
            )}
            <Button
              size="sm"
              onClick={handleSaveEditedCorridors}
              disabled={dirtyRowKeys.length === 0 || isSavingCorridors || hasBlockingFieldErrors}
            >
              {isSavingCorridors
                ? 'Saving…'
                : `Save Edited Corridors${dirtyRowKeys.length > 0 ? ` (${dirtyRowKeys.length})` : ''}`}
            </Button>
          </div>
        }
      >
        {saveCorridorsError && (
          <div className="mb-2 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>{saveCorridorsError}</span>
          </div>
        )}
        {displayRows.length > 0 && (
          <div className="mb-3 grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-4">
            <PreviewStat label="Total Volume" value={money(quoteTotals.totalVolumeUsd)} />
            <PreviewStat label="Total Transactions" value={quoteTotals.totalTransactions.toLocaleString()} />
            <PreviewStat label="Total Revenue" value={money(quoteTotals.totalRevenue)} />
            <PreviewStat label="Average Take Rate" value={pct(quoteTotals.averageTakeRatePct)} />
          </div>
        )}
        {displayRows.length > 0 && (
          <div className="mb-3 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowFilterModal(true)}>
              <Filter className="mr-1.5 size-3.5" />
              Filter Corridors
              {isTableFiltersActive(tableFilters) && (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                  {visibleRowViews.length}/{displayRows.length}
                </span>
              )}
            </Button>
            {isTableFiltersActive(tableFilters) && (
              <Button variant="ghost" size="sm" onClick={() => setTableFilters(DEFAULT_TABLE_FILTERS)}>
                Clear filters
              </Button>
            )}
            {selectedRowKeys.size > 0 && (
              <Button variant="outline" size="sm" onClick={() => setShowBulkEditModal(true)}>
                Bulk Edit ({selectedRowKeys.size})
              </Button>
            )}
            {selectedRowKeys.size > 0 && (
              <Button variant="destructive" size="sm" onClick={() => setShowDeleteConfirm(true)}>
                Delete ({selectedRowKeys.size})
              </Button>
            )}
            {(deletedCorridors?.length ?? 0) > 0 && (
              <Button variant="outline" size="sm" onClick={() => setShowRestoreModal(true)}>
                Restore Deleted ({deletedCorridors!.length})
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleExportCorridors} disabled={isExporting}>
              {isExporting ? 'Exporting…' : 'Download Corridors'}
            </Button>
          </div>
        )}
        {bulkActionError && (
          <div className="mb-2 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>{bulkActionError}</span>
          </div>
        )}
        <Dialog open={showFilterModal} onOpenChange={setShowFilterModal}>
          <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Filter Corridors</DialogTitle>
              <DialogDescription>
                Choose one or more values per field. Filters apply instantly as you toggle each checkbox.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <CheckboxGroup
                title="Region"
                options={regionOptions.map((r) => ({ value: r.id, label: r.name }))}
                selected={tableFilters.regionIds}
                onToggle={(id) => setTableFilters((prev) => ({ ...prev, regionIds: toggleInArray(prev.regionIds, id) }))}
              />
              <CheckboxGroup
                title="Country"
                options={countryOptions.map((c) => ({ value: c.id, label: c.name }))}
                selected={tableFilters.countryIds}
                onToggle={(id) => setTableFilters((prev) => ({ ...prev, countryIds: toggleInArray(prev.countryIds, id) }))}
              />
              <CheckboxGroup
                title="Transaction Type"
                options={transactionTypeOptions.map((v) => ({ value: v, label: v }))}
                selected={tableFilters.transactionTypeCodes}
                onToggle={(v) =>
                  setTableFilters((prev) => ({ ...prev, transactionTypeCodes: toggleInArray(prev.transactionTypeCodes, v) }))
                }
              />
              <CheckboxGroup
                title="Service"
                options={serviceOptions.map((v) => ({ value: v, label: v }))}
                selected={tableFilters.serviceCodes}
                onToggle={(v) => setTableFilters((prev) => ({ ...prev, serviceCodes: toggleInArray(prev.serviceCodes, v) }))}
              />
              <CheckboxGroup
                title="Payout Currency"
                options={payoutCurrencyOptions.map((c) => ({ value: c.id, label: c.isoCode3 }))}
                selected={tableFilters.payoutCurrencyIds}
                onToggle={(id) =>
                  setTableFilters((prev) => ({ ...prev, payoutCurrencyIds: toggleInArray(prev.payoutCurrencyIds, id) }))
                }
              />
              <CheckboxGroup
                title="FX Source"
                options={fxSourceOptions.map((v) => ({ value: v, label: v }))}
                selected={tableFilters.fxSources}
                onToggle={(v) => setTableFilters((prev) => ({ ...prev, fxSources: toggleInArray(prev.fxSources, v) }))}
              />
              <CheckboxGroup
                title="Funding Currency"
                options={fundingCurrencyOptions.map((c) => ({ value: c.id, label: c.isoCode3 }))}
                selected={tableFilters.fundingCurrencyIds}
                onToggle={(id) =>
                  setTableFilters((prev) => ({ ...prev, fundingCurrencyIds: toggleInArray(prev.fundingCurrencyIds, id) }))
                }
              />
              <CheckboxGroup
                title="Financial Approval"
                options={[
                  { value: 'yes' as ApprovalFilterValue, label: 'Yes' },
                  { value: 'no' as ApprovalFilterValue, label: 'No' },
                ]}
                selected={tableFilters.financialApproval}
                onToggle={(v) =>
                  setTableFilters((prev) => ({ ...prev, financialApproval: toggleInArray(prev.financialApproval, v) }))
                }
              />
              <CheckboxGroup
                title="Network Approval"
                options={[
                  { value: 'yes' as ApprovalFilterValue, label: 'Yes' },
                  { value: 'no' as ApprovalFilterValue, label: 'No' },
                ]}
                selected={tableFilters.networkApproval}
                onToggle={(v) =>
                  setTableFilters((prev) => ({ ...prev, networkApproval: toggleInArray(prev.networkApproval, v) }))
                }
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={tableFilters.showOnlyUsdSwift}
                  onChange={(e) => setTableFilters((prev) => ({ ...prev, showOnlyUsdSwift: e.target.checked }))}
                />
                Show only corridors with USD SWIFT Wire Transfer
              </label>
              <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={tableFilters.hideUsdSwift}
                  onChange={(e) => setTableFilters((prev) => ({ ...prev, hideUsdSwift: e.target.checked }))}
                />
                Hide only corridors with USD SWIFT Wire Transfer
              </label>
              <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={tableFilters.showOnlyZeroVolume}
                  onChange={(e) => setTableFilters((prev) => ({ ...prev, showOnlyZeroVolume: e.target.checked }))}
                />
                Show only corridors with 0 Yearly Principal Volume
              </label>
              <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={tableFilters.showOnlyNonZeroVolume}
                  onChange={(e) => setTableFilters((prev) => ({ ...prev, showOnlyNonZeroVolume: e.target.checked }))}
                />
                Show only corridors with &gt; 0 Yearly Principal Volume
              </label>
            </div>
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-sm font-semibold">Show Corridors with Negative Values</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(
                  [
                    ['negativeMarginFee', 'Margin Fee'],
                    ['negativeMarginFeePercent', 'Margin Fee %'],
                    ['negativeFxMargin', 'FX Margin'],
                    ['negativeFxMarginPercent', 'FX Margin %'],
                    ['negativeMarginPercent', 'Margin %'],
                    ['negativeGrossMarginPercent', 'Gross Margin %'],
                  ] as [keyof TableFilters, string][]
                ).map(([field, label]) => (
                  <label key={field} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={tableFilters[field] as boolean}
                      onChange={(e) => setTableFilters((prev) => ({ ...prev, [field]: e.target.checked }))}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <DialogFooter className="items-center sm:justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={!isTableFiltersActive(tableFilters)}
                onClick={() => setTableFilters(DEFAULT_TABLE_FILTERS)}
              >
                Clear Filters
              </Button>
              <Button size="sm" onClick={() => setShowFilterModal(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={showBulkEditModal} onOpenChange={setShowBulkEditModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Bulk Edit {selectedRowKeys.size} Corridors</DialogTitle>
              <DialogDescription>Applies to every currently selected row as a staged edit — nothing saves until "Save Edited Corridors".</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <FormField label="Field to Edit">
                <SimpleSelect
                  value={bulkEditField}
                  onValueChange={(v) => {
                    setBulkEditField(v as BulkEditField)
                    setBulkEditValue('')
                  }}
                  options={BULK_EDIT_FIELDS.map((f) => ({ value: f.field, label: f.label }))}
                  placeholder="Select field…"
                />
              </FormField>
              {bulkEditField === 'fixedFeeInSelectedCurrency' && !feeCurrency?.feeConversionRateToUsd && feeCurrency?.isoCode3 !== 'USD' && (
                <p className="text-xs text-destructive">
                  No conversion rate available for {feeCurrency?.isoCode3 ?? 'the selected fee currency'} — set a
                  Default Fee Currency with a real rate on the Summary tab first.
                </p>
              )}
              {bulkEditField === 'appliedFxSpread' && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">New Value:</p>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={fxSpreadMode === 'custom'}
                      onChange={() => setFxSpreadMode('custom')}
                    />
                    Custom Value:
                    <span className="relative flex-1">
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        disabled={fxSpreadMode !== 'custom'}
                        value={bulkEditValue}
                        onChange={(e) => {
                          setFxSpreadMode('custom')
                          setBulkEditValue(e.target.value)
                        }}
                      />
                      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={fxSpreadMode === 'default'} onChange={() => setFxSpreadMode('default')} />
                    Use Default Spread for each corridor
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={fxSpreadMode === 'minimum'} onChange={() => setFxSpreadMode('minimum')} />
                    Use Minimum Spread for each corridor
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={fxSpreadMode === 'markup'} onChange={() => setFxSpreadMode('markup')} />
                    Apply FX Markup (Treasury Cost + Markup %)
                  </label>
                  {fxSpreadMode === 'markup' && (
                    <FormField label="Markup %">
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={fxMarkupValue}
                          onChange={(e) => setFxMarkupValue(e.target.value)}
                        />
                        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                      </div>
                    </FormField>
                  )}
                </div>
              )}
              {bulkEditField === 'mbpPricing' && (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
                  <p className="mb-1 font-medium">Market-Based Pricing will be applied to selected corridors:</p>
                  <ul className="list-disc space-y-0.5 pl-4">
                    <li>Fixed/Variable fees adjusted per MBP recommendations</li>
                    <li>FX spread adjusted based on MBP guidelines</li>
                    <li>Corridors without MBP data will be skipped</li>
                  </ul>
                  <p className="mt-2 font-medium">Not yet available in this app — no MBP data source exists here yet.</p>
                </div>
              )}
              {bulkEditField && bulkEditField !== 'mbpPricing' && bulkEditField !== 'appliedFxSpread' && (
                <FormField label="New Value">
                  {(() => {
                    const meta = BULK_EDIT_FIELDS.find((f) => f.field === bulkEditField)!
                    const suffix = bulkEditField === 'fixedFeeInSelectedCurrency' ? feeCurrency?.isoCode3 : meta.isPercent ? '%' : undefined
                    return (
                      <div className="relative">
                        <Input
                          type="number"
                          step={meta.isPercent ? '0.01' : '1'}
                          min={meta.allowNegative ? undefined : 0}
                          value={bulkEditValue}
                          onChange={(e) => setBulkEditValue(e.target.value)}
                        />
                        {suffix && (
                          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">{suffix}</span>
                        )}
                      </div>
                    )
                  })()}
                </FormField>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowBulkEditModal(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={applyBulkEdit}
                disabled={
                  !bulkEditField ||
                  BULK_EDIT_FIELDS.find((f) => f.field === bulkEditField)?.notYetAvailable ||
                  (bulkEditField === 'appliedFxSpread'
                    ? (fxSpreadMode === 'custom' && (bulkEditValue === '' || Number.isNaN(Number(bulkEditValue)))) ||
                      (fxSpreadMode === 'markup' && (fxMarkupValue === '' || Number.isNaN(Number(fxMarkupValue))))
                    : bulkEditValue === '' ||
                      Number.isNaN(Number(bulkEditValue)) ||
                      (bulkEditField === 'fixedFeeInSelectedCurrency' && feeCurrencyToUsd(Number(bulkEditValue), feeCurrency) === null))
                }
              >
                Apply to {selectedRowKeys.size} Corridors
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selectedRowKeys.size} Corridors</AlertDialogTitle>
              <AlertDialogDescription>
                These corridors will be removed from this quote. You can bring them back later from
                "Restore Deleted."
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleBulkDelete}>
                Delete {selectedRowKeys.size} Corridors
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Dialog open={showRestoreModal} onOpenChange={setShowRestoreModal}>
          <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Restore Deleted Corridors</DialogTitle>
              <DialogDescription>Select the deleted corridor(s) you want to restore.</DialogDescription>
            </DialogHeader>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
                  <th className="pb-2 pr-3">
                    <input
                      type="checkbox"
                      checked={
                        (deletedCorridors?.length ?? 0) > 0 &&
                        (deletedCorridors ?? []).every((r) => restoreSelection.has(r.id))
                      }
                      onChange={(e) =>
                        setRestoreSelection(
                          e.target.checked ? new Set((deletedCorridors ?? []).map((r) => r.id)) : new Set()
                        )
                      }
                    />
                  </th>
                  <th className="pb-2 pr-3 font-medium">Country</th>
                  <th className="pb-2 pr-3 font-medium">Transaction Type</th>
                  <th className="pb-2 pr-3 font-medium">Service</th>
                  <th className="pb-2 font-medium">Funding → Payout</th>
                </tr>
              </thead>
              <tbody>
                {(deletedCorridors ?? []).map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={restoreSelection.has(row.id)}
                        onChange={() =>
                          setRestoreSelection((prev) => {
                            const next = new Set(prev)
                            if (next.has(row.id)) next.delete(row.id)
                            else next.add(row.id)
                            return next
                          })
                        }
                      />
                    </td>
                    <td className="py-2 pr-3">{row.corridor?.country?.name ?? '—'}</td>
                    <td className="py-2 pr-3">{row.corridor?.transactionTypeCode ?? '—'}</td>
                    <td className="py-2 pr-3">{row.corridor?.serviceCode ?? '—'}</td>
                    <td className="py-2">
                      {row.fundingCurrency?.isoCode3 ?? '—'} → {row.corridor?.payoutCurrency?.isoCode3 ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRestoreModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleRestoreSelected} disabled={restoreSelection.size === 0}>
                Restore Selected ({restoreSelection.size})
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {matchesLoading ? (
          <p role="status" className="mb-2 text-sm text-muted-foreground">Loading matching corridors…</p>
        ) : matchesError ? (
          <p role="alert" className="mb-2 text-sm text-destructive">Could not load matching corridors. Please try again.</p>
        ) : matches?.length === 0 ? (
          <p className="mb-2 text-sm text-muted-foreground">No catalog corridors match these filters. Any previously saved corridors are retained.</p>
        ) : null}
        {corridors.length > 0 && (
          <p className="mb-2 text-xs text-muted-foreground">{corridors.length} previously saved corridors; {previewRowCount} additional matching previews. Filters do not remove saved work.</p>
        )}
        {visibleRowViews.length < displayRows.length && (
          <p className="mb-2 text-xs text-muted-foreground">
            Showing {visibleRowViews.length} of {displayRows.length} rows — narrowed by the table filters above (not
            hidden or removed).
          </p>
        )}
        {displayRows.length > 0 && (
          <div className="overflow-x-auto">
            {!matchesLoading && !matchesError && facets && (matches?.length ?? 0) < facets.totalMatched && (
              <p className="mb-2 text-xs text-muted-foreground">
                Previewing the first {matches?.length ?? 0} of {facets.totalMatched} matching
                corridors — narrow your filters to see the rest.
              </p>
            )}
            <table className="w-full text-sm">
              <thead>
                {/* Group banner row — mirrors the old app's real "Corridor Information" /
                    "Transaction Fee Structure" / "FX Spread & Source" / "Volume & ATV" /
                    "Corridor Financials" banners (PrignigTableHeader.tsx). The old app's
                    Funding/Source Currency + T.E FX Cost Spread %/Fixed Cost/Variable Cost
                    group is unlabeled there too — kept unlabeled here for the same reason. */}
                <tr className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  <th />
                  <th />
                  <GroupBanner label="Corridor Information" colSpan={1} />
                  <GroupBanner label="" colSpan={5} />
                  <GroupBanner label="Transaction Fee Structure" colSpan={6} />
                  <GroupBanner label="FX Spread &amp; Source" colSpan={3} />
                  <GroupBanner label="Volume &amp; ATV" colSpan={4} />
                  <GroupBanner label="Corridor Financials" colSpan={11} />
                  <th />
                </tr>
                <tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
                  <th className="pb-2 pr-3">
                    <input
                      type="checkbox"
                      checked={visibleRowViews.length > 0 && visibleRowViews.every((r) => selectedRowKeys.has(r.item.key))}
                      onChange={(e) =>
                        setSelectedRowKeys(
                          e.target.checked ? new Set(visibleRowViews.map((r) => r.item.key)) : new Set()
                        )
                      }
                    />
                  </th>
                  <th className="pb-2 pr-3 font-medium">Pricing</th>
                  <SortableHeader label="Corridor" field="corridor" sortState={sortState} onSort={(f) => setSortState((s) => cycleSort(s, f))} />
                  <SortableHeader label="Funding Currency" field="fundingCurrency" sortState={sortState} onSort={(f) => setSortState((s) => cycleSort(s, f))} />
                  <th className="pb-2 pr-3 font-medium">Source Currency</th>
                  <th className="pb-2 pr-3 text-right font-medium">T.E FX Cost Spread %</th>
                  <th className="pb-2 pr-3 text-right font-medium">Fixed Cost in USD</th>
                  <th className="pb-2 pr-3 text-right font-medium">Variable Cost %</th>
                  <th className="pb-2 pr-3 text-right font-medium">Std Fixed Fee USD</th>
                  <th className="pb-2 pr-3 text-right font-medium">Std Variable Fee %</th>
                  <th className="pb-2 pr-3 text-right font-medium">Fee Discount %</th>
                  <th className="pb-2 pr-3 text-right font-medium">Fixed Fee USD</th>
                  <th className="pb-2 pr-3 text-right font-medium">Variable Fee %</th>
                  <th className="pb-2 pr-3 text-right font-medium">
                    Fee ({feeCurrency?.isoCode3 ?? 'Selected Currency'})
                  </th>
                  <th className="pb-2 pr-3 font-medium">Fx Source</th>
                  <th className="pb-2 pr-3 text-right font-medium">FX Minimum Spread</th>
                  <th className="pb-2 pr-3 text-right font-medium">FX Spread</th>
                  <th className="pb-2 pr-3 text-right font-medium">Historical ATV</th>
                  <th className="pb-2 pr-3 text-right font-medium">ATV (USD)</th>
                  <SortableHeader label="Yearly Volume" field="volume" sortState={sortState} onSort={(f) => setSortState((s) => cycleSort(s, f))} align="right" />
                  <th className="pb-2 pr-3 text-right font-medium">Yearly Trx</th>
                  <th className="pb-2 pr-3 text-right font-medium">Revenue Fee</th>
                  <th className="pb-2 pr-3 text-right font-medium">FX Margin</th>
                  <th className="pb-2 pr-3 text-right font-medium">FX Margin %</th>
                  <SortableHeader label="Total Revenue" field="revenue" sortState={sortState} onSort={(f) => setSortState((s) => cycleSort(s, f))} align="right" />
                  <th className="pb-2 pr-3 text-right font-medium">Margin Fee</th>
                  <th className="pb-2 pr-3 text-right font-medium">Margin Fee %</th>
                  <th className="pb-2 pr-3 text-right font-medium">Total Margin</th>
                  <SortableHeader label="Margin %" field="marginPct" sortState={sortState} onSort={(f) => setSortState((s) => cycleSort(s, f))} align="right" />
                  <th className="pb-2 pr-3 text-right font-medium">Gross Margin %</th>
                  <SortableHeader label="Take Rate" field="takeRate" sortState={sortState} onSort={(f) => setSortState((s) => cycleSort(s, f))} align="right" />
                  <SortableHeader label="Approval" field="approval" sortState={sortState} onSort={(f) => setSortState((s) => cycleSort(s, f))} align="right" />
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {visibleRowViews.map((row) => {
                  const {
                    item,
                    corridor,
                    savedRow,
                    isPreview,
                    current,
                    isTiered,
                    currentTiers,
                    fundingCurrencyObj,
                    isDirty,
                    previewSummary,
                  } = row
                  const isPromoting = item.kind === 'preview' && promotingKeys.has(item.key)
                  const isExpanded = expandedTierRows.has(item.key)
                  const tierVolumeTotal = currentTiers.reduce(
                    (sum, t) => sum + t.yearlyVolumeUsd,
                    0
                  )
                  const standardRemainder = current.yearlyVolumeUsd - tierVolumeTotal
                  const allocationErrors = validateTierAllocation(
                    current.yearlyVolumeUsd,
                    currentTiers
                  )

                  return (
                    <Fragment key={item.key}>
                      <tr
                        className={
                          isPreview
                            ? 'border-b bg-amber-50/70 last:border-0 dark:bg-amber-950/20'
                            : isDirty
                              ? 'border-b bg-blue-50/70 last:border-0 dark:bg-blue-950/20'
                              : 'border-b last:border-0'
                        }
                      >
                        <td className="py-2 pr-3">
                          <input
                            type="checkbox"
                            checked={selectedRowKeys.has(item.key)}
                            onChange={() =>
                              setSelectedRowKeys((prev) => {
                                const next = new Set(prev)
                                if (next.has(item.key)) next.delete(item.key)
                                else next.add(item.key)
                                return next
                              })
                            }
                          />
                        </td>
                        <td className="py-2 pr-3">
                          {isPreview ? (
                            <div className="w-28">
                              <SimpleSelect
                                value="standard"
                                onValueChange={() => {}}
                                options={[{ value: 'standard', label: 'Standard' }]}
                                disabled
                              />
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <div className="w-28">
                                <SimpleSelect
                                  value={savedRow!.pricingModel}
                                  onValueChange={(v) => setPricingModel(savedRow!.id, v as PricingModel)}
                                  options={[
                                    { value: 'standard', label: 'Standard' },
                                    { value: 'tiered', label: 'Tiered' },
                                  ]}
                                />
                              </div>
                              {isTiered && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setExpandedTierRows((prev) => {
                                      const next = new Set(prev)
                                      if (next.has(item.key)) next.delete(item.key)
                                      else next.add(item.key)
                                      return next
                                    })
                                  }
                                >
                                  {isExpanded ? 'Hide' : 'Edit'} tiers
                                </Button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-3 font-medium">
                          <div className="flex items-center gap-2">
                            <span>
                              {corridor
                                ? corridorLabel(corridor)
                                : savedRow
                                  ? `#${savedRow.corridorId}`
                                  : ''}
                            </span>
                            {isPreview && (
                              <span className="shrink-0 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                                Not saved
                              </span>
                            )}
                            {!isPreview && isDirty && (
                              <span className="shrink-0 rounded bg-blue-200 px-1.5 py-0.5 text-[10px] font-semibold text-blue-900 dark:bg-blue-900 dark:text-blue-100">
                                Unsaved changes
                              </span>
                            )}
                          </div>
                          {rowFieldErrors[item.key]?._general && (
                            <p className="mt-0.5 text-xs text-destructive">{rowFieldErrors[item.key]._general}</p>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {/* Not editable — remove the row and let it reappear as a preview under the intended currency instead. */}
                          {fundingCurrencyObj?.isoCode3 ?? '—'}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {data.quote.sourceCurrency?.isoCode3 ?? '—'}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Input
                            type="number"
                            step="0.001"
                            placeholder={pct(
                              corridor?.treasuryFxCostSpread === null || corridor?.treasuryFxCostSpread === undefined
                                ? null
                                : corridor.treasuryFxCostSpread * 100
                            )}
                            value={
                              current.treasuryFxCostSpreadOverride === null
                                ? ''
                                : round2(current.treasuryFxCostSpreadOverride * 100)
                            }
                            className="h-8 w-20"
                            aria-invalid={!!rowFieldErrors[item.key]?.treasuryFxCostSpreadOverride}
                            onChange={(e) => {
                              const raw = e.target.value
                              handleFieldChange(
                                item.key,
                                'treasuryFxCostSpreadOverride',
                                raw === '' ? null : Number(raw) / 100
                              )
                            }}
                          />
                          {rowFieldErrors[item.key]?.treasuryFxCostSpreadOverride && (
                            <p className="mt-0.5 text-xs text-destructive">{rowFieldErrors[item.key].treasuryFxCostSpreadOverride}</p>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Input
                            type="number"
                            placeholder={corridor?.costFixedUsd === null || corridor?.costFixedUsd === undefined ? '—' : String(corridor.costFixedUsd)}
                            value={current.costFixedUsdOverride ?? ''}
                            className="h-8 w-20"
                            aria-invalid={!!rowFieldErrors[item.key]?.costFixedUsdOverride}
                            onChange={(e) => {
                              const raw = e.target.value
                              handleFieldChange(
                                item.key,
                                'costFixedUsdOverride',
                                raw === '' ? null : Number(raw)
                              )
                            }}
                          />
                          {rowFieldErrors[item.key]?.costFixedUsdOverride && (
                            <p className="mt-0.5 text-xs text-destructive">{rowFieldErrors[item.key].costFixedUsdOverride}</p>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Input
                            type="number"
                            step="0.001"
                            placeholder={pct(
                              corridor?.costVariablePct === null || corridor?.costVariablePct === undefined
                                ? null
                                : corridor.costVariablePct * 100
                            )}
                            value={
                              current.costVariablePctOverride === null
                                ? ''
                                : round2(current.costVariablePctOverride * 100)
                            }
                            className="h-8 w-20"
                            aria-invalid={!!rowFieldErrors[item.key]?.costVariablePctOverride}
                            onChange={(e) => {
                              const raw = e.target.value
                              handleFieldChange(
                                item.key,
                                'costVariablePctOverride',
                                raw === '' ? null : Number(raw) / 100
                              )
                            }}
                          />
                          {rowFieldErrors[item.key]?.costVariablePctOverride && (
                            <p className="mt-0.5 text-xs text-destructive">{rowFieldErrors[item.key].costVariablePctOverride}</p>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right text-muted-foreground">
                          {corridor ? money(corridor.stdFixedFeeUsd) : '—'}
                        </td>
                        <td className="py-2 pr-3 text-right text-muted-foreground">
                          {corridor ? pct(corridor.stdVariableFeePct) : '—'}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Input
                            type="number"
                            step="0.01"
                            value={current.feeDiscountPct}
                            className="h-8 w-20"
                            aria-invalid={!!rowFieldErrors[item.key]?.feeDiscountPct}
                            onChange={(e) =>
                              handleFieldChange(item.key, 'feeDiscountPct', Number(e.target.value))
                            }
                          />
                          {rowFieldErrors[item.key]?.feeDiscountPct && (
                            <p className="mt-0.5 text-xs text-destructive">{rowFieldErrors[item.key].feeDiscountPct}</p>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Input
                            type="number"
                            value={current.fixedFeeUsd}
                            className="h-8 w-20"
                            aria-invalid={!!rowFieldErrors[item.key]?.fixedFeeUsd}
                            onChange={(e) =>
                              handleFieldChange(item.key, 'fixedFeeUsd', Number(e.target.value))
                            }
                          />
                          {rowFieldErrors[item.key]?.fixedFeeUsd && (
                            <p className="mt-0.5 text-xs text-destructive">{rowFieldErrors[item.key].fixedFeeUsd}</p>
                          )}
                          {row.mbp && <MbpBadge mbp={row.mbp} />}
                          <MbpStaleHint row={row} onApply={() => applyMbpFee(row)} />
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Input
                            type="number"
                            step="0.01"
                            value={current.variableFeePct}
                            className="h-8 w-20"
                            aria-invalid={!!rowFieldErrors[item.key]?.variableFeePct}
                            onChange={(e) =>
                              handleFieldChange(item.key, 'variableFeePct', Number(e.target.value))
                            }
                          />
                          {rowFieldErrors[item.key]?.variableFeePct && (
                            <p className="mt-0.5 text-xs text-destructive">{rowFieldErrors[item.key].variableFeePct}</p>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {(() => {
                            const inCurrency = usdToFeeCurrencyAmount(current.fixedFeeUsd, feeCurrency)
                            if (inCurrency === null) {
                              return <span className="text-xs text-muted-foreground">No rate available</span>
                            }
                            return (
                              <Input
                                type="number"
                                step="0.001"
                                value={inCurrency}
                                className="h-8 w-24"
                                onChange={(e) => {
                                  const usd = feeCurrencyToUsd(Number(e.target.value), feeCurrency)
                                  if (usd !== null) handleFieldChange(item.key, 'fixedFeeUsd', usd)
                                }}
                              />
                            )
                          })()}
                        </td>
                        <td className="py-2 pr-3">
                          <div className="w-32">
                            <SimpleSelect
                              value={current.fxSourceOverride ?? FX_SOURCE_CATALOG_DEFAULT}
                              onValueChange={(v) =>
                                handleFxSourceOverrideChange(item.key, v === FX_SOURCE_CATALOG_DEFAULT ? null : v)
                              }
                              options={[
                                {
                                  value: FX_SOURCE_CATALOG_DEFAULT,
                                  label: `Catalog default${corridor?.fxSource ? ` (${corridor.fxSource})` : ''}`,
                                },
                                ...fxSourceOptions
                                  .filter((s) => s !== corridor?.fxSource)
                                  .map((s) => ({ value: s, label: s })),
                              ]}
                            />
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-right text-muted-foreground">
                          {corridor
                            ? pct(
                                computeFxMinimumSpreadPct(
                                  effectiveTreasuryFxCostSpread(current, corridor),
                                  fundingCurrencyObj?.isoCode3,
                                  corridor.payoutCurrency?.isoCode3 ?? '',
                                  row.mbp
                                )
                              )
                            : '—'}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Input
                            type="number"
                            step="0.01"
                            value={current.appliedFxSpread}
                            className="h-8 w-20"
                            aria-invalid={!!rowFieldErrors[item.key]?.appliedFxSpread}
                            onChange={(e) =>
                              handleFieldChange(item.key, 'appliedFxSpread', Number(e.target.value))
                            }
                          />
                          {rowFieldErrors[item.key]?.appliedFxSpread && (
                            <p className="mt-0.5 text-xs text-destructive">{rowFieldErrors[item.key].appliedFxSpread}</p>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right text-muted-foreground">
                          {corridor?.historicalAtv === null || corridor?.historicalAtv === undefined
                            ? 'No data'
                            : money(Math.round(corridor.historicalAtv))}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Input
                            type="number"
                            value={current.atvUsd}
                            className="h-8 w-20"
                            aria-invalid={!!rowFieldErrors[item.key]?.atvUsd}
                            onChange={(e) => handleFieldChange(item.key, 'atvUsd', Number(e.target.value))}
                          />
                          {rowFieldErrors[item.key]?.atvUsd && (
                            <p className="mt-0.5 text-xs text-destructive">{rowFieldErrors[item.key].atvUsd}</p>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Input
                            type="number"
                            value={current.yearlyVolumeUsd}
                            className="h-8 w-28"
                            aria-invalid={!!rowFieldErrors[item.key]?.yearlyVolumeUsd}
                            onChange={(e) =>
                              handleFieldChange(item.key, 'yearlyVolumeUsd', Number(e.target.value))
                            }
                          />
                          {rowFieldErrors[item.key]?.yearlyVolumeUsd && (
                            <p className="mt-0.5 text-xs text-destructive">{rowFieldErrors[item.key].yearlyVolumeUsd}</p>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right text-muted-foreground">
                          {/* Never directly editable — always ceil(volume / ATV), matching the old app's real read-only "Yearly transactions" column. */}
                          {current.yearlyTransactions.toLocaleString()}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {previewSummary ? money(previewSummary.revenueFee) : money(savedRow?.revenueFee ?? null)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {previewSummary ? money(previewSummary.fxMargin) : money(savedRow?.fxMargin ?? null)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {previewSummary ? pct(previewSummary.fxMarginPct) : pct(savedRow?.fxMarginPct ?? null)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {previewSummary ? money(previewSummary.totalRevenue) : money(savedRow?.totalRevenue ?? null)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {previewSummary ? money(previewSummary.marginFee) : money(savedRow?.marginFee ?? null)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {previewSummary ? pct(previewSummary.marginFeePct) : pct(savedRow?.marginFeePct ?? null)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {previewSummary ? money(previewSummary.totalMargin) : money(savedRow?.totalMargin ?? null)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {previewSummary ? pct(previewSummary.marginPct) : pct(savedRow?.marginPct ?? null)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {previewSummary ? pct(previewSummary.grossMarginPct) : pct(savedRow?.grossMarginPct ?? null)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {previewSummary ? pct(previewSummary.takeRatePct) : pct(savedRow?.takeRatePct ?? null)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <ApprovalCell
                            needsFinancial={
                              previewSummary
                                ? previewSummary.needsFinancialApproval
                                : (savedRow?.needsFinancialApproval ?? false)
                            }
                            financialReasons={
                              previewSummary
                                ? previewSummary.financialApprovalReasons
                                : (savedRow?.financialApprovalReasons ?? [])
                            }
                            needsNetwork={
                              previewSummary
                                ? previewSummary.needsNetworkApproval
                                : (savedRow?.needsNetworkApproval ?? false)
                            }
                            networkReasons={
                              previewSummary
                                ? previewSummary.networkApprovalReasons
                                : (savedRow?.networkApprovalReasons ?? [])
                            }
                          />
                        </td>
                        <td className="py-2 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveOrDismiss(item)}
                            disabled={item.kind === 'saved' && removeCorridor.isPending}
                          >
                            {isPromoting ? 'Saving…' : item.kind === 'saved' ? 'Remove' : 'Dismiss'}
                          </Button>
                        </td>
                      </tr>
                      {savedRow && isTiered && isExpanded && (
                        <tr className="border-b bg-muted/20 last:border-0">
                          <td colSpan={33} className="p-3">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-medium text-muted-foreground uppercase">
                                  Tiers — whatever volume isn't assigned below prices at the
                                  standard fields to the left
                                </p>
                                <span
                                  className={
                                    standardRemainder < 0
                                      ? 'text-xs font-medium text-red-600'
                                      : 'text-xs text-muted-foreground'
                                  }
                                >
                                  Standard remainder: {money(standardRemainder)}
                                </span>
                              </div>

                              {currentTiers.length === 0 && (
                                <p className="text-xs text-muted-foreground">
                                  No tiers yet — 100% of volume prices at the standard fields.
                                </p>
                              )}

                              {currentTiers
                                .slice()
                                .sort((a, b) => a.tierNumber - b.tierNumber)
                                .map((tier) => (
                                  <div
                                    key={tier.tierNumber}
                                    className="grid grid-cols-2 items-end gap-3 sm:grid-cols-3 lg:grid-cols-6"
                                  >
                                    <FormField label={`Tier ${tier.tierNumber} Volume (USD)`}>
                                      <Input
                                        type="number"
                                        value={tier.yearlyVolumeUsd}
                                        onChange={(e) =>
                                          updateTierField(
                                            savedRow.id,
                                            currentTiers,
                                            tier.tierNumber,
                                            'yearlyVolumeUsd',
                                            Number(e.target.value)
                                          )
                                        }
                                      />
                                    </FormField>
                                    <FormField label="Fixed Fee (USD)">
                                      <Input
                                        type="number"
                                        value={tier.fixedFeeUsd}
                                        onChange={(e) =>
                                          updateTierField(
                                            savedRow.id,
                                            currentTiers,
                                            tier.tierNumber,
                                            'fixedFeeUsd',
                                            Number(e.target.value)
                                          )
                                        }
                                      />
                                    </FormField>
                                    <FormField label="Variable Fee %">
                                      <Input
                                        type="number"
                                        step="0.01"
                                        value={tier.variableFeePct}
                                        onChange={(e) =>
                                          updateTierField(
                                            savedRow.id,
                                            currentTiers,
                                            tier.tierNumber,
                                            'variableFeePct',
                                            Number(e.target.value)
                                          )
                                        }
                                      />
                                    </FormField>
                                    <FormField label="FX Spread %">
                                      <Input
                                        type="number"
                                        step="0.01"
                                        value={tier.appliedFxSpread}
                                        onChange={(e) =>
                                          updateTierField(
                                            savedRow.id,
                                            currentTiers,
                                            tier.tierNumber,
                                            'appliedFxSpread',
                                            Number(e.target.value)
                                          )
                                        }
                                      />
                                    </FormField>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        removeTier(savedRow.id, currentTiers, tier.tierNumber)
                                      }
                                    >
                                      Remove tier
                                    </Button>
                                  </div>
                                ))}

                              {allocationErrors.length > 0 && (
                                <p className="text-xs text-red-600">{allocationErrors.join(' ')}</p>
                              )}

                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => addTier(savedRow.id, currentTiers)}
                                  disabled={currentTiers.length >= 3}
                                >
                                  Add tier
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => saveTiers(savedRow.id, currentTiers)}
                                  disabled={updateCorridor.isPending || allocationErrors.length > 0}
                                >
                                  Save tiers
                                </Button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>
    </div>
  )
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  )
}
