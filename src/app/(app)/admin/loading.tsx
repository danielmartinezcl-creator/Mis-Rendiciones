export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-32 esqueleto rounded-card" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-card p-5 shadow-card space-y-3">
            <div className="h-4 esqueleto rounded w-1/2" />
            <div className="h-8 esqueleto rounded w-2/3" />
            <div className="h-3 esqueleto rounded w-1/3" />
          </div>
        ))}
      </div>
    </div>
  )
}
