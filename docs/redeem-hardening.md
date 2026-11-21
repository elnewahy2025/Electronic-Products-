# Redeem Endpoint — Hardening Notes

## Problem summary
The original `/api/redeem` had three issues:
1. **RLS gap**: guests (not logged in) couldn't redeem because
   `buyer_owns_code(id)` returns false when `auth.uid()` and `auth.email()`
   are NULL. The API silently returned 404 for both "wrong code" and
   "not your code".
2. **No rate limiting**: brute-force attempts against the 16-character code
   were unthrottled.
3. **No audit trail**: failed attempts left no trace.
4. **RPC weakness**: `redeem_code(uuid)` didn't verify ownership or delivery
   status internally — any authenticated user who knew a `code_id` could
   attempt redemption.

## Fix approach
1. **Require authentication** — `/redeem` now redirects guests to `/login?next=/redeem`.
   Guests must have an account whose email matches `customer_email`.

2. **Use admin client for lookup** — the API queries `purchase_codes` by hash
   via `createAdminClient()` (bypasses RLS), then verifies ownership via
   the `buyer_owns_code` RPC before proceeding. This preserves the security
   boundary but avoids the RLS chicken-and-egg problem.

3. **Rate limits** (per 15-minute window, failed attempts only):
   - Per user: 5 failures
   - Per IP: 15 failures
   - Success resets the pressure (doesn't count)
   - Rate-limit rejections themselves don't count toward the limit

4. **Audit trail** — every attempt (success, failure, rate-limited) is
   logged in `redeem_attempts` with IP, user_id, email, code_hash_prefix,
   and result. Only `super_admin` can read via `/admin/redeem-attempts`.

5. **RPC hardening** — `redeem_code` now checks:
   - `buyer_owns_code(p_code_id)` — must be true
   - `delivered_at IS NOT NULL` — must be delivered
   - `expires_at > now()` — not expired
   - `code_redemptions` row absent — not already redeemed
   - `status <> 'revoked'`

6. **Client input normalization** — accepts codes with or without hyphens,
   auto-formats to `XXXX-XXXX-XXXX-XXXX`, uppercase, strips whitespace.
   Malformed input returns `INVALID_CODE_FORMAT` before any DB query.

## Threat model coverage
| Threat | Mitigation |
|---|---|
| Brute force (single user) | 5 failures / 15 min per user |
| Brute force (botnet) | 15 failures / 15 min per IP + 5 per user |
| Cross-account redemption | `buyer_owns_code` ownership check |
| Insider guessing | RPC + API both verify; audit trail |
| Redeemed-before-delivered exploit | `delivered_at IS NOT NULL` check |
| Replay after success | `code_redemptions` UNIQUE constraint |
| Audit tampering | `redeem_attempts` no UPDATE/DELETE policy; only service_role inserts |

## What's still NOT covered (future work)
- **Distributed IPs botnet**: rate limiting is per-IP; a large botnet with
  distinct IPs could still try 5 attempts/user. Combined with 16-char alphabet
  (~1.1 trillion combos), even at 100 attempts/second it takes ~350 years.
  Not a practical threat.
- **CAPTCHA**: not needed given the above math, but can be added if abuse
  is observed.
- **Email verification enforcement**: if a user registers with an unverified
  email that happens to match a purchase's `customer_email`, they can redeem.
  Consider requiring `email_verified_at IS NOT NULL` in `buyer_owns_code`.
