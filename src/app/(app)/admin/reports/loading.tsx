export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex justify-between items-center">
        <div className="h-8 esqueleto rounded-item w-40" />
        <div className="flex gap-2">
          <div className="h-10 w-24 esqueleto rounded-item" />
          <div className="h-10 w-20 esqueleto rounded-item" />
        </div>
      </div>
      <div className="h-32 esqueleto rounded-card" />
      <div className="hoja p-4 space-y-3">
        <div className="h-4 esqueleto rounded w-20" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-10 esqueleto rounded-item" />
          <div className="h-10 esqueleto rounded-item" />
        </div>
        <div className="flex gap-2">
          {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-7 w-24 esqueleto rounded-full" />)}
        </div>
      </div>
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="hoja p-4 flex justify-between items-center gap-3">
          <div className="space-y-2 flex-1">
            <div className="h-4 esqueleto rounded w-1/2" />
            <div className="h-3 esqueleto rounded w-1/3" />
          </div>
          <div className="h-6 w-20 esqueleto rounded-full" />
          <div className="h-6 w-24 esqueleto rounded" />
        </div>
      ))}
    </div>
  )
}
