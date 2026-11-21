import { createClient } from '@/lib/supabase/server';
import { listCategoriesFlat } from '@/lib/server/services/category-service';
import { ProductForm } from '../product-form';

export default async function NewProductPage() {
  const db = await createClient();
  const [categories, { data: pricing }] = await Promise.all([
    listCategoriesFlat(),
    db.from('pricing_settings').select('min_product_price, min_product_price_currency').eq('id', 1).single(),
  ]);

  return (
    <main className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">منتج جديد</h1>
      <ProductForm
        mode="create"
        categories={categories.filter(c => c.is_active)}
        minPrice={Number(pricing?.min_product_price ?? 0)}
        minPriceCurrency={pricing?.min_product_price_currency ?? 'USD'}
      />
    </main>
  );
}