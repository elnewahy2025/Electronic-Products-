import Link from 'next/link';

export function Pagination({
  currentPage,
  totalPages,
  basePath,
  query,
}: {
  currentPage: number;
  totalPages: number;
  basePath: string;
  query: Record<string, string | undefined>;
}) {
  function url(page: number) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v) qs.set(k, v);
    qs.set('page', String(page));
    return `${basePath}?${qs.toString()}`;
  }

  const pages = buildPageRange(currentPage, totalPages);

  return (
    <div className="flex items-center justify-center gap-1 text-sm">
      {currentPage > 1 && (
        <Link href={url(currentPage - 1)} className="border rounded px-3 py-1 hover:bg-muted">
          السابق
        </Link>
      )}
      {pages.map((p, i) => (
        p === '...' ? (
          <span key={`dots-${i}`} className="px-2 text-muted-foreground">…</span>
        ) : (
          <Link
            key={p}
            href={url(p as number)}
            className={`border rounded px-3 py-1 hover:bg-muted ${
              p === currentPage ? 'bg-primary text-primary-foreground hover:bg-primary' : ''
            }`}
          >
            {p}
          </Link>
        )
      ))}
      {currentPage < totalPages && (
        <Link href={url(currentPage + 1)} className="border rounded px-3 py-1 hover:bg-muted">
          التالي
        </Link>
      )}
    </div>
  );
}

function buildPageRange(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [1];
  if (current > 3) pages.push('...');
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}