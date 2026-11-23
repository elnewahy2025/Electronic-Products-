'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function HeroRedeemBar() {
  const router = useRouter();
  const [code, setCode] = useState('');

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = code.trim().toUpperCase();
    if (!cleaned) {
      router.push('/redeem');
      return;
    }
    router.push(`/redeem?code=${encodeURIComponent(cleaned)}`);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="inline-flex items-center justify-between sm:justify-start gap-2 rounded-lg border border-dashed border-[#6fb09d] bg-white/10 px-2.5 py-1.5 text-xs text-[#e8f5f0]"
    >
      <span className="whitespace-nowrap">كود شراء؟</span>
      <input
        type="text"
        value={code}
        onChange={e => setCode(e.target.value)}
        placeholder="XXXX-XXXX"
        maxLength={24}
        dir="ltr"
        aria-label="كود الشراء"
        className="w-28 sm:w-32 bg-black/20 rounded border border-[#6fb09d]/60 px-2 py-1 text-left font-mono text-xs tracking-wider text-white placeholder:text-[#7fb4a4] focus:outline-none focus:border-white"
      />
      <button
        type="submit"
        className="rounded-md bg-[#e8a317] text-[#201400] px-3 py-1 text-xs font-bold hover:brightness-95 active:scale-[0.98] transition shrink-0"
      >
        فعّل
      </button>
    </form>
  );
}
