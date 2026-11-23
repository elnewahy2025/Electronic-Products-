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
    <main className="p-6 md:p-8 space-y-6">
      <nav aria-label="breadcrumb" className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link href="/admin" className="hover:text-foreground transition-colors">
          لوحة الإدارة
        </Link>
        <span className="opacity-40">/</span>
        <Link href="/admin/staff" className="text-primary hover:underline transition-colors">
          الموظفون
        </Link>
        <span className="opacity-40">/</span>
        <span className="text-foreground font-medium truncate max-w-[260px]" dir="ltr">
          {detail.email}
        </span>
      </nav>

      <StaffEditor detail={detail} roles={roles} canEdit={canEdit} />
    </main>
  );
}
