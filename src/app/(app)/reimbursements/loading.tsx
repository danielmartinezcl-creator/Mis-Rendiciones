export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="space-y-1">
        <div className="h-8 esqueleto rounded-item w-52" />
        <div className="h-3 esqueleto rounded w-64" />
      </div>
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="bg-white rounded-card p-4 shadow-card space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2 flex-1">
              <div className="h-4 esqueleto rounded w-48" />
              <div className="h-3 esqueleto rounded w-32" />
            </div>
            <div className="h-6 w-24 esqueleto rounded-full" />
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-ink-100">
            <div className="h-5 esqueleto rounded w-28" />
            <div className="h-9 w-36 esqueleto rounded-item" />
          </div>
        </div>
      ))}
    </div>
  )
}
