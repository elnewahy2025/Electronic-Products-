export function MarkAllReadButton() {
  return (
    <form action={markAllReadAction}>
      <button type="submit" className="text-sm border rounded px-3 py-1.5 hover:bg-muted">
        تعليم الكل كمقروء
      </button>
    </form>
  );
}

async function markAllReadAction() {
  'use server';
  const { markAllMyNotificationsRead } = await import('@/lib/server/services/notification-service');
  await markAllMyNotificationsRead();
  const { revalidatePath } = await import('next/cache');
  revalidatePath('/notifications');
  revalidatePath('/');
}
