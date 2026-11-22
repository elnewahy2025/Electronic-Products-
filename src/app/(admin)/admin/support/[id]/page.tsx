import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TicketReplyForm } from '@/app/support/[id]/reply-form';

export default async function AdminSupportDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const db = await createClient();
  const [{ data: ticket }, { data: messages }] = await Promise.all([
    db.from('support_tickets')
      .select('id, owner_id, subject, status, created_at, updated_at, profiles!support_tickets_owner_id_fkey(email, full_name, account_type)')
      .eq('id', params.id)
      .maybeSingle(),
    db.from('support_messages')
      .select('id, sender_id, body, is_internal, created_at, profiles!support_messages_sender_id_fkey(email, full_name, account_type)')
      .eq('ticket_id', params.id)
      .order('created_at', { ascending: true }),
  ]);

  if (!ticket) notFound();

  const owner = (ticket as any).profiles;

  return (
    <main className="p-6 max-w-4xl space-y-6">
      <div className="border-b border-border pb-4 space-y-1">
        <Link href="/admin/support" className="text-xs text-primary hover:underline">
          ← العودة لقائمة التذاكر
        </Link>
        <h1 className="text-xl font-bold text-foreground">{ticket.subject}</h1>
        <p className="text-xs text-muted-foreground">
          صاحب التذكرة: <b className="text-foreground">{owner?.full_name ?? '—'}</b> (
          <span className="font-mono" dir="ltr">{owner?.email ?? '—'}</span>) —{' '}
          {new Date(ticket.created_at).toLocaleString('ar')}
        </p>
      </div>

      <div className="space-y-3">
        {(messages ?? []).map((m: any) => {
          const isStaff = m.profiles?.account_type === 'staff';
          return (
            <div
              key={m.id}
              className={`rounded-2xl border p-4 space-y-1.5 ${
                m.is_internal
                  ? 'border-amber-300 bg-amber-50/70 dark:bg-amber-950/30 dark:border-amber-800'
                  : isStaff
                    ? 'border-primary/30 bg-accent/40'
                    : 'border-border bg-card'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {m.profiles?.full_name ?? m.profiles?.email ?? 'مستخدم'}
                  </span>
                  {m.is_internal && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-200/70 text-amber-900 dark:bg-amber-900 dark:text-amber-200 text-[11px]">
                      ملاحظة داخلية
                    </span>
                  )}
                </div>
                <span>{new Date(m.created_at).toLocaleString('ar')}</span>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                {m.body}
              </p>
            </div>
          );
        })}
      </div>

      <TicketReplyForm
        ticketId={ticket.id}
        allowInternal={true}
        canChangeStatus={true}
        currentStatus={ticket.status as 'open' | 'pending' | 'closed'}
      />
    </main>
  );
}
