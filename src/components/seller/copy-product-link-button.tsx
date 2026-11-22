'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useToast } from '@/components/shared/toast-provider';

export function CopyProductLinkButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  async function copy() {
    try {
      const url = `${window.location.origin}/products/${encodeURIComponent(slug)}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('تم نسخ رابط المنتج بنجاح.');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('تعذّر نسخ الرابط.');
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition"
      title="نسخ رابط المنتج"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      <span>{copied ? 'تم النسخ' : 'نسخ الرابط'}</span>
    </button>
  );
}
