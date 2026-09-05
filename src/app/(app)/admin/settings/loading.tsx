export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 esqueleto rounded-item w-36" />
      <div className="flex gap-2">
        {[0, 1, 2].map(i => <div key={i} className="h-9 w-28 esqueleto rounded-item" />)}
      </div>
      <div className="hoja p-5 space-y-4">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-ink-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 esqueleto rounded-full" />
              <div className="h-4 esqueleto rounded w-32" />
            </div>
            <div className="h-6 w-16 esqueleto rounded-item" />
          </div>
        ))}
      </div>
    </div>
  )
}
