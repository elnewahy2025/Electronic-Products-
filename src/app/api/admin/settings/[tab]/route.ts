import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/auth/admin-guard';
import { SETTINGS_TABLES, SettingsTab, getSettings } from '@/lib/server/services/settings-service';

function isTab(x: string): x is SettingsTab {
  return x in SETTINGS_TABLES;
}

export async function GET(_req: NextRequest, { params }: { params: { tab: string } }) {
  try {
    await requireSuperAdmin();
    if (!isTab(params.tab)) return NextResponse.json({ error: 'INVALID_TAB' }, { status: 400 });
    const settings = await getSettings(params.tab);
    return NextResponse.json({ settings });
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { tab: string } }) {
  try {
    await requireSuperAdmin();
    if (!isTab(params.tab)) return NextResponse.json({ error: 'INVALID_TAB' }, { status: 400 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

    const db = await createClient();
    const table = SETTINGS_TABLES[params.tab];

    // Strip immutable / audit fields
    const { id: _id, updated_by: _u1, updated_at: _u2, ...patch } = body;

    const { error } = await db.from(table).update(patch).eq('id', 1);
    if (error) return NextResponse.json({ error: publicError(error) }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e) }, { status: 403 });
  }
}