export default function Loading() {
  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-ink-100 rounded-item shrink-0" />
        <div className="space-y-2 flex-1">
          <div className="h-7 bg-ink-100 rounded w-2/3" />
          <div className="h-3 bg-ink-100 rounded w-1/2" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-card p-4 shadow-card space-y-2">
            <div className="h-3 bg-ink-100 rounded w-3/4" />
            <div className="h-6 bg-ink-100 rounded w-full" />
          </div>
        ))}
      </div>
      <div className="h-28 bg-ink-100 rounded-card" />
      {[0, 1].map(i => (
        <div key={i} className="bg-white rounded-card p-4 shadow-card space-y-3">
          <div className="h-4 bg-ink-100 rounded w-48" />
          <div className="h-16 bg-ink-100 rounded-item" />
        </div>
      ))}
    </div>
  )
}
