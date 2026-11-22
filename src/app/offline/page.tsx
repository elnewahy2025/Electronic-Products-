'use client';

export default function OfflinePage() {
  return (
    <main className="min-h-[100dvh] flex items-center justify-center p-6 bg-background text-foreground">
      <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 text-center space-y-4 shadow-sm">
        <div className="w-12 h-12 mx-auto rounded-xl bg-accent text-accent-foreground flex items-center justify-center">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="2" x2="22" y1="2" y2="22" />
            <path d="M8.5 16.5a5 5 0 0 1 7 0" />
            <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
            <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
            <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
            <path d="M5 13a10 10 0 0 1 5.24-2.76" />
            <line x1="12" x2="12.01" y1="20" y2="20" />
          </svg>
        </div>
        <h1 className="text-xl font-bold">أنت غير متصل بالإنترنت</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          تحقق من اتصالك بالشبكة ثم أعد المحاولة للوصول إلى المتجر ولوحة التحكم.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:bg-primary/90 active:scale-[0.98] transition"
        >
          إعادة المحاولة
        </button>
      </div>
    </main>
  );
}
