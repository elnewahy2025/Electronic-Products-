# Category Management

## Data model
- `categories.id`, `name`, `slug` (unique), `parent_id` (nullable), `sort_order`, `is_active`, `updated_at`.
- `cover_image_url` / `cover_storage_path` (migration 056): optional admin-uploaded artwork.
- Fully hierarchical: any depth. Cycle protection is enforced by `category_would_create_cycle()`.

## Storefront artwork

Every category card shows subject-appropriate artwork. If no cover is uploaded,
`getCategoryArt()` derives an illustration from the category name/slug
(presentation, lessons, books, templates, video, audio, sheets, documents,
design, or a stable generic variant), so categories created in the future are
covered without any extra setup.

An admin with `category.manage` can override it in **Admin → Categories → تعديل**:
upload PNG/JPEG/WebP/AVIF (max 5 MB) via `POST /api/admin/categories/:id/cover`.
The server validates and converts it to WebP, stores it under
`categories/:id/cover.webp` in the public `product-images` bucket, and updates
the category row. `DELETE /api/admin/categories/:id/cover` restores the automatic
artwork and removes the stored object. The `storefront-categories` cache tag is
revalidated on both operations.

## Operations & safety rules

### Create
- Name: 2–80 chars.
- Slug: auto-generated from name if omitted; uniqueness enforced with retry on collision.
- Parent must exist; no cycle possible on create.

### Update
- Changing `parent_id` goes through `set_category_parent()` which enforces cycle check.
- Changing `slug` re-validates uniqueness (excluding self).
- Changing `name` does NOT auto-update `slug` (intentional — old links stay valid).

### Delete
Two modes:
- **block**: refuses if any products or child categories reference it.
- **reassign**: moves children and products to a chosen fallback (or NULL = uncategorized),
  then deletes. Fallback cannot be inside the subtree being deleted.

Products in `deleted` status are ignored by the count.

### Reorder
- Admin UI: click **ترتيب جماعي**, then use ↑/↓ to move a category among its siblings and **حفظ الترتيب**.
- The UI assigns sequential `sort_order` values per parent and sends only changed rows to
  `POST /api/admin/categories/reorder` as `{ order: [{id, sort_order}, ...] }`.
- The API/RPC remains available for integrations; all operations still require `category.manage`.

## Permissions
All operations require `category.manage` (admin or staff with the permission).
RLS on `categories` allows public read of `is_active=true` rows; writes go through RPCs
that enforce `category.manage`.

## Product impact
When a product's category is deleted and reassigned, its `category_id` changes immediately.
Existing orders are unaffected — `order_items` doesn't reference categories.