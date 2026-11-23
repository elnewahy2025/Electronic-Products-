import 'server-only';
import { revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';
import { deleteProductImageFromStorage } from './product-image-service';

export type CategoryNode = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  product_count: number;
  children: CategoryNode[];
};

export type FlatCategory = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  product_count: number;
  depth: number;
  cover_image_url: string | null;
  cover_storage_path: string | null;
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export async function listCategoriesFlat(): Promise<FlatCategory[]> {
  const db = await createClient();
  const { data } = await db
    .from('categories')
    .select('id, parent_id, name, slug, sort_order, is_active, cover_image_url, cover_storage_path')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (!data) return [];

  // Product counts (published only, per category)
  const { data: counts } = await db
    .from('products')
    .select('category_id, status')
    .neq('status', 'deleted');

  const countMap = new Map<string, number>();
  for (const p of counts ?? []) {
    if (!p.category_id) continue;
    countMap.set(p.category_id, (countMap.get(p.category_id) ?? 0) + 1);
  }

  // Compute depth
  const byId = new Map(data.map((c: any) => [c.id, c]));
  const depthOf = (id: string): number => {
    let d = 0;
    let cur = byId.get(id);
    while (cur?.parent_id && d < 100) {
      d++;
      cur = byId.get(cur.parent_id);
    }
    return d;
  };

  return data.map((c: any) => ({
    id: c.id,
    parent_id: c.parent_id,
    name: c.name,
    slug: c.slug,
    sort_order: c.sort_order,
    is_active: c.is_active,
    product_count: countMap.get(c.id) ?? 0,
    depth: depthOf(c.id),
    cover_image_url: c.cover_image_url ?? null,
    cover_storage_path: c.cover_storage_path ?? null,
  }));
}

export async function listCategoriesTree(): Promise<CategoryNode[]> {
  const flat = await listCategoriesFlat();
  const byId = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];

  for (const c of flat) {
    byId.set(c.id, { ...c, children: [] });
  }
  for (const c of flat) {
    const node = byId.get(c.id)!;
    if (c.parent_id && byId.has(c.parent_id)) {
      byId.get(c.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function validateName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 2) throw new Error('name_too_short');
  if (trimmed.length > 80) throw new Error('name_too_long');
  return trimmed;
}

async function ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
  const db = await createClient();
  let slug = base || `cat-${Date.now()}`;
  let attempt = 0;

  while (attempt < 10) {
    const q = db.from('categories').select('id').eq('slug', slug);
    if (excludeId) q.neq('id', excludeId);
    const { data } = await q.maybeSingle();
    if (!data) return slug;
    attempt++;
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }
  throw new Error('slug_conflict');
}

export async function createCategory(input: {
  name: string;
  parentId?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}): Promise<{ id: string; slug: string }> {
  const db = await createClient();
  const name = validateName(input.name);
  const slug = await ensureUniqueSlug(slugify(name));

  // Validate parent exists
  if (input.parentId) {
    const { data: parent } = await db
      .from('categories')
      .select('id')
      .eq('id', input.parentId)
      .maybeSingle();
    if (!parent) throw new Error('parent_not_found');
  }

  const { data, error } = await db
    .from('categories')
    .insert({
      name,
      slug,
      parent_id: input.parentId ?? null,
      is_active: input.isActive ?? true,
      sort_order: input.sortOrder ?? 0,
    })
    .select('id, slug')
    .single();

  if (error) {
    if (error.message.includes('duplicate key')) throw new Error('slug_conflict');
    throw new Error(error.message);
  }

  await logAudit({
    action: 'category.created',
    entityType: 'categories',
    entityId: data.id,
    after: { name, slug, parent_id: input.parentId ?? null },
  });

  revalidateTag('storefront-categories');
  return data;
}

export async function updateCategory(input: {
  id: string;
  name?: string;
  slug?: string;
  parentId?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}): Promise<void> {
  const db = await createClient();

  const { data: current } = await db
    .from('categories')
    .select('name, slug, parent_id, is_active, sort_order')
    .eq('id', input.id)
    .maybeSingle();

  if (!current) throw new Error('category_not_found');

  const patch: Record<string, unknown> = {};

  if (input.name !== undefined) {
    patch.name = validateName(input.name);
  }
  if (input.slug !== undefined) {
    const candidate = input.slug.trim().toLowerCase();
    if (!candidate) throw new Error('slug_empty');
    if (candidate !== current.slug) {
      patch.slug = await ensureUniqueSlug(candidate, input.id);
    }
  }
  if (input.parentId !== undefined) {
    if (input.parentId && input.parentId === input.id) {
      throw new Error('category_cycle_detected');
    }
    patch.parent_id = input.parentId;
  }
  if (input.isActive !== undefined) patch.is_active = input.isActive;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;

  if (Object.keys(patch).length === 0) return;

  // Use RPC for parent to enforce cycle check
  if (patch.parent_id !== undefined) {
    const { error: parentErr } = await db.rpc('set_category_parent', {
      p_category_id: input.id,
      p_parent_id: patch.parent_id as string | null,
    });
    if (parentErr) {
      if (parentErr.message.includes('category_cycle_detected')) {
        throw new Error('category_cycle_detected');
      }
      throw new Error(parentErr.message);
    }
    delete patch.parent_id;
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await db
      .from('categories')
      .update(patch)
      .eq('id', input.id);
    if (error) {
      if (error.message.includes('duplicate key')) throw new Error('slug_conflict');
      throw new Error(error.message);
    }
  }

  await logAudit({
    action: 'category.updated',
    entityType: 'categories',
    entityId: input.id,
    before: current,
    after: patch,
  });
  revalidateTag('storefront-categories');
}

export async function deleteCategory(input: {
  id: string;
  mode: 'reassign' | 'block';
  fallbackCategoryId?: string | null;
}): Promise<{ reassignedChildren: number; reassignedProducts: number }> {
  const db = await createClient();
  const { data, error } = await db.rpc('delete_category_safe', {
    p_category_id: input.id,
    p_mode: input.mode,
    p_fallback_category_id: input.fallbackCategoryId ?? null,
  });

  if (error) {
    const msg = error.message;
    if (msg.includes('category_has_dependents')) {
      throw new Error('category_has_dependents');
    }
    if (msg.includes('invalid_fallback')) throw new Error('invalid_fallback');
    if (msg.includes('fallback_inside_subtree')) throw new Error('fallback_inside_subtree');
    if (msg.includes('fallback_not_found')) throw new Error('fallback_not_found');
    throw new Error(msg);
  }

  const row = data as { reassigned_children: number; reassigned_products: number };
  revalidateTag('storefront-categories');
  revalidateTag('storefront-products');
  return {
    reassignedChildren: row.reassigned_children ?? 0,
    reassignedProducts: row.reassigned_products ?? 0,
  };
}

export async function reorderCategories(
  order: Array<{ id: string; sort_order: number }>
): Promise<void> {
  const db = await createClient();
  const { error } = await db.rpc('reorder_categories', {
    p_order: order,
  });
  if (error) throw new Error(error.message);
  revalidateTag('storefront-categories');
}

export async function setCategoryCover(input: {
  id: string;
  url: string;
  storagePath: string;
}): Promise<void> {
  const db = await createClient();
  const { data: current } = await db
    .from('categories')
    .select('cover_storage_path')
    .eq('id', input.id)
    .maybeSingle();
  if (!current) throw new Error('category_not_found');

  const { error } = await db
    .from('categories')
    .update({ cover_image_url: input.url, cover_storage_path: input.storagePath })
    .eq('id', input.id);
  if (error) throw new Error(error.message);

  if (current.cover_storage_path && current.cover_storage_path !== input.storagePath) {
    await deleteProductImageFromStorage(current.cover_storage_path);
  }
  revalidateTag('storefront-categories');
}

export async function clearCategoryCover(id: string): Promise<void> {
  const db = await createClient();
  const { data: current } = await db
    .from('categories')
    .select('cover_storage_path')
    .eq('id', id)
    .maybeSingle();
  if (!current) throw new Error('category_not_found');

  const { error } = await db
    .from('categories')
    .update({ cover_image_url: null, cover_storage_path: null })
    .eq('id', id);
  if (error) throw new Error(error.message);

  await deleteProductImageFromStorage(current.cover_storage_path);
  revalidateTag('storefront-categories');
}