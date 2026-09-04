export default function Loading() {
  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 esqueleto rounded-item w-44" />
        <div className="h-3 esqueleto rounded w-72" />
      </div>
      <div className="hoja p-5 border-t-4 border-t-brand-600 space-y-4">
        <div className="h-10 esqueleto rounded-item w-1/3" />
        <div className="h-28 esqueleto rounded-item" />
        <div className="h-10 w-40 esqueleto rounded-item" />
      </div>
      {[0, 1, 2].map(i => (
        <div key={i} className="hoja p-4 space-y-2">
          <div className="flex justify-between items-center">
            <div className="h-3 esqueleto rounded w-40" />
            <div className="h-5 w-16 esqueleto rounded-full" />
          </div>
          <div className="h-12 esqueleto rounded" />
        </div>
      ))}
    </div>
  )
}
