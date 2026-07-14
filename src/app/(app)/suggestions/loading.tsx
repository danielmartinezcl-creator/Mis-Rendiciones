export default function Loading() {
  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 bg-ink-100 rounded-item w-44" />
        <div className="h-3 bg-ink-100 rounded w-72" />
      </div>
      <div className="bg-white rounded-card p-5 shadow-card border-t-4 border-t-brand-600 space-y-4">
        <div className="h-10 bg-ink-100 rounded-item w-1/3" />
        <div className="h-28 bg-ink-100 rounded-item" />
        <div className="h-10 w-40 bg-ink-100 rounded-item" />
      </div>
      {[0, 1, 2].map(i => (
        <div key={i} className="bg-white rounded-card p-4 shadow-card space-y-2">
          <div className="flex justify-between items-center">
            <div className="h-3 bg-ink-100 rounded w-40" />
            <div className="h-5 w-16 bg-ink-100 rounded-full" />
          </div>
          <div className="h-12 bg-ink-100 rounded" />
        </div>
      ))}
    </div>
  )
}
