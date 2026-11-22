const PRODUCT_STATUS_MAP: Record<string, { label: string; cls: string }> = {
  published: { label: 'منشور', cls: 'ui-badge ui-badge-green' },
  draft: { label: 'مسودة', cls: 'ui-badge ui-badge-amber' },
  paused: { label: 'متوقف مؤقتاً', cls: 'ui-badge ui-badge-neutral' },
  suspended: { label: 'معلّق', cls: 'ui-badge ui-badge-red' },
  deleted: { label: 'محذوف', cls: 'ui-badge ui-badge-neutral' },
};

export function ProductStatusBadge({ status }: { status: string }) {
  const info = PRODUCT_STATUS_MAP[status] ?? {
    label: status,
    cls: 'ui-badge ui-badge-neutral',
  };
  return <span className={info.cls}>{info.label}</span>;
}
