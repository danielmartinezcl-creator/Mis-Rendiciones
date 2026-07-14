export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex justify-between items-center">
        <div className="h-8 bg-ink-100 rounded-item w-40" />
        <div className="flex gap-2">
          <div className="h-10 w-24 bg-ink-100 rounded-item" />
          <div className="h-10 w-20 bg-ink-100 rounded-item" />
        </div>
      </div>
      <div className="h-32 bg-ink-100 rounded-card" />
      <div className="bg-white rounded-card p-4 shadow-card space-y-3">
        <div className="h-4 bg-ink-100 rounded w-20" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-10 bg-ink-100 rounded-item" />
          <div className="h-10 bg-ink-100 rounded-item" />
        </div>
        <div className="flex gap-2">
          {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-7 w-24 bg-ink-100 rounded-full" />)}
        </div>
      </div>
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="bg-white rounded-card p-4 shadow-card flex justify-between items-center gap-3">
          <div className="space-y-2 flex-1">
            <div className="h-4 bg-ink-100 rounded w-1/2" />
            <div className="h-3 bg-ink-100 rounded w-1/3" />
          </div>
          <div className="h-6 w-20 bg-ink-100 rounded-full" />
          <div className="h-6 w-24 bg-ink-100 rounded" />
        </div>
      ))}
    </div>
  )
}
