export default function ProductLoading() {
  return (
    <main className="container max-w-4xl py-8 space-y-8">
      <div className="h-4 w-64 bg-muted animate-pulse rounded" />
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          <div className="h-10 w-3/4 bg-muted animate-pulse rounded" />
          <div className="h-5 w-1/3 bg-muted animate-pulse rounded" />
          <div className="aspect-video bg-muted animate-pulse rounded-lg" />
          <div className="space-y-2">
            <div className="h-4 bg-muted animate-pulse rounded" />
            <div className="h-4 bg-muted animate-pulse rounded w-5/6" />
            <div className="h-4 bg-muted animate-pulse rounded w-4/6" />
          </div>
        </div>
        <aside className="space-y-4">
          <div className="border rounded-lg p-4 space-y-3">
            <div className="h-8 bg-muted animate-pulse rounded w-1/2" />
            <div className="h-12 bg-muted animate-pulse rounded" />
          </div>
        </aside>
      </div>
    </main>
  );
}
