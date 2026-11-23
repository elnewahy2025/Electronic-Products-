import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePerm } from '@/lib/auth/admin-guard';
import { decrypt } from '@/lib/crypto/encryption';
import { deleteDriveFile } from '@/lib/drive/client';
import { logAudit } from '@/lib/audit/logger';

const body = z.object({ reason: z.string().min(3) });

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await requirePerm('file.delete');
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

    const admin = createAdminClient();

    // Reject if the file is referenced by any sold product version
    const { count } = await admin
      .from('product_version_files')
      .select('*', { count: 'exact', head: true })
      .eq('file_version_id', params.id);

    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: 'FILE_LINKED_TO_PRODUCT' }, { status: 409 });
    }

    // Fetch storage location + token
    const { data: fv } = await admin
      .from('file_versions')
      .select(`
        id, file_id, storage_location_id,
        file_storage_locations(
          provider_file_id,
          seller_drive_accounts(encrypted_refresh_token)
        ),
        files(seller_id)
      `)
      .eq('id', params.id)
      .single();

    if (!fv) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

    // Try to delete from Drive (best-effort)
    const loc = (fv as any).file_storage_locations;
    const token = loc?.seller_drive_accounts?.encrypted_refresh_token;
    if (loc?.provider_file_id && token) {
      try {
        await deleteDriveFile(decrypt(token), loc.provider_file_id);
      } catch {
        /* log but continue — file may already be gone */
      }
    }

    // Mark as deleted
    await admin.from('file_versions').update({ scan_status: 'deleted' }).eq('id', params.id);
    await admin.from('quarantine_records').update({
      released_at: new Date().toISOString(),
      released_by: (await (await createClient()).auth.getUser()).data.user?.id ?? null,
      notes: parsed.data.reason,
    }).eq('file_version_id', params.id).is('released_at', null);

    await logAudit({
      action: 'file.deleted',
      entityType: 'file_versions',
      entityId: params.id,
      after: { scan_status: 'deleted' },
      reason: parsed.data.reason,
      ip: req.headers.get('x-forwarded-for') ?? undefined,
      userAgent: req.headers.get('user-agent') ?? undefined,
      required: true,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e) }, { status: 403 });
  }
}
