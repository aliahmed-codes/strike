import { useState } from 'react'
import { ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface MultiCheckboxOption {
  value: number
  label: string
}

export function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder = 'Select options…',
}: {
  options: MultiCheckboxOption[]
  selected: number[]
  onChange: (next: number[]) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)

  function toggle(value: number) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  }

  const selectedLabels = options.filter((o) => selected.includes(o.value)).map((o) => o.label)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-auto min-h-9 w-full justify-between px-3 py-2 font-normal"
        >
          <span className={cn('truncate text-left', selectedLabels.length === 0 && 'text-muted-foreground')}>
            {selectedLabels.length === 0
              ? placeholder
              : selectedLabels.length <= 2
                ? selectedLabels.join(', ')
                : `${selectedLabels.length} selected`}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-h-72 w-[--radix-popover-trigger-width] overflow-y-auto p-1" align="start">
        {options.map((option) => {
          const isSelected = selected.includes(option.value)
          return (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <Checkbox checked={isSelected} onCheckedChange={() => toggle(option.value)} />
              {option.label}
            </label>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}
