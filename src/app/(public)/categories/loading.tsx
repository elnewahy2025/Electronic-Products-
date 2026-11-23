export default function CategoriesLoading() {
  return (
    <>
      <section className="bg-brand text-brand-foreground relative overflow-hidden border-b border-white/10">
        <div className="container relative py-6 sm:py-8 space-y-3">
          <div className="h-3 w-24 rounded bg-white/15 animate-pulse" />
          <div className="h-7 w-48 rounded bg-white/15 animate-pulse" />
          <div className="h-3 w-full max-w-xl rounded bg-white/10 animate-pulse" />
          <div className="h-10 w-full sm:w-64 rounded-lg bg-card/20 animate-pulse" />
        </div>
      </section>

      <main className="container py-6 sm:py-8 pb-14 space-y-6">
        <div className="h-6 w-52 rounded bg-muted animate-pulse" />
        <div className="h-3 w-72 rounded bg-muted animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-[14px] border border-border bg-card overflow-hidden">
              <div className="aspect-[16/8] bg-muted animate-pulse" />
              <div className="p-4 space-y-3">
                <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
