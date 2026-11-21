import { SiteHeader } from '@/components/storefront/site-header';

export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <div className="min-h-[calc(100vh-64px)]">{children}</div>
    </>
  );
}
