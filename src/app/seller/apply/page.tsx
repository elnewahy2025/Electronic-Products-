import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { SiteHeader } from '@/components/storefront/site-header';
import { SellerApplyForm } from './apply-form';

export default async function SellerApplyPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/seller/apply');
  if (user.accountType === 'staff') redirect('/admin');

  const db = await createClient();
  const [{ data: seller }, { data: profile }] = await Promise.all([
    db
      .from('seller_profiles')
      .select('status')
      .eq('profile_id', user.id)
      .maybeSingle(),
    db
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle(),
  ]);

  if (seller?.status === 'approved') redirect('/seller');
  if (seller) redirect('/seller/pending');

  const defaultDisplayName = profile?.full_name?.trim() || user.email.split('@')[0] || '';

  return (
    <div>
      <SiteHeader />
      <main className="container max-w-lg py-16">
        <div className="ui-box p-8 space-y-6">
          <div className="text-center space-y-1.5">
            <h1 className="text-2xl font-bold text-foreground">التقديم كبائع</h1>
            <p className="text-sm text-muted-foreground">
              أكمل بيانات متجرك لإرسال طلب الاعتماد إلى فريق الإدارة.
            </p>
          </div>

          <SellerApplyForm defaultDisplayName={defaultDisplayName} />

          <div className="text-center pt-1">
            <Link href="/account" className="text-xs text-muted-foreground hover:text-foreground">
              العودة إلى حسابي
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
