export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <div className="h-8 bg-ink-100 rounded-item w-36" />
          <div className="h-3 bg-ink-100 rounded w-28" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-36 bg-ink-100 rounded-item" />
          <div className="h-10 w-36 bg-ink-100 rounded-item" />
        </div>
      </div>
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} className="bg-white rounded-card p-4 shadow-card space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-ink-100 rounded-full shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-4 bg-ink-100 rounded w-1/3" />
              <div className="h-3 bg-ink-100 rounded w-1/4" />
            </div>
            <div className="h-8 w-28 bg-ink-100 rounded-item" />
          </div>
          <div className="flex gap-4 pt-2 border-t border-ink-100">
            {[0, 1, 2, 3].map(j => <div key={j} className="h-4 w-24 bg-ink-100 rounded" />)}
          </div>
        </div>
      ))}
    </div>
  )
}
