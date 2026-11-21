# Seller Reviews Management

## Overview
The seller reviews page (`/seller/reviews`) gives each seller:
- Aggregate rating stats (average + distribution)
- Per-product review counts
- Filter by product / rating / unreplied
- Reply to reviews (add, edit, delete own reply)
- Delete reviews (with mandatory reason)

## Data model additions (migration 028)
Three columns on `reviews`:
- `seller_reply TEXT`
- `seller_replied_at TIMESTAMPTZ`
- `seller_replied_by UUID` (FK to profiles)

Plus:
- `seller_reviews_view` — SECURITY INVOKER view that joins reviews with
  products and enforces `seller_id` filtering via RLS
- `seller_review_stats(p_seller_id)` — returns per-product aggregates
  (total, avg, 1-5 distribution, replied count)

## Permissions
- **View**: seller sees only their own products' reviews (via view + RLS).
- **Reply**: seller owns product → `restrict_review_reply` trigger verifies.
- **Delete**: seller owns product → enforced by `delete_review()` RPC
  (checks `seller_id = auth.uid()`).

## Business rules
1. **One reply per review.** Sellers edit or delete their reply, they don't
   stack multiple replies.
2. **Reply length ≤ 2000 chars.** Enforced in trigger + API.
3. **Seller cannot edit the review itself.** Only the reply fields are
   mutable. Rating/body are locked by `restrict_review_updates` trigger
   (from migration 027).
4. **Deleted reviews remain visible** to the seller (marked as deleted) but
   disappear from the public product page.
5. **Un-deleting is Super Admin only.** Sellers and admins cannot restore
   a deleted review.
6. **Buyer sees the reply** on the public product page under the review body,
   styled with a primary-colored right border.

## Notifications
No new notification types added. If a seller replies to a review, the buyer
is **not** currently notified. This could be added later via a new trigger
on `reviews.seller_replied_at` that creates a `notifications` row for the
buyer with `category='review'`.

## UI flow
1. Seller opens `/seller/reviews`.
2. Sees stats card at top (avg, distribution).
3. Filters row below (product dropdown, rating dropdown, two checkboxes).
4. List of review cards:
   - Product link + stars + date + "verified buyer" tag.
   - Review body.
   - Existing reply (if any) in a bordered box.
   - Actions: reply / edit reply / delete reply / delete review.
5. Clicking "reply" opens an inline textarea. Save calls
   `POST /api/seller/reviews/[id]/reply`.
6. Clicking "delete review" opens a reason input. Confirm calls
   `DELETE /api/reviews/[id]` (existing endpoint).

## Security considerations
- The `seller_reviews_view` is SECURITY INVOKER, so it inherits RLS from
  the underlying `reviews` and `products` tables. A seller querying the
  view cannot see other sellers' reviews because the products join filters
  them out via RLS.
- `replyToReview` service double-checks `seller_id === user.id` before
  updating, even though the trigger would also block it.
- The reply trigger uses `is_admin_or_above()` so admins can also reply
  on behalf of sellers if needed (e.g., for an abandoned shop).

## Future enhancements
- Buyer notification when seller replies (new trigger).
- Pagination (currently limited to 200 reviews).
- Export reviews to CSV for analytics.
- Review helpfulness votes from other buyers.
