# Category Management

## Data model
- `categories.id`, `name`, `slug` (unique), `parent_id` (nullable), `sort_order`, `is_active`, `updated_at`.
- Fully hierarchical: any depth. Cycle protection is enforced by `category_would_create_cycle()`.

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
Bulk `POST /api/admin/categories/reorder` with `[{id, sort_order}, ...]`.

## Permissions
All operations require `category.manage` (admin or staff with the permission).
RLS on `categories` allows public read of `is_active=true` rows; writes go through RPCs
that enforce `category.manage`.

## Product impact
When a product's category is deleted and reassigned, its `category_id` changes immediately.
Existing orders are unaffected — `order_items` doesn't reference categories.