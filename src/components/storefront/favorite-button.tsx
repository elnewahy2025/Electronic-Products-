'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

type Props = {
  productId: string;
  initialFavorited: boolean;
  isAuthenticated: boolean;
  className?: string;
};

export function FavoriteButton({
  productId,
  initialFavorited,
  isAuthenticated,
  className,
}: Props) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(initialFavorited);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!isAuthenticated) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (busy) return;
    setBusy(true);
    const next = !favorited;
    setFavorited(next);

    try {
      const res = next
        ? await fetch('/api/favorites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_id: productId }),
          })
        : await fetch(`/api/favorites?product_id=${encodeURIComponent(productId)}`, {
            method: 'DELETE',
          });

      if (!res.ok) {
        setFavorited(!next);
      } else {
        router.refresh();
      }
    } catch {
      setFavorited(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={favorited}
      aria-label={favorited ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition active:scale-[0.98] disabled:opacity-50',
        favorited
          ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400'
          : 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/60',
        className,
      )}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill={favorited ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      </svg>
      <span>{favorited ? 'في المفضلة' : 'حفظ في المفضلة'}</span>
    </button>
  );
}
