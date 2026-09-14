import { useState } from 'react'
import type { FxModel, FxPricingOption, PricingStrategy, Quote, QuoteTotals } from '@strike/shared'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useCountries,
  useCurrencies,
  useIcpNodes,
  useIntegrationTypes,
  useRegions,
  useUseCases,
} from '../api/useReferenceData'
import { useQuoteFormField } from '../hooks/useQuoteFormField'
import { CollapsibleSection } from './CollapsibleSection'
import { FormField } from './FormField'
import { MultiSelectDropdown } from './MultiSelectDropdown'
import { SimpleSelect } from './SimpleSelect'
import { CorridorsToOfferSection } from './CorridorsToOfferSection'

const OPPORTUNITY_TYPES = ['New partner', 'Pricing Change', 'Upsell']

const FX_MODELS = [
  { value: 'traditional_fx', label: 'Traditional FX' },
  { value: 'trading_desk', label: 'Trading Desk' },
  { value: 'both_models', label: 'Both Models' },
]
const FX_MODEL_CAPTIONS: Record<string, string> = {
  traditional_fx: 'The partner uses FX rates provided by the platform, with a built-in spread',
  trading_desk: 'The partner provides their own FX rate via a treasury function',
  both_models: 'Partner can choose between Traditional FX and Trading Desk',
}

// Only "Corridor Pricing" has real pricing rules implemented today — the rest
// are shown (matching the old app's dropdown) but disabled until built.
const PRICING_STRATEGIES = [
  { value: 'corridor_pricing', label: 'Corridor Pricing' },
  { value: 'flat_fee', label: 'Flat Fee', disabled: true },
  { value: 'volume_based', label: 'Volume-Based', disabled: true },
  { value: 'tiered_pricing', label: 'Tiered Pricing', disabled: true },
]

const FX_PRICING_OPTIONS = [
  { value: 'fx_spread', label: 'FX Spread' },
  { value: 'revenue_share', label: 'Revenue Share' },
]

const INTEGRATION_TYPE_CAPTIONS: Record<string, string> = {
  'New API Integration': 'Direct integration via Thunes APIs (high setup fee)',
  'Transfers with Thunes Business Hub': 'Partner uses the Thunes Business Hub portal (low setup fee)',
  'Middleware Integration': 'Integration via a third-party platform (moderate setup fee)',
  'New Vertical & Corridor': 'Expansion into a new business vertical and corridor (high setup fee)',
  'New Corridor': 'Adding a new country or payout method (low to moderate setup fee)',
}
const YES_NO = [
  { value: 'yes', label: 'YES' },
  { value: 'no', label: 'NO' },
]

const currency = (n: number) => `$${Math.round(n).toLocaleString()}`

export function SummaryTab({
  tabKey,
  quote,
  totals,
  isLoading,
}: {
  tabKey: string
  quote: Quote | undefined
  totals: QuoteTotals | undefined
  isLoading: boolean
}) {
  const { data: regions } = useRegions()
  const { data: countries } = useCountries()
  const { data: useCases } = useUseCases()
  const { data: integrationTypes } = useIntegrationTypes()
  const { data: icpNodes } = useIcpNodes()
  const { data: currencies } = useCurrencies()

  // Region has no field of its own on the quote — it's always the selected
  // country's region, exactly like the old app. This is only a UI filter on
  // top of the same country list; the region picker just narrows it down.
  const [regionFilter, setRegionFilter] = useState<number | null>(null)

  const [name, setName] = useQuoteFormField(tabKey, quote?.name, 'name', '')
  const [opportunityType, setOpportunityType] = useQuoteFormField(
    tabKey,
    quote?.opportunityType,
    'opportunityType',
    null
  )
  const [useCaseIds, setUseCaseIds] = useQuoteFormField(
    tabKey,
    quote?.useCases?.map((u) => u.id),
    'useCaseIds',
    []
  )
  // Matches the old app's compliance rule: these two use cases restrict the
  // corridor picker to a fixed country allow-list (e.g. Pakistan drops out).
  const restrictedUseCaseLabels = new Set(['last mile payout', 'account top-up'])
  const restrictCorridorCountries = useCaseIds.some((id) => {
    const label = useCases?.find((u) => u.id === id)?.label.toLowerCase()
    return label ? restrictedUseCaseLabels.has(label) : false
  })
  const [partnerCountryId, setPartnerCountryId] = useQuoteFormField(
    tabKey,
    quote?.partnerCountryId,
    'partnerCountryId',
    null
  )

  const selectedCountryRegionId =
    (countries ?? []).find((c) => c.id === partnerCountryId)?.regionId ?? null
  const effectiveRegionId = regionFilter ?? selectedCountryRegionId
  const countryOptions = (countries ?? [])
    .filter((c) => effectiveRegionId === null || c.regionId === effectiveRegionId)
    .map((c) => ({ value: String(c.id), label: c.name }))

  function handleRegionChange(value: string) {
    const regionId = Number(value)
    setRegionFilter(regionId)
    const countriesInRegion = (countries ?? []).filter((c) => c.regionId === regionId)
    if (countriesInRegion.length > 0 && !countriesInRegion.some((c) => c.id === partnerCountryId)) {
      setPartnerCountryId(countriesInRegion[0].id)
    }
  }

  function handleCountryChange(value: string) {
    const id = Number(value)
    setPartnerCountryId(id)
    const country = (countries ?? []).find((c) => c.id === id)
    setRegionFilter(country?.regionId ?? null)
  }

  const [icpLevel1Id, setIcpLevel1Id] = useQuoteFormField(tabKey, quote?.icpLevel1Id, 'icpLevel1Id', null)
  const [icpLevel2Id, setIcpLevel2Id] = useQuoteFormField(tabKey, quote?.icpLevel2Id, 'icpLevel2Id', null)
  const [icpLevel3Id, setIcpLevel3Id] = useQuoteFormField(tabKey, quote?.icpLevel3Id, 'icpLevel3Id', null)
  const [contractLengthYears, setContractLengthYears] = useQuoteFormField(
    tabKey,
    quote?.contractLengthYears,
    'contractLengthYears',
    null
  )
  const [partnerPrCode, setPartnerPrCode] = useQuoteFormField(
    tabKey,
    quote?.partnerPrCode,
    'partnerPrCode',
    null
  )
  const [showFxSourceInContract, setShowFxSourceInContract] = useQuoteFormField(
    tabKey,
    quote?.showFxSourceInContract,
    'showFxSourceInContract',
    false
  )
  const [showFxSpreadInContract, setShowFxSpreadInContract] = useQuoteFormField(
    tabKey,
    quote?.showFxSpreadInContract,
    'showFxSpreadInContract',
    false
  )
  const [integrationTypeId, setIntegrationTypeId] = useQuoteFormField(
    tabKey,
    quote?.integrationTypeId,
    'integrationTypeId',
    null
  )
  const [fxModel, setFxModel] = useQuoteFormField(tabKey, quote?.fxModel, 'fxModel', null)
  const [selectedPricingStrategy, setSelectedPricingStrategy] = useQuoteFormField(
    tabKey,
    quote?.selectedPricingStrategy,
    'selectedPricingStrategy',
    null
  )
  const [selectedFxPricing, setSelectedFxPricing] = useQuoteFormField(
    tabKey,
    quote?.selectedFxPricing,
    'selectedFxPricing',
    null
  )
  const [, setFundingCurrencyId] = useQuoteFormField(
    tabKey,
    quote?.fundingCurrencyId,
    'fundingCurrencyId',
    null
  )
  const [fundingCurrencyIds, setFundingCurrencyIds] = useQuoteFormField(
    tabKey,
    quote?.fundingCurrencies?.map((c) => c.id),
    'fundingCurrencyIds',
    []
  )
  // Quantity isn't persisted — it's just how many funding-currency pickers to
  // show, derived from how many are already selected (old app's "Quantity
  // Funding Currencies" is a real 1-or-2 selector for this).
  const [fundingCurrencyQuantity, setFundingCurrencyQuantity] = useState(
    Math.max(1, fundingCurrencyIds.length)
  )
  const [sourceCurrencyId, setSourceCurrencyId] = useQuoteFormField(
    tabKey,
    quote?.sourceCurrencyId,
    'sourceCurrencyId',
    null
  )
  const [defaultFeeCurrencyId, setDefaultFeeCurrencyId] = useQuoteFormField(
    tabKey,
    quote?.defaultFeeCurrencyId,
    'defaultFeeCurrencyId',
    null
  )

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    )
  }

  const icpLevel1Options = (icpNodes ?? []).filter((n) => n.level === 1)
  const icpLevel2Options = (icpNodes ?? []).filter((n) => n.level === 2 && n.parentId === icpLevel1Id)
  const icpLevel3Options = (icpNodes ?? []).filter((n) => n.level === 3 && n.parentId === icpLevel2Id)

  return (
    <div className="space-y-6">
      <CollapsibleSection title="Quoting Details">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Sending Partner Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="Opportunity type" caption="Expansion of services for an existing partner">
            <SimpleSelect
              value={opportunityType ?? ''}
              onValueChange={setOpportunityType}
              options={OPPORTUNITY_TYPES.map((t) => ({ value: t, label: t }))}
            />
          </FormField>
          <FormField label="Use Cases" required>
            <MultiSelectDropdown
              options={(useCases ?? []).map((u) => ({ value: u.id, label: u.label }))}
              selected={useCaseIds}
              onChange={setUseCaseIds}
              placeholder="Select use cases…"
            />
          </FormField>
          <FormField label="Opportunity Owner" caption="The user who owns this quote">
            <Input value={quote?.owner ? `${quote.owner.firstName} ${quote.owner.lastName} (${quote.owner.email})` : 'You (after saving)'} disabled />
          </FormField>

          <FormField label="Sending Partner Region" caption="Filters the country list below">
            <SimpleSelect
              value={effectiveRegionId ? String(effectiveRegionId) : ''}
              onValueChange={handleRegionChange}
              options={(regions ?? []).map((r) => ({ value: String(r.id), label: r.name }))}
            />
          </FormField>
          <FormField label="Sending Partner Country" caption="Determines regulatory/compliance requirements">
            <SimpleSelect
              value={partnerCountryId ? String(partnerCountryId) : ''}
              onValueChange={handleCountryChange}
              options={countryOptions}
            />
          </FormField>
          <FormField label="ICP Level 1 (Category)" caption="Select primary business type">
            <SimpleSelect
              value={icpLevel1Id ? String(icpLevel1Id) : ''}
              onValueChange={(v) => {
                setIcpLevel1Id(Number(v))
                setIcpLevel2Id(null)
                setIcpLevel3Id(null)
              }}
              options={icpLevel1Options.map((n) => ({ value: String(n.id), label: n.name }))}
            />
          </FormField>
          <FormField label="ICP Level 2 (Subcategory)" caption="Select subcategory based on Level 1">
            <SimpleSelect
              value={icpLevel2Id ? String(icpLevel2Id) : ''}
              onValueChange={(v) => {
                setIcpLevel2Id(Number(v))
                setIcpLevel3Id(null)
              }}
              options={icpLevel2Options.map((n) => ({ value: String(n.id), label: n.name }))}
              disabled={!icpLevel1Id}
            />
          </FormField>
          <FormField label="ICP Level 3 (Specific)" caption="Specific classification for pricing sensitivity">
            <SimpleSelect
              value={icpLevel3Id ? String(icpLevel3Id) : ''}
              onValueChange={(v) => setIcpLevel3Id(Number(v))}
              options={icpLevel3Options.map((n) => ({ value: String(n.id), label: n.name }))}
              disabled={!icpLevel2Id}
            />
          </FormField>

          <FormField label="Contract Length (years)">
            <Input
              type="number"
              min={1}
              value={contractLengthYears ?? ''}
              onChange={(e) => setContractLengthYears(e.target.value ? Number(e.target.value) : null)}
            />
          </FormField>
          <FormField label="PR Code" caption="Internal tracking field for CRM systems">
            <Input value={partnerPrCode ?? ''} onChange={(e) => setPartnerPrCode(e.target.value)} />
          </FormField>

          <FormField label="Show FX Source in contract" caption="More pricing flexibility (for B2C, remittance platforms, startups)">
            <SimpleSelect
              value={showFxSourceInContract ? 'yes' : 'no'}
              onValueChange={(v) => setShowFxSourceInContract(v === 'yes')}
              options={YES_NO}
            />
          </FormField>
          <FormField label="Show FX Spread in contract" caption="More pricing flexibility (for B2C, remittance platforms, startups)">
            <SimpleSelect
              value={showFxSpreadInContract ? 'yes' : 'no'}
              onValueChange={(v) => setShowFxSpreadInContract(v === 'yes')}
              options={YES_NO}
            />
          </FormField>
        </div>
      </CollapsibleSection>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CollapsibleSection title="Technical Pricing Details">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              label="Integration Type"
              caption={
                (integrationTypes ?? []).find((t) => t.id === integrationTypeId)?.name
                  ? INTEGRATION_TYPE_CAPTIONS[
                      (integrationTypes ?? []).find((t) => t.id === integrationTypeId)!.name
                    ]
                  : 'Determines the setup fee and delivery timeline'
              }
            >
              <SimpleSelect
                value={integrationTypeId ? String(integrationTypeId) : ''}
                onValueChange={(v) => setIntegrationTypeId(Number(v))}
                options={(integrationTypes ?? []).map((t) => ({ value: String(t.id), label: t.name }))}
              />
            </FormField>
            <FormField label="FX Model" caption={fxModel ? FX_MODEL_CAPTIONS[fxModel] : 'How FX margin is generated for this partner'}>
              <SimpleSelect
                value={fxModel ?? ''}
                onValueChange={(v) => setFxModel(v as FxModel)}
                options={FX_MODELS}
              />
            </FormField>
            <FormField label="Pricing Strategy" caption="Select the overall pricing approach for this engagement">
              <SimpleSelect
                value={selectedPricingStrategy ?? ''}
                onValueChange={(v) => setSelectedPricingStrategy(v as PricingStrategy)}
                options={PRICING_STRATEGIES}
              />
            </FormField>
            <FormField label="FX Pricing" caption="Specifies how FX margin is monetized">
              <SimpleSelect
                value={selectedFxPricing ?? ''}
                onValueChange={(v) => setSelectedFxPricing(v as FxPricingOption)}
                options={FX_PRICING_OPTIONS}
              />
            </FormField>
            <FormField label="Source Currency" caption="Currency in which the sender initiates transfers">
              <SimpleSelect
                value={sourceCurrencyId ? String(sourceCurrencyId) : ''}
                onValueChange={(v) => setSourceCurrencyId(Number(v))}
                options={(currencies ?? []).map((c) => ({ value: String(c.id), label: c.isoCode3 }))}
              />
            </FormField>
            <FormField label="Default Fee Currency" caption="Currency in which fees are displayed to the partner">
              <SimpleSelect
                value={defaultFeeCurrencyId ? String(defaultFeeCurrencyId) : ''}
                onValueChange={(v) => setDefaultFeeCurrencyId(Number(v))}
                options={(currencies ?? []).map((c) => ({ value: String(c.id), label: c.isoCode3 }))}
              />
            </FormField>
            <FormField label="Quantity Funding Currencies" caption="How many funding currencies this partner uses">
              <SimpleSelect
                value={String(fundingCurrencyQuantity)}
                onValueChange={(v) => {
                  const quantity = Number(v)
                  setFundingCurrencyQuantity(quantity)
                  if (fundingCurrencyIds.length > quantity) {
                    setFundingCurrencyIds(fundingCurrencyIds.slice(0, quantity))
                  }
                }}
                options={[
                  { value: '1', label: '1' },
                  { value: '2', label: '2' },
                ]}
              />
            </FormField>
            {Array.from({ length: fundingCurrencyQuantity }).map((_, index) => (
              <FormField
                key={index}
                label={fundingCurrencyQuantity > 1 ? `Funding Currency ${index + 1}` : 'Funding Currency'}
                caption={
                  index === 0
                    ? 'Currency used to fund Thunes for payouts. Syncs Source Currency and Default Fee Currency.'
                    : undefined
                }
              >
                <SimpleSelect
                  value={fundingCurrencyIds[index] ? String(fundingCurrencyIds[index]) : ''}
                  onValueChange={(v) => {
                    const next = [...fundingCurrencyIds]
                    next[index] = Number(v)
                    setFundingCurrencyIds(next)
                    if (index === 0) {
                      setFundingCurrencyId(Number(v))
                      setSourceCurrencyId(Number(v))
                      setDefaultFeeCurrencyId(Number(v))
                    }
                  }}
                  options={(currencies ?? []).map((c) => ({ value: String(c.id), label: c.isoCode3 }))}
                />
              </FormField>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Static Rates">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
                  <th className="pb-2 font-medium">Currency</th>
                  <th className="pb-2 font-medium">ISO Code</th>
                  <th className="pb-2 text-right font-medium">Pegged Rate (USD)</th>
                </tr>
              </thead>
              <tbody>
                {(currencies ?? [])
                  .filter((c) => c.isPegged)
                  .map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="py-2.5 font-medium">{c.name}</td>
                      <td className="py-2.5">{c.isoCode3}</td>
                      <td className="py-2.5 text-right">
                        <span className="rounded bg-brand-primary-light px-2 py-0.5 text-primary">
                          {/* Rate comes from /reference/pegged-rates once that's wired; showing the currency for now. */}
                          —
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Pegged rate can only be changed when the funding currency is a hard currency.
          </p>
        </CollapsibleSection>
      </div>

      <CorridorsToOfferSection
        restrictToUseCaseAllowedCountries={restrictCorridorCountries}
        fundingCurrencyCount={fundingCurrencyIds.length}
      />

      <CollapsibleSection title="Financial Summary">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryStat label="Total Revenue" value={currency(totals?.totalRevenue ?? 0)} />
          <SummaryStat label="Total Margin" value={currency(totals?.totalMargin ?? 0)} />
          <SummaryStat label="Total Volume" value={currency(totals?.totalVolumeUsd ?? 0)} />
          <SummaryStat label="Total Transactions" value={(totals?.totalTransactions ?? 0).toLocaleString()} />
          <SummaryStat label="Take Rate %" value={`${(totals?.averageTakeRatePct ?? 0).toFixed(2)}%`} />
          <SummaryStat label="GM %" value={`${(totals?.weightedGrossMarginPct ?? 0).toFixed(2)}%`} />
          <SummaryStat label="Corridors Priced" value={String(totals?.corridorCount ?? 0)} />
          <SummaryStat label="Needing Approval" value={String(totals?.corridorsNeedingApproval ?? 0)} />
        </div>
      </CollapsibleSection>
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs text-muted-foreground uppercase">{label}</p>
    </div>
  )
}
