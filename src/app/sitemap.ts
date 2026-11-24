import type { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3010').replace(/\/$/, '');
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/products`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/categories`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
  ];

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return staticEntries;

  try {
    const db = createClient<Database>(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [{ data: products }, { data: categories }] = await Promise.all([
      db.from('products')
        .select('slug, updated_at')
        .eq('status', 'published')
        .limit(500),
      db.from('categories')
        .select('slug')
        .eq('is_active', true)
        .limit(200),
    ]);

    const productEntries: MetadataRoute.Sitemap = (products ?? []).map(p => ({
      url: `${baseUrl}/products/${p.slug}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : now,
      changeFrequency: 'weekly',
      priority: 0.8,
    }));

    const categoryEntries: MetadataRoute.Sitemap = (categories ?? []).map(c => ({
      url: `${baseUrl}/categories/${c.slug}`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    }));

    return [...staticEntries, ...categoryEntries, ...productEntries];
  } catch {
    return staticEntries;
  }
}
