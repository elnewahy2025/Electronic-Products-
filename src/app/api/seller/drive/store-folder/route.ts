import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { decrypt } from '@/lib/crypto/encryption';
import { getDriveClient } from '@/lib/drive/client';

const bodySchema = z.object({
  drive_account_id: z.string().uuid(),
  store_folder_id: z.string().min(1).max(256),
});

/**
 * Links an existing Google Drive folder (selected by the seller via Google Picker)
 * as the dedicated `Store` root folder for this Drive account.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (user.accountType !== 'seller') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: acc } = await admin
      .from('seller_drive_accounts')
      .select('id, seller_id, status, encrypted_refresh_token')
      .eq('id', parsed.data.drive_account_id)
      .eq('seller_id', user.id)
      .maybeSingle();

    if (!acc || acc.status !== 'active' || !acc.encrypted_refresh_token) {
      return NextResponse.json({ error: 'DRIVE_ACCOUNT_NOT_FOUND' }, { status: 404 });
    }

    const drive = await getDriveClient(decrypt(acc.encrypted_refresh_token));
    const { data: folder } = await drive.files.get({
      fileId: parsed.data.store_folder_id,
      fields: 'id, name, mimeType, trashed',
    });

    if (!folder.id || folder.trashed || folder.mimeType !== 'application/vnd.google-apps.folder') {
      return NextResponse.json({ error: 'INVALID_STORE_FOLDER' }, { status: 400 });
    }

    await admin
      .from('seller_drive_accounts')
      .update({ store_folder_id: folder.id } as any)
      .eq('id', acc.id);

    return NextResponse.json({
      storeFolderId: folder.id,
      storeFolderName: folder.name ?? 'Store',
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'STORE_FOLDER_LINK_FAILED' },
      { status: e?.message === 'UNAUTHENTICATED' ? 401 : 400 },
    );
  }
}
