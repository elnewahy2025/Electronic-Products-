# Admin Notifications

## Overview
Staff members (admin, super_admin, staff) receive notifications for events that
require their attention. These notifications are separate from buyer/seller
notifications via `category = 'admin'`, and are delivered by SQL triggers so
no application code is needed to fire them.

## Events that notify staff

| Trigger | Fires on | Recipients | Category | Link |
|---|---|---|---|---|
| `trg_notify_admins_new_seller` | `seller_profiles` INSERT with `status='pending'` | staff with `seller.approve` | admin | `/admin/sellers/{id}` |
| `trg_notify_admins_new_payout` | `seller_payouts` INSERT with `status='requested'` | staff with `payout.approve` | admin | `/admin/payouts` |
| `trg_notify_admins_quarantine` | `quarantine_records` INSERT | staff with `file.quarantine` | admin | `/admin/quarantine` |
| `trg_notify_admins_compensation` | `compensation_requests` INSERT | staff with `download.compensation.approve` | admin | `/admin/compensation` |
| `trg_notify_admins_exception` | `attempt_exception_requests` INSERT | all staff | admin | `/admin/exceptions` |
| `trg_notify_purchase_approved` (from 023) | `purchase_requests` INSERT | all staff | admin | `/admin/requests` |

**Self-exclusion:** each trigger passes `auth.uid()` to
`notify_staff_with_permission(..., p_exclude_user)` so staff aren't notified
about their own actions.

**Permission-based distribution:** only staff whose role or individual grants
include the relevant permission receive the notification. This prevents noise
for staff who can't act on the event.

## Helper function

`notify_staff_with_permission(p_permission, p_type, p_category, p_title, p_body, p_link, p_data, p_exclude_user)`

- `p_permission = NULL` → notify all active staff.
- `p_permission = '<code>'` → notify only staff with that permission
  (via role or individual grant).
- `p_exclude_user` → skip that user (usually `auth.uid()`).
- Returns the count of notifications inserted.
- `SECURITY DEFINER`, `REVOKE`d from PUBLIC; only triggers and `service_role`
  can call it.

## UI: `/notifications`

A single top-level route accessible to any logged-in user (buyer, seller,
staff). The layout is role-agnostic; the visible tabs depend on
`visibleCategoriesFor(accountType)`.

**Staff-specific enhancement:** a banner at the top shows live counts of
pending items across four areas (purchase requests, seller applications,
payouts, quarantined files), each linked to its admin page. This is a
snapshot from the DB, not from notifications — so it reflects the current
state even if notifications were cleared.

**Bell in header:** links to `/notifications` for all users. Polls unread
count every 45 seconds.

## Backfill
Migration 030 includes:
```sql
UPDATE notifications SET category = 'admin'
WHERE type = 'purchase_request_created' AND category = 'general';
```
so old purchase-request notifications get reclassified.

## Not covered (future)
- Email digest of pending items (daily/weekly)
- Sound/desktop notifications
- Two-person approval for critical actions
- Per-staff notification preferences (mute certain categories)
- Realtime push (currently polling every 45s)
