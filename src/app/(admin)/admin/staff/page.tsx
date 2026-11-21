import { createClient } from '@/lib/supabase/server';
import { StaffInvite } from './staff-invite';
import Link from 'next/link';

export default async function StaffPage() {
  const db = await createClient();
  const { data: members } = await db
    .from('store_members')
    .select('profile_id, status, granted_at, roles(code, name), profiles!inner(email, full_name)')
    .order('granted_at', { ascending: false });

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">الموظفون</h1>

      <StaffInvite />

      <section>
        <h2 className="font-semibold mb-2">الأعضاء الحاليون</h2>
        <div className="border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-right p-3">البريد</th>
                <th className="text-right p-3">الدور</th>
                <th className="text-right p-3">الحالة</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {(members ?? []).map((m: any) => (
                <tr key={m.profile_id} className="border-t">
                  <td className="p-3">{m.profiles.email}</td>
                  <td className="p-3 text-xs">{m.roles?.name}</td>
                  <td className="p-3 text-xs">
                    <span className={`px-2 py-0.5 rounded ${
                      m.status === 'active' ? 'bg-green-100 text-green-800'
                      : m.status === 'suspended' ? 'bg-orange-100 text-orange-800'
                      : 'bg-red-100 text-red-800'
                    }`}>
                      {m.status === 'active' ? 'نشط' : m.status === 'suspended' ? 'موقوف' : 'ملغى'}
                    </span>
                  </td>
                  <td className="p-3">
                    <Link href={`/admin/staff/${m.profile_id}`} className="text-primary text-xs">
                      إدارة
                    </Link>
                  </td>
                </tr>
              ))}
              {!members?.length && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">لا يوجد موظفون</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
