export default function Loading() {
  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-pulse">
      <div className="h-3 esqueleto rounded w-40" />
      <div className="space-y-2">
        <div className="h-7 esqueleto rounded w-2/3" />
        <div className="h-4 esqueleto rounded w-1/2" />
      </div>
      <div className="bg-white rounded-card p-4 flex justify-between items-center shadow-card">
        <div className="h-4 esqueleto rounded w-28" />
        <div className="h-6 esqueleto rounded w-24" />
      </div>
      {[0, 1, 2].map(i => (
        <div key={i} className="bg-white rounded-card p-4 space-y-3 shadow-card">
          <div className="flex justify-between">
            <div className="h-5 esqueleto rounded w-2/3" />
            <div className="h-5 esqueleto rounded w-20" />
          </div>
          <div className="flex gap-2">
            <div className="h-3 esqueleto rounded w-20" />
            <div className="h-3 esqueleto rounded w-16" />
          </div>
          <div className="h-24 esqueleto rounded-item" />
        </div>
      ))}
    </div>
  )
}
