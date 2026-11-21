import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/auth/admin-guard';

export async function POST() {
  try {
    await requireSuperAdmin();
    const db = await createClient();
    const { data, error } = await db.rpc('trigger_manual_backup');
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, job_id: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }
}