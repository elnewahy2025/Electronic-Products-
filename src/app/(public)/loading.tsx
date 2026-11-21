export default function PublicLoading() {
  return (
    <div className="container py-8 space-y-8">
      <div className="h-8 w-64 bg-muted animate-pulse rounded" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="border rounded-lg overflow-hidden">
            <div className="aspect-video bg-muted animate-pulse" />
            <div className="p-3 space-y-2">
              <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
              <div className="h-3 bg-muted animate-pulse rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
