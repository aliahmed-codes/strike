import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export function ProgressBar({
  label,
  valueLabel,
  percent,
  barClassName = 'bg-primary',
}: {
  label: string
  valueLabel: string
  percent: number
  barClassName?: string
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <span className="font-medium text-foreground">{valueLabel}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <motion.div
          className={cn('h-full rounded-full', barClassName)}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(percent, 100)}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}
