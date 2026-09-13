export function PlaceholderTab({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-24 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">This section hasn't been built yet.</p>
    </div>
  )
}
