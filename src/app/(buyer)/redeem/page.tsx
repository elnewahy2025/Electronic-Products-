import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { RedeemForm } from './redeem-form';

export default async function RedeemPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login?next=/redeem');
  }

  return (
    <main className="container max-w-md py-16">
      <div className="text-center space-y-2 mb-8">
        <h1 className="text-2xl font-bold">تفعيل كود الشراء</h1>
        <p className="text-sm text-muted-foreground">
          أدخل الكود الذي وصلك بعد اعتماد طلبك لبدء التنزيل.
        </p>
        <p className="text-xs text-muted-foreground" dir="ltr">
          مسجّل الدخول: {user.email}
        </p>
      </div>

      <RedeemForm />
    </main>
  );
}