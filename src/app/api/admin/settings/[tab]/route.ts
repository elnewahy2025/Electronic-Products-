import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperAdmin } from '@/lib/auth/admin-guard';
import {
  SETTINGS_TABLES,
  type SettingsTab,
  getSettings,
  updateSettings,
} from '@/lib/server/services/settings-service';

const CURRENCY_SCHEMA = z.enum(['USD', 'EGP', 'SAR', 'KWD']);

const TAB_SCHEMAS: Record<SettingsTab, z.ZodType<Record<string, unknown>>> = {
  general: z
    .object({
      default_currency: CURRENCY_SCHEMA.optional(),
      allowed_currencies: z.array(CURRENCY_SCHEMA).min(1).max(10).optional(),
      platform_name: z.string().trim().min(1).max(120).nullable().optional(),
      platform_contact_email: z.string().trim().email().max(320).nullable().optional(),
      platform_contact_phone: z.string().trim().max(40).nullable().optional(),
      timezone: z.string().trim().min(1).max(80).optional(),
      maintenance_mode: z.boolean().optional(),
    })
    .strict(),
  pricing: z
    .object({
      min_product_price: z.number().finite().min(0).max(1_000_000).optional(),
      min_product_price_currency: CURRENCY_SCHEMA.optional(),
    })
    .strict(),
  download: z
    .object({
      session_duration_hours: z.number().int().min(1).max(720).optional(),
      max_attempts_per_product: z.number().int().min(1).max(10).optional(),
      code_validity_hours: z.number().int().min(1).max(8760).optional(),
      partial_session_new_duration_hours: z.number().int().min(1).max(720).optional(),
    })
    .strict(),
  compensation: z
    .object({
      max_sessions_per_product: z.number().int().min(1).max(10).optional(),
      session_duration_hours: z.number().int().min(1).max(720).optional(),
      requires_admin_approval: z.boolean().optional(),
      reason_required: z.boolean().optional(),
    })
    .strict(),
  attempt_exception: z
    .object({
      warning_threshold: z.number().int().min(1).max(100).optional(),
      reason_required: z.boolean().optional(),
      super_admin_only: z.boolean().optional(),
    })
    .strict(),
  watermark: z
    .object({
      text_template: z.string().trim().min(1).max(200).optional(),
      opacity_level: z.enum(['low', 'medium', 'high']).optional(),
      direction: z.enum(['diagonal', 'horizontal']).optional(),
      apply_to_previews_only: z.boolean().optional(),
      apply_to_delivered_files: z.boolean().optional(),
      video_style: z.enum(['static', 'periodic', 'both']).optional(),
    })
    .strict(),
  backup: z
    .object({
      schedule: z.enum(['daily', 'weekly', 'manual_only']).optional(),
      manual_enabled: z.boolean().optional(),
      retention_days: z.number().int().min(1).max(3650).optional(),
      storage_provider: z.enum(['r2', 's3', 'admin_server']).nullable().optional(),
      encryption_enabled: z.boolean().optional(),
      restore_test_frequency_days: z.number().int().min(1).max(365).optional(),
      include_files: z.boolean().optional(),
    })
    .strict(),
  audit: z
    .object({
      retention_days: z.number().int().min(1).max(3650).optional(),
      post_retention_action: z.enum(['archive', 'archive_and_keep_index']).optional(),
      append_only_enforced: z.literal(true).optional(),
    })
    .strict(),
  security: z
    .object({
      mfa_enforced_roles: z.array(z.string().min(1).max(50)).min(3).max(20).optional(),
      code_rate_limit_per_hour: z.number().int().min(1).max(10_000).optional(),
      login_rate_limit_per_hour: z.number().int().min(1).max(10_000).optional(),
      session_idle_timeout_minutes: z.number().int().min(5).max(10_080).optional(),
      password_min_length: z.number().int().min(8).max(128).optional(),
    })
    .strict(),
  payout: z
    .object({
      minimum_amount: z.number().finite().positive().max(1_000_000).optional(),
      minimum_currency: CURRENCY_SCHEMA.optional(),
      allowed_methods: z.array(z.string().trim().min(1).max(60)).max(20).nullable().optional(),
    })
    .strict(),
  commission: z
    .object({
      default_rate: z.number().finite().min(0).max(1).optional(),
      per_seller_override_enabled: z.boolean().optional(),
      per_product_type_override_enabled: z.boolean().optional(),
    })
    .strict(),
};

function isTab(x: string): x is SettingsTab {
  return Object.hasOwn(SETTINGS_TABLES, x);
}

export async function GET(_req: NextRequest, props: { params: Promise<{ tab: string }> }) {
  const params = await props.params;
  try {
    await requireSuperAdmin();
    if (!isTab(params.tab)) return NextResponse.json({ error: 'INVALID_TAB' }, { status: 400 });
    const settings = await getSettings(params.tab);
    return NextResponse.json({ settings });
  } catch (e: any) {
    const code = publicError(e, 'REQUEST_FAILED', 'api/admin/settings/[tab]:GET');
    const status = code === 'UNAUTHENTICATED' ? 401 : code === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: code }, { status });
  }
}

export async function PUT(req: NextRequest, props: { params: Promise<{ tab: string }> }) {
  const params = await props.params;
  try {
    await requireSuperAdmin();
    if (!isTab(params.tab)) return NextResponse.json({ error: 'INVALID_TAB' }, { status: 400 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
    }

    // Strip read-only metadata keys if round-tripped by the admin form, then validate strictly
    const { id: _id, updated_by: _u1, updated_at: _u2, ...candidate } = body as Record<string, unknown>;
    const parsed = TAB_SCHEMAS[params.tab].safeParse(candidate);
    if (!parsed.success) {
      return NextResponse.json({ error: 'INVALID_SETTINGS_PAYLOAD' }, { status: 400 });
    }

    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ ok: true });
    }

    await updateSettings(params.tab, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const code = publicError(e, 'REQUEST_FAILED', 'api/admin/settings/[tab]:PUT');
    const status = code === 'UNAUTHENTICATED' ? 401 : code === 'FORBIDDEN' ? 403 : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
