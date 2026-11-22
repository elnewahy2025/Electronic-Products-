import Link from 'next/link';

type ProductCardProps = {
  id: string;
  title: string;
  slug: string;
  short_description: string | null;
  price_amount: number;
  price_currency: string;
  seller_display_name?: string | null;
  category_name?: string | null;
  rating_avg?: number;
  rating_count?: number;
  cover_image_url?: string | null;
};

export function ProductCard(p: ProductCardProps) {
  return (
    <Link
      href={`/products/${p.slug}`}
      className="group rounded-[14px] border border-border bg-card overflow-hidden hover:border-primary transition-colors flex flex-col"
    >
      <div className="aspect-[16/10] bg-muted relative overflow-hidden">
        {p.cover_image_url ? (
          <img
            src={p.cover_image_url}
            alt={p.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full bg-brand/90 text-brand-foreground/70 flex items-center justify-center text-sm font-medium">
            منتج رقمي
          </div>
        )}
      </div>

      <div className="p-3.5 pb-4 flex-1 flex flex-col gap-1.5">
        {p.category_name && (
          <span className="self-start rounded-full bg-muted px-2.5 py-0.5 text-[11.5px] font-medium text-foreground">
            {p.category_name}
          </span>
        )}

        <h3 className="font-semibold text-[15px] leading-snug text-foreground line-clamp-2 group-hover:text-primary transition-colors">
          {p.title}
        </h3>

        {p.short_description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {p.short_description}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mt-1">
          {p.seller_display_name ? (
            <span className="truncate">{p.seller_display_name}</span>
          ) : (
            <span />
          )}
          {(p.rating_count ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 shrink-0">
              <span className="text-[#e8a317]">★</span>
              <span className="ui-num font-medium text-foreground">{p.rating_avg}</span>
              <span className="ui-num">({p.rating_count})</span>
            </span>
          )}
        </div>

        <div className="flex items-baseline justify-between mt-auto pt-2.5 border-t border-border/60">
          <span className="font-bold text-[17px] text-foreground ui-num">
            {Number(p.price_amount).toFixed(2)} {p.price_currency}
          </span>
          <span className="text-xs text-primary font-medium group-hover:underline">
            معاينة ←
          </span>
        </div>
      </div>
    </Link>
  );
}
