'use client';

import { useEffect, useState } from 'react';

export function Countdown({ to, expiredLabel = 'انتهت' }: { to: string; expiredLabel?: string }) {
  const [remaining, setRemaining] = useState<number>(() =>
    new Date(to).getTime() - Date.now()
  );

  useEffect(() => {
    const t = setInterval(() => {
      setRemaining(new Date(to).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(t);
  }, [to]);

  if (remaining <= 0) {
    return <span className="text-red-600 text-xs">{expiredLabel}</span>;
  }

  const totalSec = Math.floor(remaining / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  const isUrgent = remaining < 30 * 60 * 1000;
  return (
    <span className={`text-xs font-mono ${isUrgent ? 'text-red-600' : 'text-muted-foreground'}`} dir="ltr">
      {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  );
}
