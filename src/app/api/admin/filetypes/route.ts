import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePerm } from '@/lib/auth/admin-guard';

const body = z.object({
  extension: z.string().min(1).max(20).regex(/^[a-z0-9]+$/i),
  mime: z.string().min(1).max(150),
  max_size_bytes: z.number().int().positive().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    await requirePerm('filetype.manage');
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

    const db = await createClient();
    const { error } = await db.from('allowed_file_types').insert({
      extension: parsed.data.extension.toLowerCase(),
      mime: parsed.data.mime,
      max_size_bytes: parsed.data.max_size_bytes,
    });
    if (error) return NextResponse.json({ error: publicError(error) }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e) }, { status: 403 });
  }
}