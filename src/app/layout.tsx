import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { IBM_Plex_Sans_Arabic } from 'next/font/google';
import { ThemeProvider } from '@/components/shared/theme-provider';
import { PwaRegister } from '@/components/shared/pwa-register';
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
    capable: true,
    statusBarStyle: 'default',
    title: APP_NAME,
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

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('ep-theme');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const nonce = headersList.get('x-nonce') ?? undefined;

  return (
    <html lang="ar" dir="rtl" className={arabic.variable} suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body
        className="min-h-[100dvh] bg-background text-foreground antialiased"
        data-nonce-ready={nonce ? '1' : '0'}
      >
        <ThemeProvider>
          {children}
          <PwaRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
