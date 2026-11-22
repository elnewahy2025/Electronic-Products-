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
      className="inline-flex flex-wrap items-center gap-2.5 mt-5 rounded-[10px] border border-dashed border-[#6fb09d] bg-white/10 px-3.5 py-2 text-sm text-[#e8f5f0]"
    >
      <span>لديك كود شراء؟</span>
      <input
        type="text"
        value={code}
        onChange={e => setCode(e.target.value)}
        placeholder="XXXX-XXXX"
        maxLength={24}
        dir="ltr"
        aria-label="كود الشراء"
        className="w-36 bg-transparent border-0 border-b border-[#6fb09d] px-1 py-0.5 text-left font-mono tracking-wider text-white placeholder:text-[#7fb4a4] focus:outline-none focus:border-white"
      />
      <button
        type="submit"
        className="rounded-[7px] bg-[#e8a317] text-[#201400] px-3.5 py-1.5 text-xs font-bold hover:brightness-95 active:scale-[0.98] transition"
      >
        فعّل
      </button>
    </form>
  );
}
