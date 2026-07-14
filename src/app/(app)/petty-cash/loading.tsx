export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <div className="h-8 bg-ink-100 rounded-item w-40" />
          <div className="h-3 bg-ink-100 rounded w-28" />
        </div>
        <div className="h-10 w-32 bg-ink-100 rounded-item" />
      </div>
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="bg-white rounded-card p-4 shadow-card space-y-3">
          <div className="flex justify-between items-start">
            <div className="space-y-2 flex-1">
              <div className="h-5 bg-ink-100 rounded w-1/2" />
              <div className="h-3 bg-ink-100 rounded w-1/3" />
            </div>
            <div className="h-6 w-24 bg-ink-100 rounded-full" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map(j => (
              <div key={j} className="h-14 bg-ink-100 rounded-item" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
