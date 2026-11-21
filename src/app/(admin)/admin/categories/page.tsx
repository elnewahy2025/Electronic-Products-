import { listCategoriesFlat } from '@/lib/server/services/category-service';
import { CategoryManager } from './category-manager';

export default async function CategoriesPage() {
  const categories = await listCategoriesFlat();
  return (
    <main className="p-6">
      <CategoryManager initial={categories} />
    </main>
  );
}