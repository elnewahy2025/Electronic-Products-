type Status = string;

const MAP: Record<string, { label: string; cls: string }> = {
  // purchase requests
  created: { label: 'منشأ', cls: 'bg-gray-100 text-gray-800' },
  pending: { label: 'قيد المراجعة', cls: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'معتمد', cls: 'bg-blue-100 text-blue-800' },
  rejected: { label: 'مرفوض', cls: 'bg-red-100 text-red-800' },
  cancelled: { label: 'ملغى', cls: 'bg-gray-100 text-gray-800' },
  completed: { label: 'مكتمل', cls: 'bg-green-100 text-green-800' },

  // codes
  issued: { label: 'قيد التسليم', cls: 'bg-yellow-100 text-yellow-800' },
  delivered: { label: 'جاهز للتفعيل', cls: 'bg-blue-100 text-blue-800' },
  redeemed: { label: 'مُفعّل', cls: 'bg-green-100 text-green-800' },
  expired: { label: 'منتهي', cls: 'bg-gray-100 text-gray-800' },
  revoked: { label: 'ملغى', cls: 'bg-red-100 text-red-800' },

  // sessions
  active: { label: 'نشطة', cls: 'bg-green-100 text-green-800' },
  expired_partial: { label: 'منتهية جزئيًا', cls: 'bg-orange-100 text-orange-800' },
  exhausted: { label: 'استنفدت المحاولات', cls: 'bg-red-100 text-red-800' },
  compensation_active: { label: 'جلسة تعويضية', cls: 'bg-blue-100 text-blue-800' },
  compensation_pending: { label: 'تعويض قيد المراجعة', cls: 'bg-purple-100 text-purple-800' },

  // compensation
  fulfilled: { label: 'مُنفّذ', cls: 'bg-green-100 text-green-800' },
};

export function StatusBadge({ status }: { status: Status }) {
  const m = MAP[status];
  const label = m?.label ?? status;
  const cls = m?.cls ?? 'bg-gray-100 text-gray-800';
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded ${cls}`}>
      {label}
    </span>
  );
}
