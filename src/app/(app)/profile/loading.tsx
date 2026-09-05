export default function Loading() {
  return (
    <div className="max-w-xl space-y-5 animate-pulse">
      <div className="h-8 esqueleto rounded-item w-36" />
      <div className="hoja p-5 space-y-4">
        <div className="h-5 esqueleto rounded w-40" />
        <div className="grid grid-cols-2 gap-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 esqueleto rounded w-24" />
              <div className="h-10 esqueleto rounded-item" />
            </div>
          ))}
        </div>
        <div className="h-9 w-32 esqueleto rounded-item" />
      </div>
      <div className="hoja p-5 space-y-4">
        <div className="h-5 esqueleto rounded w-44" />
        <div className="grid grid-cols-2 gap-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 esqueleto rounded w-24" />
              <div className="h-10 esqueleto rounded-item" />
            </div>
          ))}
        </div>
        <div className="h-9 w-32 esqueleto rounded-item" />
      </div>
    </div>
  )
}
