# Storefront UX Enhancements

## What was added

### 1. Cover image + gallery
- `products.cover_image_url` — main thumbnail shown in cards and product hero.
- `product_gallery_images` table — up to 8 additional images per product,
  managed by the seller at `/seller/products/[id]/gallery`.
- Fallback: if no cover or gallery, the first ready `file_preview.public_url`
  is used (watermarked).

### 2. Breadcrumbs
- Reusable `<Breadcrumbs>` component accepts `{ label, href? }[]`.
- Product page shows: الرئيسية / المنتجات / [category] / [product title].
- Category pages link through properly.

### 3. Similar products
- On product page, shows up to 4 other published products from the same
  category (excludes the current product).
- Uses `search_storefront` with `categorySlug` filter.

### 4. Skeleton loading
- `(public)/loading.tsx` — global storefront skeleton (grid of product cards).
- `(public)/products/[slug]/loading.tsx` — product page specific skeleton.
- Relies on Next.js Suspense boundaries; no JS needed.

## Data flow

Product page request
→ fetch product + seller + category + gallery + rating + reviews (parallel)
→ fetch similar products (depends on category)
→ render with breadcrumbs + gallery + purchase form + reviews + similar

## Seller workflow

1. Seller uploads files (existing flow).
2. Seller sets `cover_image_url` in product form (paste URL from previews or
   external CDN).
3. Seller opens `/seller/products/[id]/gallery` to add up to 8 extra images
   (paste URLs).
4. Seller can reorder (↑/↓) — sort_order persisted on each click.
5. Seller can delete any image.

## Permissions
- Gallery images: seller owns product → full access via RLS.
- Cover image: updated via existing product PATCH (ownership checked).
- Public read: anyone can read gallery of published products.

## Not covered
- **Image upload to Supabase Storage** — current implementation accepts URLs
  only. Future: add a dedicated upload widget that pushes to the `previews`
  bucket and returns a public URL.
- **Image optimization** — Next.js `<Image>` not used; using plain `<img>`
  with `loading="lazy"`. Consider migrating to `<Image>` for automatic
  sizing/format conversion.
- **Automatic thumbnail generation** — the cover image URL is used as-is.
  If sellers upload huge images, that's a bandwidth cost. Future: resize via
  `sharp` on upload.
