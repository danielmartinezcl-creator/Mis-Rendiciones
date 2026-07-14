export default function Loading() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-8 bg-ink-100 rounded-item w-52" />
      <div className="h-3 bg-ink-100 rounded w-36" />
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="bg-white rounded-card p-4 space-y-3 shadow-card">
          <div className="flex justify-between items-start">
            <div className="space-y-2 flex-1">
              <div className="h-4 bg-ink-100 rounded w-3/4" />
              <div className="h-3 bg-ink-100 rounded w-1/2" />
            </div>
            <div className="h-6 w-20 bg-ink-100 rounded-full shrink-0" />
          </div>
          <div className="flex gap-2">
            <div className="h-3 w-24 bg-ink-100 rounded" />
            <div className="h-3 w-16 bg-ink-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}
