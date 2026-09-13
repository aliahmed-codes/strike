import { useMemo, useState, type ReactNode } from 'react'
import type { CorridorFacetOption } from '@strike/shared'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useCorridorFacets, type CorridorFacetFilters } from '../api/useReferenceData'
import { CollapsibleSection } from './CollapsibleSection'

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

const EMPTY_FILTERS: Required<Omit<CorridorFacetFilters, 'hideUsdSwift' | 'restrictToUseCaseAllowedCountries'>> & {
  hideUsdSwift: boolean
} = {
  regionIds: [],
  countryIds: [],
  serviceCodes: [],
  transactionTypeCodes: [],
  payoutCurrencyIds: [],
  payerCodes: [],
  hideUsdSwift: false,
}

function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

export function CorridorsToOfferSection({
  restrictToUseCaseAllowedCountries = false,
  fundingCurrencyCount = 1,
}: {
  restrictToUseCaseAllowedCountries?: boolean
  /** Old app shows each corridor once per selected funding currency in this total — matching that display quirk exactly. */
  fundingCurrencyCount?: number
}) {
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const { data: facets, isLoading } = useCorridorFacets({ ...filters, restrictToUseCaseAllowedCountries })
  const multiplier = Math.max(1, fundingCurrencyCount)

  return (
    <CollapsibleSection
      title="Corridors to Offer"
      actions={
        !isLoading && facets ? (
          <span className="text-xs text-primary-foreground/80">
            {facets.totalMatched * multiplier} of {facets.totalAvailable * multiplier} corridors match
          </span>
        ) : undefined
      }
    >
      <p className="mb-3 text-xs text-muted-foreground">
        Preview and filter the real corridor catalog here. Corridors are added with their pricing in the
        Pricing tab.
      </p>
      {isLoading || !facets ? (
        <p className="text-sm text-muted-foreground">Loading corridor catalog…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FacetPanel
            title="Geographical Region"
            options={facets.regions}
            selected={filters.regionIds}
            alwaysEnabled
            onToggle={(value: number) =>
              setFilters((f) => ({ ...f, regionIds: toggleValue(f.regionIds, value) }))
            }
          />
          <FacetPanel
            title="Country"
            options={facets.countries}
            selected={filters.countryIds}
            onToggle={(value: number) =>
              setFilters((f) => ({ ...f, countryIds: toggleValue(f.countryIds, value) }))
            }
          />
          <FacetPanel
            title="Service"
            options={facets.services}
            selected={filters.serviceCodes}
            onToggle={(value: string) =>
              setFilters((f) => ({ ...f, serviceCodes: toggleValue(f.serviceCodes, value) }))
            }
          />
          <FacetPanel
            title="Transaction Type"
            options={facets.transactionTypes}
            selected={filters.transactionTypeCodes}
            onToggle={(value: string) =>
              setFilters((f) => ({
                ...f,
                transactionTypeCodes: toggleValue(f.transactionTypeCodes, value),
              }))
            }
          />
          <FacetPanel
            title="Payout Currency"
            options={facets.payoutCurrencies}
            selected={filters.payoutCurrencyIds}
            onToggle={(value: number) =>
              setFilters((f) => ({ ...f, payoutCurrencyIds: toggleValue(f.payoutCurrencyIds, value) }))
            }
          />
          <FacetPanel
            title="Payer"
            options={facets.payers}
            selected={filters.payerCodes}
            onToggle={(value: string) =>
              setFilters((f) => ({ ...f, payerCodes: toggleValue(f.payerCodes, value) }))
            }
            extraHeader={
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Checkbox
                  checked={filters.hideUsdSwift}
                  onCheckedChange={(checked) =>
                    setFilters((f) => ({ ...f, hideUsdSwift: checked === true }))
                  }
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
