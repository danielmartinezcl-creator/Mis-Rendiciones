export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 bg-ink-100 rounded-item w-36" />
      <div className="flex gap-2">
        {[0, 1, 2].map(i => <div key={i} className="h-9 w-28 bg-ink-100 rounded-item" />)}
      </div>
      <div className="bg-white rounded-card p-5 shadow-card space-y-4">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-ink-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-ink-100 rounded-full" />
              <div className="h-4 bg-ink-100 rounded w-32" />
            </div>
            <div className="h-6 w-16 bg-ink-100 rounded-item" />
          </div>
        ))}
      </div>
    </div>
  )
}
