# Seller Orders (Sales) Page

## Overview
`/seller/orders` gives each approved seller a privacy-safe view of their sales.
Sellers never see the buyer's full email or phone; they see a masked email
and (optionally) the order status derived from codes + download sessions.

## Data flow

Two SECURITY DEFINER functions, both gated on `auth.uid()`:

### `seller_orders(product_id?, status?, from?, to?, limit, offset)`
Returns paginated sales rows with:
- Product info (title, slug)
- Masked buyer (`ab***@gmail.com`) — first 2 chars + domain
- Gross price + computed net after commission
- Code status (`issued`, `delivered`, `redeemed`, `expired`, `revoked`)
- Session status (`active`, `completed`, `expired_partial`, `exhausted`, ...)
- Attempts used / max

Filters:
- `product_id` — one product only
- `status` — pending | active | completed | expired | revoked
  - `pending` → code in `issued`/`delivered` (not yet redeemed)
  - `active` → redeemed + session active/compensation_active
  - `completed` → redeemed + session completed
  - `expired` → code expired OR session expired/expired_partial/exhausted
  - `revoked` → code revoked
- `from` / `to` — `order_items.created_at` date range

### `seller_sales_stats()`
One-call aggregate:
- `total_sales`, `total_gross`, `total_net`
- `currency` (dominant currency), `has_multiple_currencies`
- `commission_rate` (current effective rate)
- `pending_count`, `active_count`, `completed_count`, `expired_count`
- `revenue_last_30d`, `sales_last_30d`
- `top_products` (up to 5 by count)

## Commission calculation (Migration 033 — Snapshotted at Sale)

When `approve_purchase_request` creates each `order_item`:
1. `resolve_effective_commission_rate(seller_id, category_id)` resolves the active rate:
   - Category-specific override in `seller_commissions` (`scope = 'category'`)
   - Global seller override in `seller_commissions` (`scope = 'global'`)
   - Platform `commission_settings.default_rate` (fallback `0.10`)
2. The rate, commission amount, and net seller amount are snapshotted permanently onto `order_items` (`commission_rate_at_sale`, `commission_amount`, `net_seller_amount`).
3. `credit_seller_wallet_for_order_item` atomically increments `seller_wallets.balance` by `net_seller_amount` and records `earning` (+gross) and `commission` (-commission) rows in `financial_transactions` (idempotent via unique partial index `uq_fin_tx_order_item_type`).
4. Both `seller_orders` and `seller_sales_stats` read directly from the snapshotted columns on `order_items`, so historical net amounts never shift if commission rates change later.

## Buyer privacy

| Field | Shown to seller |
|---|---|
| Full email | ❌ |
| Masked email | ✅ (`ab***@gmail.com`) |
| Phone | ❌ |
| Name | ❌ |
| Buyer ID | ❌ |
| Order date | ✅ |
| Product | ✅ |
| Amount | ✅ |
| Download status | ✅ |

Masking preserves enough info to disambiguate orders (e.g., if two buyers have
similar emails) but prevents direct contact — supporting the platform's
"no direct seller↔buyer channel" rule.

## UI structure

```text
Header (title + link to wallet)
Stats cards (4): total sales, gross, net, pending
Filters (product / status / date range)
Results count
Table: product, buyer (masked), gross, net, status, attempts, date
Pagination (50 per page)
```

## Performance

- `seller_orders` uses one CTE with joins + one COUNT for the total.
- `seller_sales_stats` uses one base CTE + several aggregate subqueries —
  for a seller with <10K orders, this is ~10ms.
- Indexes added in migration 032:
  - `idx_order_items_created` — ordering by date
  - `idx_products_seller_published` — filter base rows

## Security

- Both functions are `SECURITY DEFINER` but:
  - Read `auth.uid()` internally, never accept caller-supplied seller ID.
  - Filter all base tables by `p.seller_id = auth.uid()`.
  - Reject with `unauthenticated` if `auth.uid()` is NULL.
- `GRANT EXECUTE` only to `authenticated`, never `anon`.
- Sellers cannot access other sellers' rows even via crafted RPC calls, since
  `auth.uid()` is the only selector.

## Not covered (future work)

1. **Commission snapshot at sale time.** When `order_items` are created, the
   rate should be saved to a new column (e.g., `commission_rate_at_sale`).
   This requires modifying `approve_purchase_request` in migration 016 and a
   backfill for existing orders.

2. **Revenue credited to wallet.** Currently sales do NOT increment
   `seller_wallets.balance` or create `financial_transactions`. When that
   pipeline is built, the seller's actual balance will be the source of truth
   and this page becomes a supplementary view.

3. **Buyer-side agreement.** Some platforms give the seller the buyer's email
   after purchase (for delivery support). We don't — by design — because the
   platform is the sole intermediary.

4. **Export to CSV.** A "download as CSV" button is a common request; not built
   yet. Easy to add (reuse `admin/audit/export` pattern).

5. **Per-order detail view.** Currently each row is a link to the public
   product page. A dedicated `/seller/orders/[orderItemId]` page could show
   the code prefix, exact timestamps, download deliveries — useful if support
   issues arise.

## Testing

- Buyer with `ab@gmail.com` sees full email in their own orders (`/account/orders`)
  — no regression.
- Seller sees `ab***@gmail.com` — verified by the E2E suite (`04-security-hardening`).
- Seller cannot enumerate other sellers' sales even with a crafted request
  (impossible — function only reads `auth.uid()`).
- Filters work together (e.g., `status=active&product=<id>&from=2026-01-01`).
