/**
 * Market-Based Pricing (MBP) — a rule engine that can override a corridor's
 * catalog fee/FX terms based on the quote's Sending Partner Region and ICP
 * category, the corridor's own country tier (G10/G20/Exotic), and its
 * transaction type. Reverse-engineered from the old app's real
 * `mbpPricingEngine.ts` + `mbp_pricing_service.ts` and its live database —
 * see docs/old-app-reference for the investigation notes and the worked
 * Denmark example this module's tests are built around.
 *
 * Pure logic only — no database access. The caller fetches the handful of
 * relevant rows (see `MbpReferenceData`) and this module decides which one
 * applies, in the same precedence order the old app uses: a hand-picked
 * strategic override wins over everything, then an exact grid rule, then
 * the 3x3 decision-matrix backup, then no adjustment at all (the corridor
 * keeps its plain catalog fee).
 */

/**
 * Does a single transaction-type segment match a real corridor's
 * transaction type? 'X' in the segment is a wildcard for any single
 * character at that position (e.g. "B2X" matches "B2B"/"B2C"). Segments
 * must be the same length — this is the one clean matcher used everywhere
 * a rule's transaction type needs checking, replacing the old app's
 * fragile plain-substring version (see docs/old-app-reference).
 */
function matchesTransactionTypeSegment(segment: string, transactionType: string): boolean {
  if (!segment || !transactionType) return false
  if (segment.length !== transactionType.length) return false
  for (let i = 0; i < segment.length; i++) {
    if (segment[i] === 'X') continue
    if (segment[i] !== transactionType[i]) return false
  }
  return true
}

/**
 * A rule's transaction type may list several patterns separated by "/"
 * (e.g. "C2X/B2C") — matches if ANY segment matches (OR logic).
 */
export function matchesTransactionType(pattern: string, transactionType: string): boolean {
  if (!pattern) return false
  return pattern
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .some((segment) => matchesTransactionTypeSegment(segment, transactionType))
}

export type MbpLevel = 'High' | 'Medium' | 'Low'
export type CorridorTierName = 'G10' | 'G20' | 'Exotic'
export type MbpOverrideMode = 'adjustment' | 'standard'

export interface MbpMatchContext {
  /** The quote's Sending Partner Region — null if the quote has no partner country set yet. */
  regionId: number | null
  icpLevel1Id: number | null
  icpLevel2Id: number | null
  icpLevel3Id: number | null
  /** The corridor's own country — always present. */
  countryId: number
  /** The corridor's own transaction type, e.g. "B2B". */
  transactionTypeCode: string
  currencyId?: number | null
  /** Defaults to "now" in the caller; injectable here for tests. */
  asOfDate?: Date
}

export interface MbpCountryTierRow {
  countryId: number
  tier: CorridorTierName
}

export interface MbpRegionPressureRow {
  regionId: number
  transactionType: string
  pressureLevel: MbpLevel
}

export interface MbpIcpSensitivityRow {
  icpNodeIdL3: number | null
  transactionType: string
  sensitivity: MbpLevel
}

export interface MbpDecisionMatrixRow {
  id: number
  icpSensitivity: MbpLevel
  regionPressure: MbpLevel
  pricingDecision: string
  feeAdjustmentPercent: number
  fxSpreadAdjustmentBps: number
}

export interface MbpGridFeeAdjustmentRow {
  id: number
  regionPressure: MbpLevel
  corridorTier: CorridorTierName
  icpNodeIdL1: number
  transactionType: string
  fixedFeeUsd: number
  fxSpreadAdjustmentBps: number
  minimumFxSpreadAdjustmentBps: number
}

export interface MbpStrategicOverrideRow {
  id: number
  countryId: number | null
  currencyId: number | null
  regionId: number | null
  transactionType: string | null
  icpNodeIdL1: number | null
  icpNodeIdL2: number | null
  icpNodeIdL3: number | null
  overrideMode: MbpOverrideMode
  feeAdjustmentPercent: number | null
  fxSpreadAdjustmentBps: number | null
  fixedFeeUsd: number | null
  fxSpread: number | null
  minimumFxSpread: number | null
  reason: string | null
  priority: number
  isActive: boolean
  effectiveFrom: Date | null
  effectiveTo: Date | null
}

export interface MbpReferenceData {
  countryTiers: MbpCountryTierRow[]
  regionPressures: MbpRegionPressureRow[]
  icpSensitivities: MbpIcpSensitivityRow[]
  decisionMatrix: MbpDecisionMatrixRow[]
  gridFeeAdjustments: MbpGridFeeAdjustmentRow[]
  strategicOverrides: MbpStrategicOverrideRow[]
}

export interface MbpAdjustmentResult {
  source: 'strategic_override' | 'grid' | 'decision_matrix'
  matchedRuleId: number
  /** Replaces the catalog fixed fee outright, when set (grid, or a "standard"-mode strategic override). */
  fixedFeeUsdOverride: number | null
  /** Multiplies the raw catalog fixed fee instead, when set — `rawFee * (1 + pct / 100)` (decision matrix, or an "adjustment"-mode strategic override). Mutually exclusive with `fixedFeeUsdOverride`. */
  fixedFeeAdjustmentPct: number | null
  /** An ADDITIVE bump, in basis points, on top of whatever FX spread the corridor would otherwise use (grid, or an "adjustment"-mode strategic override). */
  fxSpreadAdjustmentBps: number | null
  /** An ADDITIVE bump, in basis points, on top of the catalog treasury cost that feeds the FX-minimum-spread formula (grid, or an "adjustment"-mode strategic override). */
  minimumFxSpreadAdjustmentBps: number | null
  /** A DIRECT REPLACEMENT of the FX spread, in percent (only ever set by a "standard"-mode strategic override). Mutually exclusive with `fxSpreadAdjustmentBps`. */
  fxSpreadOverride: number | null
  /** A DIRECT REPLACEMENT of the FX minimum spread, in percent (only ever set by a "standard"-mode strategic override). Mutually exclusive with `minimumFxSpreadAdjustmentBps`. */
  minimumFxSpreadOverride: number | null
  fxSourceOverride: string | null
  reason: string | null
}

function isOverrideActive(row: MbpStrategicOverrideRow, asOfDate: Date): boolean {
  if (!row.isActive) return false
  if (row.effectiveFrom && asOfDate < row.effectiveFrom) return false
  if (row.effectiveTo && asOfDate > row.effectiveTo) return false
  return true
}

function overrideMatches(row: MbpStrategicOverrideRow, ctx: MbpMatchContext): boolean {
  if (row.countryId !== null && row.countryId !== ctx.countryId) return false
  if (row.currencyId !== null && row.currencyId !== (ctx.currencyId ?? null)) return false
  if (row.regionId !== null && row.regionId !== ctx.regionId) return false
  if (row.transactionType !== null && !matchesTransactionType(row.transactionType, ctx.transactionTypeCode)) {
    return false
  }
  if (row.icpNodeIdL1 !== null && row.icpNodeIdL1 !== ctx.icpLevel1Id) return false
  if (row.icpNodeIdL2 !== null && row.icpNodeIdL2 !== ctx.icpLevel2Id) return false
  if (row.icpNodeIdL3 !== null && row.icpNodeIdL3 !== ctx.icpLevel3Id) return false
  return true
}

/**
 * The single entry point: given a corridor+quote context and the relevant
 * rule rows, returns the adjustment to apply, or `null` if nothing matches
 * (meaning the corridor keeps its plain catalog fee/FX terms unchanged).
 */
export function computeMbpAdjustment(
  ctx: MbpMatchContext,
  data: MbpReferenceData
): MbpAdjustmentResult | null {
  const asOfDate = ctx.asOfDate ?? new Date()

  // 1. Strategic overrides — highest precedence. Sorted by priority desc;
  // the first active, date-in-range, field-matching row wins.
  const activeOverrides = data.strategicOverrides
    .filter((o) => isOverrideActive(o, asOfDate))
    .filter((o) => overrideMatches(o, ctx))
    .sort((a, b) => b.priority - a.priority)

  if (activeOverrides.length > 0) {
    const o = activeOverrides[0]
    if (o.overrideMode === 'standard') {
      return {
        source: 'strategic_override',
        matchedRuleId: o.id,
        fixedFeeUsdOverride: o.fixedFeeUsd,
        fixedFeeAdjustmentPct: null,
        fxSpreadAdjustmentBps: null,
        minimumFxSpreadAdjustmentBps: null,
        fxSpreadOverride: o.fxSpread,
        minimumFxSpreadOverride: o.minimumFxSpread,
        fxSourceOverride: null,
        reason: o.reason,
      }
    }
    return {
      source: 'strategic_override',
      matchedRuleId: o.id,
      fixedFeeUsdOverride: null,
      fixedFeeAdjustmentPct: o.feeAdjustmentPercent,
      fxSpreadAdjustmentBps: o.fxSpreadAdjustmentBps,
      minimumFxSpreadAdjustmentBps: null,
      fxSpreadOverride: null,
      minimumFxSpreadOverride: null,
      fxSourceOverride: null,
      reason: o.reason,
    }
  }

  // Without a region, ICP L1, and a known country tier, neither the grid
  // nor the decision-matrix path has enough to match on.
  const tier = data.countryTiers.find((t) => t.countryId === ctx.countryId)?.tier ?? null
  if (ctx.regionId === null || ctx.icpLevel1Id === null || tier === null) {
    return null
  }

  const pressure = data.regionPressures.find(
    (rp) => rp.regionId === ctx.regionId && matchesTransactionType(rp.transactionType, ctx.transactionTypeCode)
  )?.pressureLevel
  if (!pressure) return null

  // 2. Grid — an exact rule, wins over the decision-matrix backup.
  const grid = data.gridFeeAdjustments.find(
    (g) =>
      g.regionPressure === pressure &&
      g.corridorTier === tier &&
      g.icpNodeIdL1 === ctx.icpLevel1Id &&
      matchesTransactionType(g.transactionType, ctx.transactionTypeCode)
  )
  if (grid) {
    return {
      source: 'grid',
      matchedRuleId: grid.id,
      fixedFeeUsdOverride: grid.fixedFeeUsd,
      fixedFeeAdjustmentPct: null,
      fxSpreadAdjustmentBps: grid.fxSpreadAdjustmentBps,
      minimumFxSpreadAdjustmentBps: grid.minimumFxSpreadAdjustmentBps,
      fxSpreadOverride: null,
      minimumFxSpreadOverride: null,
      fxSourceOverride: null,
      reason: null,
    }
  }

  // 3. Decision matrix — a percentage backup, via the ICP L3 sensitivity.
  const sensitivity = data.icpSensitivities.find(
    (s) => s.icpNodeIdL3 === ctx.icpLevel3Id && matchesTransactionType(s.transactionType, ctx.transactionTypeCode)
  )?.sensitivity
  if (!sensitivity) return null

  const decision = data.decisionMatrix.find(
    (d) => d.icpSensitivity === sensitivity && d.regionPressure === pressure
  )
  if (!decision) return null

  return {
    source: 'decision_matrix',
    matchedRuleId: decision.id,
    fixedFeeUsdOverride: null,
    fixedFeeAdjustmentPct: decision.feeAdjustmentPercent,
    fxSpreadAdjustmentBps: decision.fxSpreadAdjustmentBps,
    minimumFxSpreadAdjustmentBps: null,
    fxSpreadOverride: null,
    minimumFxSpreadOverride: null,
    fxSourceOverride: null,
    reason: decision.pricingDecision,
  }
}
