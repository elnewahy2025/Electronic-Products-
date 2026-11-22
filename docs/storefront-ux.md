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

## Seller workflow (Updated — Migration 034: Direct Supabase Storage + sharp)

1. Seller uploads digital product files (Direct-to-Drive flow).
2. Seller uploads a cover image directly in the product form (`POST /api/seller/images/upload`):
   - Validated (≤ 5 MB, real image format verified by `sharp`, pixel-bomb guard).
   - Auto-oriented, EXIF metadata stripped, resized to max `1280×720`, converted to WebP (`quality: 82`), and stored in Supabase Storage `product-images` bucket.
3. Seller opens `/seller/products/[id]/gallery` to upload up to 8 extra gallery images (`POST /api/seller/products/[id]/gallery`, max `1600×1200` WebP).
4. Seller can reorder (`↑`/`↓`) or delete images (which also removes the stored WebP object from `product-images` via `storage_path`).
5. CSP `img-src` is tightened to Supabase Storage & Google domains only (broad `https:` removed).

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
