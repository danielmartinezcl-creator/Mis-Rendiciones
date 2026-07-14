export default function Loading() {
  return (
    <div className="max-w-xl space-y-5 animate-pulse">
      <div className="h-8 bg-ink-100 rounded-item w-36" />
      <div className="bg-white rounded-card p-5 shadow-card space-y-4">
        <div className="h-5 bg-ink-100 rounded w-40" />
        <div className="grid grid-cols-2 gap-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 bg-ink-100 rounded w-24" />
              <div className="h-10 bg-ink-100 rounded-item" />
            </div>
          ))}
        </div>
        <div className="h-9 w-32 bg-ink-100 rounded-item" />
      </div>
      <div className="bg-white rounded-card p-5 shadow-card space-y-4">
        <div className="h-5 bg-ink-100 rounded w-44" />
        <div className="grid grid-cols-2 gap-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 bg-ink-100 rounded w-24" />
              <div className="h-10 bg-ink-100 rounded-item" />
            </div>
          ))}
        </div>
        <div className="h-9 w-32 bg-ink-100 rounded-item" />
      </div>
    </div>
  )
}
