import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * Lightweight health check for external uptime monitors (UptimeRobot / BetterStack).
 * Verifies Supabase PostgREST / PostgreSQL connectivity without exposing internals.
 */
export async function GET() {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from('general_settings')
      .select('id')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, db: 'down', timestamp: new Date().toISOString() },
        { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } },
      );
    }

    return NextResponse.json(
      { ok: true, db: 'up', timestamp: new Date().toISOString() },
      { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, db: 'down', timestamp: new Date().toISOString() },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
}
