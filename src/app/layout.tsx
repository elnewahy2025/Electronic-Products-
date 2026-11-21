import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Noto_Kufi_Arabic } from 'next/font/google';
import './globals.css';

const arabic = Noto_Kufi_Arabic({
  subsets: ['arabic'],
  variable: '--font-arabic',
  display: 'swap',
});

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME ?? 'المنصة',
  description: 'منصة بيع المنتجات الرقمية',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f172a',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const nonce = headersList.get('x-nonce') ?? undefined;

  // The nonce is consumed by any <Script nonce={nonce}> rendered below,
  // and by Next.js framework scripts automatically (14+).
  // Keep it available via data attribute for debugging.
  return (
    <html lang="ar" dir="rtl" className={arabic.variable}>
      <body
        className="min-h-screen bg-background text-foreground antialiased"
        data-nonce-ready={nonce ? '1' : '0'}
      >
        {children}
      </body>
    </html>
  );
}
