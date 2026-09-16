import { useMemo, useState, type ReactNode } from 'react'
import type { Corridor, CorridorFacetOption, Quote } from '@strike/shared'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useCorridorFacets, type CorridorFacetFilters } from '../api/useReferenceData'
import { useQuoteFormField } from '../hooks/useQuoteFormField'
import { CollapsibleSection } from './CollapsibleSection'

const EMPTY_NUMBER_ARRAY: number[] = []
const EMPTY_STRING_ARRAY: string[] = []

/**
 * The 7 "Corridors to Offer" filter fields, buffered the same way every other
 * quote field is (via `useQuoteFormField` — local until "Save Draft"). Reading
 * this hook from both `CorridorsToOfferSection` (on Summary) and `PricingTab`
 * (on Pricing) is what makes a filter change on one tab instantly reflected
 * on the other — both read the same `pendingFields[tabKey]` slice.
 */
export function useCorridorFilterFields(tabKey: string, quote: Quote | undefined) {
  const [regionIds, setRegionIds] = useQuoteFormField(
    tabKey,
    quote?.corridorFilterRegionIds,
    'corridorFilterRegionIds',
    EMPTY_NUMBER_ARRAY
  )
  const [countryIds, setCountryIds] = useQuoteFormField(
    tabKey,
    quote?.corridorFilterCountryIds,
    'corridorFilterCountryIds',
    EMPTY_NUMBER_ARRAY
  )
  const [serviceCodes, setServiceCodes] = useQuoteFormField(
    tabKey,
    quote?.corridorFilterServiceCodes,
    'corridorFilterServiceCodes',
    EMPTY_STRING_ARRAY
  )
  const [transactionTypeCodes, setTransactionTypeCodes] = useQuoteFormField(
    tabKey,
    quote?.corridorFilterTransactionTypeCodes,
    'corridorFilterTransactionTypeCodes',
    EMPTY_STRING_ARRAY
  )
  const [payoutCurrencyIds, setPayoutCurrencyIds] = useQuoteFormField(
    tabKey,
    quote?.corridorFilterPayoutCurrencyIds,
    'corridorFilterPayoutCurrencyIds',
    EMPTY_NUMBER_ARRAY
  )
  const [payerCodes, setPayerCodes] = useQuoteFormField(
    tabKey,
    quote?.corridorFilterPayerCodes,
    'corridorFilterPayerCodes',
    EMPTY_STRING_ARRAY
  )
  const [hideUsdSwift, setHideUsdSwift] = useQuoteFormField(
    tabKey,
    quote?.corridorFilterHideUsdSwift,
    'corridorFilterHideUsdSwift',
    false
  )

  const filters: Required<CorridorFacetFilters> = {
    regionIds,
    countryIds,
    serviceCodes,
    transactionTypeCodes,
    payoutCurrencyIds,
    payerCodes,
    hideUsdSwift,
    restrictToUseCaseAllowedCountries: false,
  }

  return {
    filters,
    setRegionIds,
    setCountryIds,
    setServiceCodes,
    setTransactionTypeCodes,
    setPayoutCurrencyIds,
    setPayerCodes,
    setHideUsdSwift,
  }
}

export function corridorLabel(c: Corridor): string {
  return `${c.country?.name ?? c.countryId} · ${c.serviceCode} · ${c.transactionTypeCode} · ${c.payoutCurrency?.isoCode3 ?? ''}`
}

function FacetPanel<T extends string | number>({
  title,
  options,
  selected,
  onToggle,
  alwaysEnabled = false,
  extraHeader,
}: {
  title: string
  options: CorridorFacetOption[]
  selected: T[]
  onToggle: (value: T) => void
  alwaysEnabled?: boolean
  extraHeader?: ReactNode
}) {
  const [search, setSearch] = useState('')

  const filteredOptions = useMemo(
    () => options.filter((o) => o.label.toLowerCase().includes(search.trim().toLowerCase())),
    [options, search]
  )

  // Selected-and-available first, then selected-but-now-disabled, then
  // available, then disabled — same grouping as the old app's picker, so an
  // active selection never scrolls out of view when it goes to 0.
  const orderedOptions = useMemo(() => {
    const active: CorridorFacetOption[] = []
    const selectedDisabled: CorridorFacetOption[] = []
    const available: CorridorFacetOption[] = []
    const disabled: CorridorFacetOption[] = []
    for (const option of filteredOptions) {
      const isSelected = selected.includes(option.value as T)
      if (isSelected && option.count > 0) active.push(option)
      else if (isSelected) selectedDisabled.push(option)
      else if (option.count > 0) available.push(option)
      else disabled.push(option)
    }
    return [...active, ...selectedDisabled, ...available, ...disabled]
  }, [filteredOptions, selected])

  const selectedLabels = options.filter((o) => selected.includes(o.value as T)).map((o) => o.label)

  return (
    <div className="flex flex-col rounded-lg border">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <p className="text-sm font-semibold">{title}</p>
        {extraHeader}
      </div>
      <div className="p-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${title.toLowerCase()}…`}
          className="h-8 text-sm"
        />
      </div>
      <div className="max-h-56 overflow-y-auto px-2 pb-2">
        {orderedOptions.map((option) => {
          const isSelected = selected.includes(option.value as T)
          const isDisabled = !alwaysEnabled && option.count === 0 && !isSelected
          return (
            <button
              key={option.value}
              type="button"
              disabled={isDisabled}
              onClick={() => onToggle(option.value as T)}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                isSelected && 'bg-primary text-primary-foreground',
                !isSelected && !isDisabled && 'hover:bg-muted',
                isDisabled && 'cursor-not-allowed text-muted-foreground/50'
              )}
            >
              <span className="flex items-center gap-2 truncate">
                <Checkbox checked={isSelected} disabled={isDisabled} />
                <span className="truncate">{option.label}</span>
              </span>
              <span
                className={cn(
                  'shrink-0 text-xs',
                  isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                )}
              >
                ({option.count})
              </span>
            </button>
          )
        })}
        {orderedOptions.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted-foreground">No matches</p>
        )}
      </div>
      <p className="truncate border-t px-3 py-1.5 text-xs text-muted-foreground">
        Selected: {selectedLabels.length > 0 ? selectedLabels.join(', ') : 'All'}
      </p>
    </div>
  )
}

function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

/**
 * "Corridors to Offer" — the same facet-filter panel as the old app's, kept
 * as pure local (buffered) filter state, not a picker that adds rows itself.
 * Matching corridors show up live as preview rows on the Pricing tab — see
 * `PricingTab.tsx`'s merge of saved + filter-matched rows. This section's
 * only job is to let the user narrow that filter and see how many corridors
 * it matches; it never calls the API to create anything.
 */
export function CorridorsToOfferSection({
  tabKey,
  quote,
  restrictToUseCaseAllowedCountries = false,
}: {
  tabKey: string
  quote: Quote | undefined
  restrictToUseCaseAllowedCountries?: boolean
}) {
  const {
    filters,
    setRegionIds,
    setCountryIds,
    setServiceCodes,
    setTransactionTypeCodes,
    setPayoutCurrencyIds,
    setPayerCodes,
    setHideUsdSwift,
  } = useCorridorFilterFields(tabKey, quote)
  const filterParams = { ...filters, restrictToUseCaseAllowedCountries }
  const { data: facets, isLoading, isError } = useCorridorFacets(filterParams)

  return (
    <CollapsibleSection
      title="Corridors to Offer"
      actions={
        !isLoading && facets ? (
          <span className="text-xs text-primary-foreground/80">
            {facets.totalMatched} of {facets.totalAvailable} corridors match
          </span>
        ) : undefined
      }
    >
      <p className="mb-3 text-xs text-muted-foreground">
        Filter the real corridor catalog — matching corridors show up automatically as preview
        rows on the Pricing tab. Edit a preview row there to save it.
      </p>
      {isError ? (
        <p role="alert" className="text-sm text-destructive">Could not load corridor counts. Please try again.</p>
      ) : isLoading || !facets ? (
        <p role="status" className="text-sm text-muted-foreground">Loading corridor catalog…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FacetPanel
            title="Geographical Region"
            options={facets.regions}
            selected={filters.regionIds}
            alwaysEnabled
            onToggle={(value: number) => setRegionIds(toggleValue(filters.regionIds, value))}
          />
          <FacetPanel
            title="Country"
            options={facets.countries}
            selected={filters.countryIds}
            onToggle={(value: number) => setCountryIds(toggleValue(filters.countryIds, value))}
          />
          <FacetPanel
            title="Service"
            options={facets.services}
            selected={filters.serviceCodes}
            onToggle={(value: string) => setServiceCodes(toggleValue(filters.serviceCodes, value))}
          />
          <FacetPanel
            title="Transaction Type"
            options={facets.transactionTypes}
            selected={filters.transactionTypeCodes}
            onToggle={(value: string) =>
              setTransactionTypeCodes(toggleValue(filters.transactionTypeCodes, value))
            }
          />
          <FacetPanel
            title="Payout Currency"
            options={facets.payoutCurrencies}
            selected={filters.payoutCurrencyIds}
            onToggle={(value: number) =>
              setPayoutCurrencyIds(toggleValue(filters.payoutCurrencyIds, value))
            }
          />
          <FacetPanel
            title="Payer"
            options={facets.payers}
            selected={filters.payerCodes}
            onToggle={(value: string) => setPayerCodes(toggleValue(filters.payerCodes, value))}
            extraHeader={
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Checkbox
                  checked={filters.hideUsdSwift}
                  onCheckedChange={(checked) => setHideUsdSwift(checked === true)}
                />
                Hide USD SWIFT
              </label>
            }
          />
        </div>
      )}
    </CollapsibleSection>
  )
}
