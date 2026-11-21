import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';

export default async function AuditDetailPage({ params }: { params: { id: string } }) {
  const db = await createClient();
  const { data: log } = await db
    .from('audit_logs')
    .select('*')
    .eq('id', parseInt(params.id, 10))
    .single();

  if (!log) notFound();

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-bold font-mono">{log.action}</h1>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="border rounded p-3">
          <p className="text-muted-foreground text-xs">التاريخ</p>
          <p>{new Date(log.created_at).toLocaleString('ar')}</p>
        </div>
        <div className="border rounded p-3">
          <p className="text-muted-foreground text-xs">المنفّذ</p>
          <p>{log.actor_id ?? '—'} ({log.actor_role ?? '—'})</p>
        </div>
        <div className="border rounded p-3">
          <p className="text-muted-foreground text-xs">الكيان</p>
          <p>{log.entity_type ?? '—'} {log.entity_id ?? ''}</p>
        </div>
        <div className="border rounded p-3">
          <p className="text-muted-foreground text-xs">IP</p>
          <p>{log.ip ?? '—'}</p>
        </div>
      </div>
      {log.reason && (
        <div className="border rounded p-3">
          <p className="text-xs text-muted-foreground mb-1">السبب</p>
          <p>{log.reason}</p>
        </div>
      )}
      {log.before_value && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">قبل</p>
          <pre className="bg-muted p-3 rounded text-xs overflow-auto" dir="ltr">
            {JSON.stringify(log.before_value, null, 2)}
          </pre>
        </div>
      )}
      {log.after_value && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">بعد</p>
          <pre className="bg-muted p-3 rounded text-xs overflow-auto" dir="ltr">
            {JSON.stringify(log.after_value, null, 2)}
          </pre>
        </div>
      )}
    </main>
  );
}