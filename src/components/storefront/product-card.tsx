import Link from 'next/link';

type ProductCardProps = {
  id: string;
  title: string;
  slug: string;
  short_description: string | null;
  price_amount: number;
  price_currency: string;
  seller_display_name?: string;
  rating_avg?: number;
  rating_count?: number;
  cover_image_url?: string | null;
};

export function ProductCard(p: ProductCardProps) {
  return (
    <Link
      href={`/products/${p.slug}`}
      className="group border rounded-lg overflow-hidden hover:shadow-md transition flex flex-col"
    >
      <div className="aspect-video bg-muted relative overflow-hidden">
        {p.cover_image_url ? (
          <img
            src={p.cover_image_url}
            alt={p.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
            منتج رقمي
          </div>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col">
        <h3 className="font-medium line-clamp-2 group-hover:text-primary transition">
          {p.title}
        </h3>
        {p.short_description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
            {p.short_description}
          </p>
        )}
        {p.seller_display_name && (
          <p className="text-xs text-muted-foreground mt-2">
            بواسطة {p.seller_display_name}
          </p>
        )}
        <div className="flex items-center justify-between mt-auto pt-3">
          <span className="font-bold text-sm">
            {p.price_amount} {p.price_currency}
          </span>
          {(p.rating_count ?? 0) > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="text-yellow-500">★</span>
              {p.rating_avg} ({p.rating_count})
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
