import { SiteHeader } from '@/components/storefront/site-header';

export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  return (
    // A static wrapper keeps Next's scroll/focus handler off the sticky header.
    <div>
      <SiteHeader />
      <div className="min-h-[calc(100vh-64px)]">{children}</div>
    </div>
  );
}
