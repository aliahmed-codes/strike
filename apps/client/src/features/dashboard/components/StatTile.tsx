import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { AnimatedNumber } from './AnimatedNumber'

const accentClassName = {
  default: 'bg-card',
  positive: 'bg-emerald-50 dark:bg-emerald-950/30',
  info: 'bg-brand-primary-light dark:bg-primary/10',
} as const

export function StatTile({
  label,
  value,
  format,
  caption,
  accent = 'default',
}: {
  label: string
  value: number
  format?: (n: number) => string
  caption?: string
  accent?: keyof typeof accentClassName
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'rounded-lg border p-4 shadow-sm transition-shadow hover:shadow-md',
        accentClassName[accent]
      )}
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">
        <AnimatedNumber value={value} format={format} />
      </p>
      {caption && <p className="mt-1 text-xs text-muted-foreground">{caption}</p>}
    </motion.div>
  )
}
