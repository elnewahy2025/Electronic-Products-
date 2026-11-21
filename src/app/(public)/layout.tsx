import { SiteHeader } from '@/components/storefront/site-header';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <div className="min-h-[calc(100vh-64px)]">{children}</div>
      <footer className="border-t mt-12 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {process.env.NEXT_PUBLIC_APP_NAME ?? 'المنصة'}
      </footer>
    </>
  );
}