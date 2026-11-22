'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaRegister() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Ignore registration errors in unsupported contexts
      });
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  if (!installEvent || dismissed) return null;

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === 'accepted') {
      setInstallEvent(null);
    } else {
      setDismissed(true);
    }
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 shadow-lg text-sm">
      <span className="text-foreground font-medium">تثبيت التطبيق على جهازك</span>
      <button
        type="button"
        onClick={install}
        className="rounded-lg bg-primary text-primary-foreground px-3 py-1 text-xs font-medium hover:bg-primary/90 active:scale-[0.98] transition"
      >
        تثبيت
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="إغلاق"
        className="text-xs text-muted-foreground hover:text-foreground px-1"
      >
        ×
      </button>
    </div>
  );
}
