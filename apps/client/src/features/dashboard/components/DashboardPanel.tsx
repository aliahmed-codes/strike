import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'

export function DashboardPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="overflow-hidden py-0 gap-0">
        <div className="bg-primary px-6 py-4">
          <h2 className="text-base font-semibold text-primary-foreground">{title}</h2>
        </div>
        <CardContent className="space-y-6 p-6">{children}</CardContent>
      </Card>
    </motion.div>
  )
}
