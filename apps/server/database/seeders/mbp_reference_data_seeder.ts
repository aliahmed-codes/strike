import { BaseSeeder } from '@adonisjs/lucid/seeders'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Country from '#models/country'
import Region from '#models/region'
import IcpNode from '#models/icp_node'
import CountryTier from '#models/country_tier'
import RegionPressure from '#models/region_pressure'
import IcpSensitivity from '#models/icp_sensitivity'
import DecisionMatrixEntry from '#models/decision_matrix_entry'
import GridFeeAdjustment from '#models/grid_fee_adjustment'
import StrategicOverride from '#models/strategic_override'

/**
 * Real Market-Based Pricing (MBP) rule data, exported directly from the old
 * app's live database (see docs/old-app-reference for the investigation
 * that reverse-engineered this feature) — `real_country_tiers.json`,
 * `real_region_pressures.json`, `real_icp_sensitivities.json`,
 * `real_decision_matrix.json`, `real_grid_fee_adjustments.json`,
 * `real_strategic_overrides.json` under `database/data/`.
 *
 * Every exported row uses the old app's own NAMES/codes (country ISO-3,
 * region name, ICP node name per level) rather than its internal numeric
 * ids, so they can be resolved against *this* app's own ids here. A row
 * whose natural key doesn't resolve (e.g. a country/region/ICP node name
 * that doesn't exist in this app's reference data) is skipped and logged,
 * never silently inserted with a null that would change matching behavior.
 *
 * Must run AFTER `reference_data_seeder.ts` (regions/countries/icp_nodes
 * must already exist). Run explicitly and in order:
 *   node ace db:seed --files="database/seeders/reference_data_seeder.ts"
 *   node ace db:seed --files="database/seeders/mbp_reference_data_seeder.ts"
 *
 * Safe to re-run: `country_tiers` and `decision_matrix` have real natural
 * keys and use `updateOrCreateMany`; the other four tables have no natural
 * key that survives re-seeding safely (e.g. two `region_pressures` rows can
 * legitimately share a region+transaction-type-like value), so those are
 * fully replaced (delete all, then re-insert) on every run.
 */

interface RealCountryTier {
  countryCode: string
  tier: string
  notes: string | null
}

interface RealRegionPressure {
  regionName: string
  transactionType: string
  pressureLevel: string
}

interface RealIcpSensitivity {
  icpLevel1Name: string | null
  icpLevel2Name: string | null
  icpLevel3Name: string | null
  transactionType: string
  sensitivity: string
  description: string | null
}

interface RealDecisionMatrixEntry {
  icpSensitivity: string
  regionPressure: string
  pricingDecision: string
  feeAdjustmentPercent: number
  fxSpreadAdjustmentBps: number
}

interface RealGridFeeAdjustment {
  regionPressure: string
  corridorTier: string
  icpLevel1Name: string | null
  transactionType: string
  fixedFeeUsd: number
  fxSpreadAdjustmentBps: number
  minimumFxSpreadAdjustmentBps: number
}

interface RealStrategicOverride {
  countryCode: string | null
  currencyCode: string | null
  regionName: string | null
  transactionType: string | null
  icpLevel1Name: string | null
  icpLevel2Name: string | null
  icpLevel3Name: string | null
  feeAdjustmentPercent: number | null
  fxSpreadAdjustmentBps: number | null
  reason: string | null
  effectiveFrom: string | null
  effectiveTo: string | null
  isActive: boolean
  priority: number
  overrideMode: string
  targetingMode: string
  fixedFeeUsd: number | null
  fxSpread: number | null
  minimumFxSpread: number | null
  sensitivities: string[] | null
  regionPressures: string[] | null
}

function readJson<T>(filename: string): T {
  const dir = path.dirname(fileURLToPath(import.meta.url))
  return JSON.parse(fs.readFileSync(path.join(dir, '..', 'data', filename), 'utf-8'))
}

export default class extends BaseSeeder {
  async run() {
    const realCountryTiers = readJson<RealCountryTier[]>('real_country_tiers.json')
    const realRegionPressures = readJson<RealRegionPressure[]>('real_region_pressures.json')
    const realIcpSensitivities = readJson<RealIcpSensitivity[]>('real_icp_sensitivities.json')
    const realDecisionMatrix = readJson<RealDecisionMatrixEntry[]>('real_decision_matrix.json')
    const realGridFeeAdjustments = readJson<RealGridFeeAdjustment[]>('real_grid_fee_adjustments.json')
    const realStrategicOverrides = readJson<RealStrategicOverride[]>('real_strategic_overrides.json')

    // Resolution maps: old app's natural keys -> this app's own ids.
    const countries = await Country.all()
    const countryByIso = new Map(countries.map((c) => [c.isoCode3, c]))

    const regions = await Region.all()
    const regionByName = new Map(regions.map((r) => [r.name, r]))

    const icpNodes = await IcpNode.all()
    const icpNodeByLevelName = new Map(icpNodes.map((n) => [`${n.level}:${n.name}`, n]))
    const resolveIcpNode = (level: number, name: string | null) =>
      name ? (icpNodeByLevelName.get(`${level}:${name}`) ?? null) : null

    let skipped = 0

    // 1. Country tiers
    const countryTierRows: { countryId: number; tier: 'G10' | 'G20' | 'Exotic'; notes: string | null }[] = []
    for (const row of realCountryTiers) {
      const country = countryByIso.get(row.countryCode)
      if (!country) {
        console.warn(`⚠️ MBP seed: skipping country tier — unknown country code "${row.countryCode}"`)
        skipped++
        continue
      }
      countryTierRows.push({
        countryId: country.id,
        tier: row.tier as 'G10' | 'G20' | 'Exotic',
        notes: row.notes,
      })
    }
    await CountryTier.updateOrCreateMany('countryId', countryTierRows)
    console.log(`✅ Seeded ${countryTierRows.length} country tiers`)

    // 2. Region pressures — full replace (no safe natural key)
    const regionPressureRows: {
      regionId: number
      transactionType: string
      pressureLevel: 'High' | 'Medium' | 'Low'
    }[] = []
    for (const row of realRegionPressures) {
      const region = regionByName.get(row.regionName)
      if (!region) {
        console.warn(`⚠️ MBP seed: skipping region pressure — unknown region "${row.regionName}"`)
        skipped++
        continue
      }
      regionPressureRows.push({
        regionId: region.id,
        transactionType: row.transactionType,
        pressureLevel: row.pressureLevel as 'High' | 'Medium' | 'Low',
      })
    }
    await RegionPressure.query().delete()
    await RegionPressure.createMany(regionPressureRows)
    console.log(`✅ Seeded ${regionPressureRows.length} region pressures`)

    // 3. ICP sensitivities — full replace
    const icpSensitivityRows: {
      icpNodeIdL1: number | null
      icpNodeIdL2: number | null
      icpNodeIdL3: number | null
      transactionType: string
      sensitivity: 'High' | 'Medium' | 'Low'
      description: string | null
    }[] = []
    for (const row of realIcpSensitivities) {
      const l1 = resolveIcpNode(1, row.icpLevel1Name)
      const l2 = resolveIcpNode(2, row.icpLevel2Name)
      const l3 = resolveIcpNode(3, row.icpLevel3Name)
      if (row.icpLevel3Name && !l3) {
        console.warn(`⚠️ MBP seed: skipping ICP sensitivity — unknown ICP L3 node "${row.icpLevel3Name}"`)
        skipped++
        continue
      }
      icpSensitivityRows.push({
        icpNodeIdL1: l1?.id ?? null,
        icpNodeIdL2: l2?.id ?? null,
        icpNodeIdL3: l3?.id ?? null,
        transactionType: row.transactionType,
        sensitivity: row.sensitivity as 'High' | 'Medium' | 'Low',
        description: row.description,
      })
    }
    await IcpSensitivity.query().delete()
    await IcpSensitivity.createMany(icpSensitivityRows)
    console.log(`✅ Seeded ${icpSensitivityRows.length} ICP sensitivities`)

    // 4. Decision matrix (real natural key: sensitivity + pressure)
    await DecisionMatrixEntry.updateOrCreateMany(
      ['icpSensitivity', 'regionPressure'],
      realDecisionMatrix.map((row) => ({
        icpSensitivity: row.icpSensitivity as 'High' | 'Medium' | 'Low',
        regionPressure: row.regionPressure as 'High' | 'Medium' | 'Low',
        pricingDecision: row.pricingDecision,
        feeAdjustmentPercent: row.feeAdjustmentPercent,
        fxSpreadAdjustmentBps: row.fxSpreadAdjustmentBps,
      }))
    )
    console.log(`✅ Seeded ${realDecisionMatrix.length} decision matrix entries`)

    // 5. Grid fee adjustments — full replace
    const gridRows: {
      regionPressure: 'High' | 'Medium' | 'Low'
      corridorTier: 'G10' | 'G20' | 'Exotic'
      icpNodeIdL1: number
      transactionType: string
      fixedFeeUsd: number
      fxSpreadAdjustmentBps: number
      minimumFxSpreadAdjustmentBps: number
    }[] = []
    for (const row of realGridFeeAdjustments) {
      const l1 = resolveIcpNode(1, row.icpLevel1Name)
      if (!l1) {
        console.warn(`⚠️ MBP seed: skipping grid fee adjustment — unknown ICP L1 node "${row.icpLevel1Name}"`)
        skipped++
        continue
      }
      gridRows.push({
        regionPressure: row.regionPressure as 'High' | 'Medium' | 'Low',
        corridorTier: row.corridorTier as 'G10' | 'G20' | 'Exotic',
        icpNodeIdL1: l1.id,
        transactionType: row.transactionType,
        fixedFeeUsd: row.fixedFeeUsd,
        fxSpreadAdjustmentBps: row.fxSpreadAdjustmentBps,
        minimumFxSpreadAdjustmentBps: row.minimumFxSpreadAdjustmentBps,
      })
    }
    await GridFeeAdjustment.query().delete()
    await GridFeeAdjustment.createMany(gridRows)
    console.log(`✅ Seeded ${gridRows.length} grid fee adjustments`)

    // 6. Strategic overrides — full replace
    const overrideRows: Record<string, unknown>[] = []
    for (const row of realStrategicOverrides) {
      const country = row.countryCode ? countryByIso.get(row.countryCode) : null
      if (row.countryCode && !country) {
        console.warn(`⚠️ MBP seed: skipping strategic override — unknown country code "${row.countryCode}"`)
        skipped++
        continue
      }
      const region = row.regionName ? regionByName.get(row.regionName) : null
      overrideRows.push({
        countryId: country?.id ?? null,
        currencyId: null, // none of the real rows currently set a currency code
        regionId: region?.id ?? null,
        transactionType: row.transactionType,
        icpNodeIdL1: resolveIcpNode(1, row.icpLevel1Name)?.id ?? null,
        icpNodeIdL2: resolveIcpNode(2, row.icpLevel2Name)?.id ?? null,
        icpNodeIdL3: resolveIcpNode(3, row.icpLevel3Name)?.id ?? null,
        sensitivities: row.sensitivities,
        regionPressures: row.regionPressures,
        feeAdjustmentPercent: row.feeAdjustmentPercent,
        fxSpreadAdjustmentBps: row.fxSpreadAdjustmentBps,
        fixedFeeUsd: row.fixedFeeUsd,
        fxSpread: row.fxSpread,
        minimumFxSpread: row.minimumFxSpread,
        overrideMode: row.overrideMode,
        targetingMode: row.targetingMode,
        reason: row.reason,
        priority: row.priority,
        isActive: row.isActive,
        effectiveFrom: row.effectiveFrom,
        effectiveTo: row.effectiveTo,
      })
    }
    await StrategicOverride.query().delete()
    await StrategicOverride.createMany(overrideRows)
    console.log(`✅ Seeded ${overrideRows.length} strategic overrides`)

    if (skipped > 0) {
      console.warn(`⚠️ MBP seed: ${skipped} row(s) skipped — see warnings above`)
    }
  }
}
