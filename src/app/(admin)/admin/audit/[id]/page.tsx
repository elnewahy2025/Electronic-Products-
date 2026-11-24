import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';

const ACTOR_ROLE_LABEL: Record<string, string> = {
  super_admin: 'مدير عام',
  admin: 'أدمن',
  staff: 'موظف',
  system: 'النظام',
};

export default async function AuditDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const db = await createClient();
  const { data: log } = await db
    .from('audit_logs')
    .select('*')
    .eq('id', parseInt(params.id, 10))
    .single();

  if (!log) notFound();

  return (
    <main className="p-6 md:p-8 space-y-6">
      <header className="pb-5 border-b border-border">
        <p className="text-xs font-medium text-primary mb-1">الحوكمة والشفافية</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          تفاصيل حدث التدقيق
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          الحدث: <span className="ui-num font-medium text-foreground" dir="ltr">{log.action}</span>
          {' — '}السجل <span className="ui-num font-medium text-foreground">#{log.id}</span>
        </p>
        <Link
          href="/admin/audit"
          className="mt-3 inline-flex items-center text-xs font-medium text-primary hover:underline"
        >
          العودة إلى سجل التدقيق
        </Link>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="ui-box">
          <p className="text-xs text-muted-foreground">التاريخ</p>
          <p className="mt-1.5 text-sm font-medium text-foreground ui-num">
            {new Date(log.created_at).toLocaleString('ar')}
          </p>
        </div>
        <div className="ui-box">
          <p className="text-xs text-muted-foreground">المنفّذ</p>
          <p className="mt-1.5 text-sm font-medium text-foreground">
            <span className="ui-num" dir="ltr">{log.actor_id ?? '—'}</span>
            <span className="text-xs text-muted-foreground">
              {' '}({ACTOR_ROLE_LABEL[log.actor_role ?? ''] ?? log.actor_role ?? '—'})
            </span>
          </p>
        </div>
        <div className="ui-box">
          <p className="text-xs text-muted-foreground">الكيان</p>
          <p className="mt-1.5 text-sm font-medium text-foreground">
            <span className="ui-num" dir="ltr">{log.entity_type ?? '—'}</span>
            {log.entity_id && (
              <span className="ui-num text-xs text-muted-foreground"> ({String(log.entity_id).slice(0, 8)})</span>
            )}
          </p>
        </div>
        <div className="ui-box">
          <p className="text-xs text-muted-foreground">IP</p>
          <p className="mt-1.5 text-sm font-medium text-foreground ui-num" dir="ltr">
            {String(log.ip ?? '—')}
          </p>
        </div>
      </section>

      {log.reason && (
        <section className="ui-box">
          <p className="text-xs font-medium text-muted-foreground mb-1">السبب</p>
          <p className="text-sm text-foreground">{log.reason}</p>
        </section>
      )}

      {log.before_value && (
        <section className="ui-box">
          <p className="text-xs font-medium text-muted-foreground mb-2">قبل</p>
          <pre className="ui-num overflow-auto rounded-xl border border-border bg-muted/60 p-3 text-xs" dir="ltr">
            {JSON.stringify(log.before_value, null, 2)}
          </pre>
        </section>
      )}

      {log.after_value && (
        <section className="ui-box">
          <p className="text-xs font-medium text-muted-foreground mb-2">بعد</p>
          <pre className="ui-num overflow-auto rounded-xl border border-border bg-muted/60 p-3 text-xs" dir="ltr">
            {JSON.stringify(log.after_value, null, 2)}
          </pre>
        </section>
      )}
    </main>
  );
}
