import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { processAndUploadProductImage } from '@/lib/server/services/product-image-service';
import { logAudit } from '@/lib/audit/logger';

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (user.accountType !== 'seller') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }

    // Verify seller is approved
    const db = await createClient();
    const { data: seller } = await db
      .from('seller_profiles')
      .select('status')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (!seller || seller.status !== 'approved') {
      return NextResponse.json({ error: 'SELLER_NOT_APPROVED' }, { status: 403 });
    }

    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: 'invalid_form_data' }, { status: 400 });
    }

    const file = formData.get('file');
    const kindRaw = formData.get('kind');
    const kind = kindRaw === 'gallery' ? 'gallery' : 'cover';

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file_required' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await processAndUploadProductImage({
      buffer,
      sellerId: user.id,
      kind,
    });

    await logAudit({
      action: 'product.image_uploaded',
      entityType: 'storage',
      after: {
        kind,
        storage_path: uploaded.storagePath,
        size_bytes: uploaded.sizeBytes,
        width: uploaded.width,
        height: uploaded.height,
      },
    });

    return NextResponse.json(uploaded);
  } catch (e: any) {
    const msg = e.message ?? 'upload_failed';
    const status =
      msg === 'UNAUTHENTICATED' ? 401
      : msg === 'FORBIDDEN' ? 403
      : msg === 'image_too_large' ? 413
      : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
