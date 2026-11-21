# Performance Review

## Summary of improvements

| Area | Before | After |
|---|---|---|
| Buyer order detail | 1 + N×3 queries (N=items) | 1 RPC query |
| Buyer orders list | 3 queries | 1 RPC query |
| Storefront search | Full table scan on `ILIKE '%q%'` | Trigram GIN index + `%` operator |
| Product rating per search row | Correlated `AVG()` subquery per row | Pre-computed `product_rating_stats` table |
| Rating updates on review change | Immediate AVG on every read | Trigger updates stats once per write |
| Products page | Blocks on search before render | Suspense streams results after filters render |
| Home page search counts | Computed per request | `unstable_cache` 60s, invalidated by tag |

## Indexes added (migration 031)

- `idx_purchase_requests_buyer_time` — buyer orders list
- `idx_purchase_requests_email_time` — guest order tracking
- `idx_purchase_requests_status_time` — admin pending list
- `idx_order_items_product` — review eligibility + seller sales
- `idx_pri_product` — review duplicate check
- `idx_reviews_buyer_product` — "have I reviewed this?"
- `idx_reviews_product_rating` — distribution stats
- `idx_download_attempts_completed` — attempts remaining (counts only completed)
- `idx_deliveries_session_completed` — "started delivery?" check
- `idx_purchase_codes_issued_time` / `idx_purchase_codes_status_time` — admin codes list
- `idx_compensation_code_status` — compensation count
- `idx_products_category_published` — category pages + similar products
- `idx_products_search_trgm` — storefront search (GIN + trigram)

## Query rewrites

### `buyer_order_detail(p_request_id) → jsonb`
Before:
```text
SELECT purchase_requests → 1
SELECT purchase_request_items WHERE purchase_request_id → N
For each item:
  SELECT order_items → N
  SELECT purchase_codes → N
  SELECT attempts → N
Total: 1 + 4N.
```

After: one SQL function that joins items + orders + codes + attempts + counts, aggregates via `jsonb_agg`. Ownership enforced by `buyer_id = auth.uid() OR customer_email = auth.email()`.

### `buyer_orders_list() → TABLE`
Before: 3 sequential queries + in-memory join in service.

After: one query with `LEFT JOIN` + `GROUP BY`, returns denormalized `product_titles` and `code_count`.

### `search_storefront(query)`
Before: `WHERE search_text ILIKE '%query%'` — no index can help. For 10K products, each search scanned all rows.

After: `WHERE search_text % query` — trigram GIN index finds candidates in O(log n). Combined with `similarity()` threshold for relevance if needed.

## Caching strategy

### `unstable_cache` (60s / 300s)
- `searchStorefront` — 60s per param set
- `getTopCategories` / `getAllCategories` — 300s

### Invalidation
- `createSellerProduct` / `update` / `delete` / `unpublish` & `seller-version-service` mutations → `revalidateTag('storefront-products')`
- `category-service` mutations → `revalidateTag('storefront-categories')`

This means: a seller publishes a product → `/products` reflects it immediately (tag invalidated), not after 60s.

### Non-cached paths
- Buyer `/account/*` — per-user, no benefit from caching
- Admin `/admin/*` — per-admin, freshness > speed
- `getProductReviews`, `getProductRating` — small queries, keep uncached to avoid stale reviews

## Streaming

`/products` page:
```text
Parallel:
  getAllCategories (cached, 300s) ← fast
  Suspense boundary:
    searchStorefront (cached, 60s) ← may be slow on cold cache
```

Result: filters + header render immediately, grid streams in. On a cold cache the user sees the skeleton for a moment instead of a blank page.

## RSC prefetch

Links in `<ProductCard>` use Next.js default prefetch. On hover, the product page bundle is pre-loaded. Combined with `unstable_cache` on the server, the transition is instant.

## What was NOT done (and why)

| Improvement | Reason not done |
|---|---|
| `React.cache()` on all services | Only useful for repeated calls in the same request. Most services are called once per request. |
| Full-text search (`tsvector`) | Trigram works better for Arabic (no stemming, no stopwords). FTS in Postgres requires `arabic` config which isn't built-in. |
| Redis cache layer | Overkill for current scale. `unstable_cache` handles the read-mostly patterns. Revisit if p95 > 500ms. |
| Database connection pooling tuning | Supabase uses PgBouncer in transaction mode by default — already optimized. |
| N+1 in `getSellerOverallStats` | Already a single `seller_review_stats` RPC. |
| Server Component `preload` pattern | Not needed; Next.js 14 handles parent-child data fetching sequentially. Only `Promise.all` in parallel is used. |

## How to measure

### Local
```bash
# Time a single query
psql -c "\timing on" -c "SELECT * FROM buyer_order_detail('...')"

# Explain analyze
psql -c "EXPLAIN (ANALYZE, BUFFERS) SELECT ... FROM search_storefront(...)"
```

### Staging
Enable `pg_stat_statements` and query:
```sql
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;
```

### Production
- Vercel Analytics → check p50/p95/p99 for page loads
- Supabase Logs → check slow queries (>500ms)
- Add `console.time()` in API routes if you need per-endpoint timings

## Thresholds to watch

| Metric | Target | Alert at |
|---|---|---|
| `/products` p95 | < 400ms | > 800ms |
| `/products/[slug]` p95 | < 500ms | > 1000ms |
| `/account` p95 | < 300ms | > 600ms |
| `/admin/requests` p95 | < 600ms | > 1200ms |
| Search RPC mean | < 50ms | > 200ms |

If any threshold is breached:
1. `EXPLAIN ANALYZE` the query.
2. Check if the index is being used.
3. Check if the cache is being invalidated too often.
4. Consider materialized view if aggregation is the bottleneck.

## Next steps (not implemented)

- **Materialized view for admin dashboard** — the 4 parallel counts on `/admin` could be one materialized view refreshed on a schedule.
- **Partial index on `download_sessions` for `status IN ('active','compensation_active')`** — the "active sessions" count scans the whole table.
- **Read replica routing** — for reports/audit pages. Would need Supabase Pro.
- **Edge caching for product images** — already handled by Vercel's CDN.
- **Search relevance ranking** — combine `similarity()` with `published_at DESC` for better results.
