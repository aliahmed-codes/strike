import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  actions,
}: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  actions?: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Card className="overflow-hidden gap-0 py-0">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between bg-primary px-6 py-4">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex flex-1 items-center gap-2 text-left">
              <motion.span
                animate={{ rotate: open ? 0 : -90 }}
                transition={{ duration: 0.2 }}
                className="text-primary-foreground"
              >
                <ChevronDown className="size-4" />
              </motion.span>
              <h2 className="text-base font-semibold text-primary-foreground">{title}</h2>
            </button>
          </CollapsibleTrigger>
          {actions}
        </div>
        <CollapsibleContent
          className={cn(
            'overflow-hidden',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0'
          )}
        >
          <CardContent className="space-y-6 p-6">{children}</CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}
