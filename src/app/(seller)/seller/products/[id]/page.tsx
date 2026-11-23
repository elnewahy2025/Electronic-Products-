import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSellerProduct } from '@/lib/server/services/seller-product-service';
import { listCategoriesFlat } from '@/lib/server/services/category-service';
import { ProductForm } from '../product-form';
import { ProductActions } from './product-actions';

export default async function EditProductPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) notFound();

  const product = await getSellerProduct(user.id, params.id);
  if (!product) notFound();

  const [categories, { data: pricing }, { data: full }] = await Promise.all([
    listCategoriesFlat(),
    db.from('pricing_settings').select('min_product_price, min_product_price_currency').eq('id', 1).single(),
    db.from('products').select('description, cover_image_url').eq('id', params.id).single(),
  ]);

  return (
    <main className="p-6 space-y-6 max-w-3xl">
      <nav className="text-sm text-muted-foreground">
        <Link href="/seller/products" className="hover:underline">منتجاتي</Link>
        {' / '}
        <span>{product.title}</span>
      </nav>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{product.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {product.versions_count} إصدار — {product.status}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/seller/products/${params.id}/gallery`}
            className="border rounded px-3 py-1.5 text-sm hover:bg-accent"
          >
            معرض الصور
          </Link>
          <Link
            href={`/seller/products/${params.id}/versions`}
            className="bg-primary text-primary-foreground rounded px-3 py-1.5 text-sm"
          >
            إدارة الإصدارات
          </Link>
        </div>
      </div>

      <ProductActions
        productId={params.id}
        status={product.status}
        hasPublishedVersion={!!product.published_version_id}
      />

      <ProductForm
        mode="edit"
        productId={params.id}
        initial={{
          title: product.title,
          short_description: product.short_description,
          description: (full as any)?.description ?? null,
          price_amount: product.price_amount,
          price_currency: product.price_currency,
          category_id: product.category_id,
          cover_image_url: (full as any)?.cover_image_url ?? null,
        }}
        categories={categories.filter(c => c.is_active)}
        minPrice={Number(pricing?.min_product_price ?? 0)}
        minPriceCurrency={pricing?.min_product_price_currency ?? 'USD'}
      />
    </main>
  );
}