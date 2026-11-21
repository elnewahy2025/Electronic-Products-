# Notification System

## Data model
`notifications` extends with:
- `category`: `general | purchase | code | download | compensation | system`
- `link`: deep-link URL the user navigates to on click
- `data`: JSONB with type-specific payload (e.g. `{ "reason": "..." }`)

Indexes:
- `(user_id, created_at DESC) WHERE read_at IS NULL` — fast unread queries
- `(user_id, category, created_at DESC)` — fast filtered lists

## Automated notifications (triggers)

| Trigger | Event | Recipient | Category |
|---|---|---|---|
| `trg_notify_purchase_approved` | `purchase_requests.status → approved` | buyer | purchase |
| `trg_notify_purchase_rejected` | `purchase_requests.status → rejected` | buyer | purchase |
| `trg_notify_code_delivered` | `purchase_codes.delivered_at` set | buyer | code |
| `trg_notify_compensation_decided` | `compensation_requests.status → rejected/fulfilled` | buyer | compensation |

Guests without `buyer_id` never receive notifications — no user to attach them to.

## Manual API operations
- `GET /api/notifications?filter=<all|unread|category>&limit=<n>` — list
- `POST /api/notifications/[id]/read` — mark single as read (owner only, idempotent)
- `POST /api/notifications/mark-all-read` — mark all as read for current user
- `GET /api/notifications/unread-count` — used by the bell badge

## UI

- **Header bell** (`NotificationBell`): polled every 45s, shows unread count.
  Re-fetches on route change so clicking through → marking read → count drops.
- **`/account/notifications`**: list with filter tabs (visible categories adapt
  per account type), unread highlighted with primary-tinted background,
  relative timestamps, links navigate to the target and mark read in background.
- **Mark all read** button uses a Server Action for atomicity and instant revalidation.

## Security
- All notifications are scoped to `user_id = auth.uid()` via RLS.
- `mark_all_notifications_read()` is a `SECURITY DEFINER` function that only
  touches the caller's own rows (`WHERE user_id = auth.uid()`).
- `markNotificationRead(id)` API filters by both `id` AND `user_id`, preventing
  cross-user modifications.

## Retention
Notifications are kept indefinitely by default. If needed later, add a scheduled
job that deletes `read_at IS NOT NULL AND created_at < now() - interval '90 days'`.
