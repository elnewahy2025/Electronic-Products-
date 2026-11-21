import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStaffDetail, listRoles } from '@/lib/server/services/staff-service';
import { getCurrentUser } from '@/lib/auth/session';
import { StaffEditor } from './staff-editor';

export default async function StaffDetailPage({ params }: { params: { id: string } }) {
  const [me, detail, roles] = await Promise.all([
    getCurrentUser(),
    getStaffDetail(params.id),
    listRoles(),
  ]);

  if (!detail) notFound();

  const canEdit = me?.role === 'super_admin';

  return (
    <main className="p-6 space-y-6 max-w-5xl">
      <nav className="text-sm text-muted-foreground">
        <Link href="/admin/staff" className="hover:underline">الموظفون</Link>
        {' / '}
        <span>{detail.email}</span>
      </nav>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {detail.full_name || detail.email}
            {detail.is_self && (
              <span className="text-sm font-normal text-muted-foreground mr-2">(أنت)</span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1" dir="ltr">{detail.email}</p>
          <div className="flex gap-3 mt-2 text-xs">
            <span className={`px-2 py-0.5 rounded ${
              detail.status === 'active' ? 'bg-green-100 text-green-800'
              : detail.status === 'suspended' ? 'bg-red-100 text-red-800'
              : 'bg-gray-100 text-gray-800'
            }`}>
              {detail.status === 'active' ? 'نشط' : detail.status === 'suspended' ? 'موقوف' : 'محذوف'}
            </span>
            {detail.member_status && detail.member_status !== 'active' && (
              <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-800">
                عضوية: {detail.member_status}
              </span>
            )}
            {detail.granted_at && (
              <span className="text-muted-foreground">
                عضو منذ {new Date(detail.granted_at).toLocaleDateString('ar')}
              </span>
            )}
          </div>
        </div>
      </div>

      <StaffEditor
        detail={detail}
        roles={roles}
        canEdit={canEdit}
      />
    </main>
  );
}