'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';

type Props = {
  className?: string;
  variant?: 'sidebar' | 'header';
  redirectTo?: string;
};

export function LogoutButton({
  className,
  variant = 'sidebar',
  redirectTo = '/login',
}: Props) {
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    if (busy) return;
    setBusy(true);
    try {
      await Promise.allSettled([
        fetch('/api/auth/signout', { method: 'POST' }),
        createClient().auth.signOut(),
      ]);
    } finally {
      // Full page navigation clears all in-memory client state and avoids stale RSC/webpack chunk swaps across route groups
      window.location.assign(redirectTo);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={busy}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition active:scale-[0.98] disabled:opacity-50',
        variant === 'sidebar'
          ? 'w-full px-3 py-2 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40'
          : 'px-2.5 py-1.5 text-xs text-muted-foreground hover:text-destructive hover:bg-muted/60',
        className,
      )}
      aria-label="تسجيل الخروج"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      <span>{busy ? 'جارٍ الخروج...' : 'تسجيل الخروج'}</span>
    </button>
  );
}
