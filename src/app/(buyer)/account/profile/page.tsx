import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { ProfileForm } from './profile-form';

export default async function ProfilePage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) notFound();

  const { data: profile } = await db
    .from('profiles')
    .select('full_name, phone, avatar_url, email, account_type, mfa_enabled, created_at')
    .eq('id', user.id)
    .single();

  if (!profile) notFound();

  return (
    <main className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">الملف الشخصي</h1>
        <p className="text-sm text-muted-foreground mt-1">
          عضو منذ {new Date(profile.created_at).toLocaleDateString('ar')}
        </p>
      </div>

      <div className="border rounded p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">البريد الإلكتروني</span>
          <span dir="ltr">{profile.email}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">نوع الحساب</span>
          <span>
            {profile.account_type === 'buyer' ? 'مشترٍ' : profile.account_type}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">المصادقة الثنائية (2FA)</span>
          <span className={profile.mfa_enabled ? 'text-green-600' : 'text-muted-foreground'}>
            {profile.mfa_enabled ? 'مفعّلة' : 'غير مفعّلة'}
          </span>
        </div>
        {!profile.mfa_enabled && (
          <p className="text-xs text-muted-foreground pt-2 border-t">
            ننصح بتفعيل 2FA لحماية حسابك.{' '}
            <a href="/verify-mfa" className="text-primary">تفعيل الآن →</a>
          </p>
        )}
      </div>

      <ProfileForm
        initialFullName={profile.full_name ?? ''}
        initialPhone={profile.phone ?? ''}
        initialAvatarUrl={profile.avatar_url ?? ''}
      />
    </main>
  );
}
