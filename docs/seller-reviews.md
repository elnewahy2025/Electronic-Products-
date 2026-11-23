# Seller Reviews Management

## Overview
The seller reviews page (`/seller/reviews`) gives each seller:
- Aggregate rating stats (average + distribution)
- Per-product review counts
- Filter by product / rating / unreplied
- Reply to reviews (add, edit, delete own reply)
- **Request review deletion through a structured support ticket — sellers cannot delete
  reviews directly**

## Data model additions (migration 028, hardened in 053/054)
Three columns on `reviews`:
- `seller_reply TEXT`
- `seller_replied_at TIMESTAMPTZ`
- `seller_replied_by UUID` (FK to profiles)

Plus:
- `seller_reviews_view` — SECURITY INVOKER view that joins reviews with
  products and enforces `seller_id` filtering via RLS
- `seller_review_stats(p_seller_id)` — returns per-product aggregates
  (total, avg, 1-5 distribution, replied count)

`support_tickets` gained `product_id`, `order_item_id` and `review_id` columns (migration
`054_review_delete_ticket_guard.sql`) so a deletion request is linked to the exact review,
product and order item. Indexes exist on each of those columns with `status`.

## Permissions
- **View**: seller sees only their own products' reviews (via view + RLS).
- **Reply**: seller owns product → `restrict_review_reply` trigger verifies.
- **Delete review**: **seller has no delete permission.** A seller opens a ticket; only
  Admin or Staff holding `review.delete` may delete from the admin support ticket detail
  page via RPC `delete_review_from_ticket(p_review_id, p_ticket_id, p_reason)`.
- The legacy `delete_review(p_review_id, p_reason)` RPC is now **service-role only**;
  calls from `authenticated` raise `review_delete_requires_ticket`.

## Review deletion request flow (implemented)
1. Seller opens `/seller/reviews`, chooses **"request review deletion"** on a review card,
   and provides a reason.
2. `POST /api/support/tickets` creates a ticket with `owner_id = seller`, `status = 'open'`,
   and the linked `review_id`, `product_id` and `order_item_id` resolved from the review
   (the server verifies that the review belongs to one of the seller's products).
3. A support message carries the seller's explanation; staff with `support.read` are
   notified.
4. On the admin support ticket detail page (`/admin/support/[id]`), an Admin or Staff member
   with `review.delete` enters a mandatory reason and calls
   `POST /api/admin/support/tickets/[ticketId]/delete-review`, which invokes
   `delete_review_from_ticket`.
5. The RPC checks authorisation, ticket status (`open`/`pending`), that the ticket belongs to
   the product's seller and is linked to the review/product/order item, and that the review
   is not already deleted.
6. Deletion is blocked if the buyer has:
   - a `pending` or `approved` compensation request for the same order item;
   - a `pending` or `approved` attempt exception request for the same order item;
   - an `open` or `pending` buyer-owned support ticket for the same review, order item or
     product.
7. On success the review is soft-deleted with `deleted_by`, `deleted_at` and `delete_reason`,
   and the append-only audit event `review.deleted_from_ticket` is written with the ticket id.

Direct PostgREST updates to review deletion fields are also blocked by
`trg_restrict_review_soft_delete` unless an open seller ticket exists for the same
review/product/order item (service role is exempt for maintenance and restore verification).

## Business rules
1. **One reply per review.** Sellers edit or delete their reply, they don't
   stack multiple replies.
2. **Reply length ≤ 2000 chars.** Enforced in trigger + API.
3. **Seller cannot edit the review itself.** Only the reply fields are
   mutable. Rating/body are locked by `restrict_review_updates` trigger
   (from migration 027).
4. **Deleted reviews remain visible to the seller** (marked as deleted) but
   disappear from the public product page.
5. **Un-deleting is Super Admin only.** Sellers and admins cannot restore
   a deleted review.
6. **Buyer sees the reply** on the public product page under the review body,
   styled with a primary-colored right border.
7. **No seller-side delete endpoint.** `DELETE /api/reviews/[id]` was removed; the only
   user-facing moderation path is the support ticket described above.

## Notifications
No new notification type was added for replies. If a seller replies to a review, the buyer
is **not** currently notified. This could be added later via a new trigger
on `reviews.seller_replied_at` that creates a `notifications` row for the
buyer with `category='review'`.

Opening a review-deletion ticket uses the existing `support_ticket_opened` notification to
staff with `support.read`.

## UI flow
1. Seller opens `/seller/reviews`.
2. Sees stats card at top (avg, distribution).
3. Filters row below (product dropdown, rating dropdown, two checkboxes).
4. List of review cards:
   - Product link + stars + date + "verified buyer" tag.
   - Review body.
   - Existing reply (if any) in a bordered box.
   - Actions: reply / edit reply / delete reply / **request review deletion**.
5. Clicking "reply" opens an inline textarea. Save calls
   `POST /api/seller/reviews/[id]/reply`.
6. Clicking "request review deletion" opens a reason field and calls
   `POST /api/support/tickets` with `review_id`; the server attaches `product_id` and
   `order_item_id`. The seller sees a confirmation that admin review is pending.
7. Admin/Staff opens the ticket, reviews the linked review and any buyer cases, then uses the
   admin-only deletion control with a mandatory reason.

## Security considerations
- The `seller_reviews_view` is SECURITY INVOKER, so it inherits RLS from
  the underlying `reviews` and `products` tables. A seller querying the
  view cannot see other sellers' reviews because the products join filters
  them out via RLS.
- `replyToReview` service double-checks `seller_id === user.id` before
  updating, even though the trigger would also block it.
- The reply trigger uses `is_admin_or_above()` so admins can also reply
  on behalf of sellers if needed (e.g. for an abandoned shop).
- The ticket API re-resolves `product_id` and `order_item_id` from the review server-side;
  a client cannot choose arbitrary IDs.
- The delete RPC re-checks ticket ownership/linkage and buyer-case status inside the
  database, so bypassing the UI does not grant deletion rights.
- Every deletion writes `review.deleted_from_ticket` to the append-only `audit_logs`.

## Future enhancements
- Buyer notification when seller replies (new trigger).
- Pagination (currently limited to 200 reviews).
- Export reviews to CSV for analytics.
- Review helpfulness votes from other buyers.
