import { createClient } from '@/lib/supabase/server';
import { listCategoriesFlat } from '@/lib/server/services/category-service';
import { listMyFiles } from '@/lib/server/services/seller-file-service';
import { processPendingScans } from '@/lib/server/services/scan-service';
import { processPendingPreviews } from '@/lib/server/services/preview-service';
import { ProductForm } from '../product-form';

export default async function NewProductPage() {
  const db = await createClient();
  let [categories, { data: pricing }, files] = await Promise.all([
    listCategoriesFlat(),
    db.from('pricing_settings').select('min_product_price, min_product_price_currency').eq('id', 1).single(),
    listMyFiles(),
  ]);

  if (files.some(f => f.scan_status === 'uploaded' || f.scan_status === 'processing')) {
    await processPendingScans(5).catch(() => {});
    await processPendingPreviews(5).catch(() => {});
    files = await listMyFiles();
  }

  return (
    <main className="w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold">استوديو إضافة منتج جديد</h1>
        <p className="text-sm text-muted-foreground mt-1">
          اختر ملفاتك أو استوردها من مجلد Store، عاين بطاقة المنتج مباشرة، وانشره في المتجر بضغطة واحدة.
        </p>
      </div>
      <ProductForm
        mode="create"
        categories={categories.filter(c => c.is_active)}
        minPrice={Number(pricing?.min_product_price ?? 0)}
        minPriceCurrency={pricing?.min_product_price_currency ?? 'USD'}
        availableFiles={files.map(f => ({
          file_version_id: f.file_version_id,
          name: f.display_name || f.original_name,
          extension: f.extension,
          size_bytes: f.size_bytes,
          scan_status: f.scan_status,
          is_linked: f.is_linked,
        }))}
      />
    </main>
  );
}