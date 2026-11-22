'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info';

type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  push: (message: string, variant?: ToastVariant) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts(prev => [...prev.slice(-3), { id, message, variant }]);
      window.setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 4200);
    },
    [],
  );

  const value: ToastContextValue = {
    push,
    success: (m) => push(m, 'success'),
    error: (m) => push(m, 'error'),
    info: (m) => push(m, 'info'),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] pointer-events-none"
        >
          {toasts.map(t => (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm shadow-lg backdrop-blur transition-all ${
                t.variant === 'success'
                  ? 'border-emerald-500/40 bg-card text-foreground'
                  : t.variant === 'error'
                    ? 'border-destructive/40 bg-card text-foreground'
                    : 'border-primary/35 bg-card text-foreground'
              }`}
            >
              {t.variant === 'success' && (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              )}
              {t.variant === 'error' && (
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              )}
              {t.variant === 'info' && (
                <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              )}
              <span className="flex-1 text-xs leading-relaxed">{t.message}</span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="text-muted-foreground hover:text-foreground shrink-0"
                aria-label="إغلاق الإشعار"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      push: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
    };
  }
  return ctx;
}
