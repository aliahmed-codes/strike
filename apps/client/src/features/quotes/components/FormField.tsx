import type { ReactNode } from 'react'

export function FormField({
  label,
  caption,
  required,
  children,
}: {
  label: string
  caption?: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-primary">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      {children}
      {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
    </div>
  )
}
