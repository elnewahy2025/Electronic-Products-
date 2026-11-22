import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { TicketReplyForm } from './reply-form';

const STATUS_LABELS: Record<string, string> = {
  open: 'مفتوحة',
  pending: 'قيد المتابعة',
  closed: 'مغلقة',
};

export default async function SupportTicketDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/support/${params.id}`);

  const db = await createClient();
  const [{ data: ticket }, { data: messages }] = await Promise.all([
    db.from('support_tickets')
      .select('id, owner_id, subject, status, created_at, updated_at')
      .eq('id', params.id)
      .maybeSingle(),
    db.from('support_messages')
      .select('id, sender_id, body, is_internal, created_at, profiles!support_messages_sender_id_fkey(full_name, account_type)')
      .eq('ticket_id', params.id)
      .order('created_at', { ascending: true }),
  ]);

  if (!ticket) notFound();

  const visibleMessages = (messages ?? []).filter((m: any) => !m.is_internal);

  return (
    <main className="p-6 max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4 border-b border-border pb-4 flex-wrap">
        <div className="space-y-1">
          <Link href="/support" className="text-xs text-primary hover:underline">
            ← العودة لتذاكر الدعم
          </Link>
          <h1 className="text-xl font-bold text-foreground">{ticket.subject}</h1>
          <p className="text-xs text-muted-foreground">
            الحالة: <b>{STATUS_LABELS[ticket.status] ?? ticket.status}</b> — فُتحت في{' '}
            {new Date(ticket.created_at).toLocaleString('ar')}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {visibleMessages.map((m: any) => {
          const isMe = m.sender_id === user.id;
          const isStaff = m.profiles?.account_type === 'staff';
          return (
            <div
              key={m.id}
              className={`rounded-2xl border p-4 space-y-1.5 ${
                isStaff
                  ? 'border-primary/30 bg-accent/40'
                  : 'border-border bg-card'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {isStaff ? 'فريق الدعم الفني' : isMe ? 'أنت' : m.profiles?.full_name ?? 'مستخدم'}
                </span>
                <span>{new Date(m.created_at).toLocaleString('ar')}</span>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                {m.body}
              </p>
            </div>
          );
        })}
      </div>

      {ticket.status !== 'closed' ? (
        <TicketReplyForm ticketId={ticket.id} />
      ) : (
        <p className="text-xs text-muted-foreground rounded-xl border border-border bg-muted/40 p-4 text-center">
          هذه التذكرة مغلقة. يمكنك فتح تذكرة جديدة إذا احتجت لمساعدة إضافية.
        </p>
      )}
    </main>
  );
}
