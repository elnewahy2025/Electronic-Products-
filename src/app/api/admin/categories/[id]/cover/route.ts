import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { requirePerm } from '@/lib/auth/admin-guard';
import { logAudit } from '@/lib/audit/logger';
import { MAX_CATEGORY_COVER_BYTES, uploadCategoryCover } from '@/lib/server/services/category-cover-service';
import { clearCategoryCover, setCategoryCover } from '@/lib/server/services/category-service';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, props: Ctx) {
  const params = await props.params;
  try {
    await requirePerm('category.manage');

    const contentLength = Number(req.headers.get('content-length') ?? '0');
    if (Number.isFinite(contentLength) && contentLength > MAX_CATEGORY_COVER_BYTES + 256 * 1024) {
      return NextResponse.json({ error: 'image_too_large' }, { status: 413 });
    }

    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: 'invalid_form_data' }, { status: 400 });
    }
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file_required' }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_CATEGORY_COVER_BYTES) {
      return NextResponse.json({ error: 'image_too_large' }, { status: 413 });
    }

    const uploaded = await uploadCategoryCover({
      categoryId: params.id,
      buffer: Buffer.from(await file.arrayBuffer()),
    });
    await setCategoryCover({
      id: params.id,
      url: uploaded.url,
      storagePath: uploaded.storagePath,
    });

    await logAudit({
      action: 'category.cover_uploaded',
      entityType: 'categories',
      entityId: params.id,
      after: {
        storage_path: uploaded.storagePath,
        size_bytes: uploaded.sizeBytes,
        width: uploaded.width,
        height: uploaded.height,
      },
    });

    return NextResponse.json(uploaded);
  } catch (e: any) {
    const msg = e?.message ?? 'upload_failed';
    const status =
      msg === 'UNAUTHENTICATED' ? 401
      : msg === 'FORBIDDEN' ? 403
      : msg === 'image_too_large' ? 413
      : 400;
    return NextResponse.json({ error: publicError(msg) }, { status });
  }
}

export async function DELETE(_req: NextRequest, props: Ctx) {
  const params = await props.params;
  try {
    await requirePerm('category.manage');
    await clearCategoryCover(params.id);
    await logAudit({
      action: 'category.cover_removed',
      entityType: 'categories',
      entityId: params.id,
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message ?? 'cover_remove_failed';
    const status = msg === 'UNAUTHENTICATED' ? 401 : msg === 'FORBIDDEN' ? 403 : 400;
    return NextResponse.json({ error: publicError(msg) }, { status });
  }
}
