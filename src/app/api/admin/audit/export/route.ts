import { publicError } from '@/lib/api/errors';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requirePerm } from '@/lib/auth/admin-guard';

export async function GET() {
  try {
    await requirePerm('audit.export');
    const db = await createClient();
    const { data } = await db
      .from('audit_logs')
      .select('id, actor_id, actor_role, action, entity_type, entity_id, reason, ip, created_at')
      .order('created_at', { ascending: false })
      .limit(10000);

    const headers = ['id', 'created_at', 'action', 'actor_id', 'actor_role', 'entity_type', 'entity_id', 'reason', 'ip'];
    const rows = (data ?? []).map(r => headers.map(h => csvEscape(String((r as any)[h] ?? ''))).join(','));
    const csv = [headers.join(','), ...rows].join('\n');

    return new NextResponse(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e) }, { status: 403 });
  }
}

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}