import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { IBM_Plex_Sans_Arabic } from 'next/font/google';
import { ThemeProvider } from '@/components/shared/theme-provider';
import { ToastProvider } from '@/components/shared/toast-provider';
import { PwaRegister } from '@/components/shared/pwa-register';
import { THEME_INIT_SCRIPT } from '@/lib/theme-init';
import './globals.css';

const arabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
  display: 'swap',
});

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'المنصة';

export const metadata: Metadata = {
  title: APP_NAME,
  description: 'منصة بيع المنتجات الرقمية',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    // Next defaults this to the deprecated apple-mobile-web-app-capable meta.
    // The standards-based mobile-web-app-capable meta below replaces it.
    capable: false,
    statusBarStyle: 'default',
    title: APP_NAME,
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0d3b32' },
    { media: '(prefers-color-scheme: dark)', color: '#0c1219' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const nonce = headersList.get('x-nonce') ?? undefined;

  return (
    <html lang="ar" dir="rtl" className={arabic.variable} suppressHydrationWarning>
      <head>
        {/* Allowed by the exact CSP hash in middleware. A nonce prop would be
            hidden by the browser after parsing and cause a hydration warning. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body
        className="min-h-[100dvh] bg-background text-foreground antialiased"
        data-nonce-ready={nonce ? '1' : '0'}
      >
        <ThemeProvider>
          <ToastProvider>
            {children}
            <PwaRegister />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
