# Security Review — Findings & Fixes

## Audit scope
- All RLS policies (migrations 001–026)
- All API route handlers
- All `SECURITY DEFINER` functions
- Field-level authorization on sensitive tables
- Rate limiting and audit trails

## Findings & remediation

### Critical: Unprotected admin RPCs
**Finding:** 20+ `SECURITY DEFINER` functions granted to `authenticated`
without internal permission checks. Any logged-in user could call them
via PostgREST.

**Fix:** Every admin RPC now starts with an explicit permission check in `027_security_hardening.sql`, and service-only RPCs (`record_successful_attempt`, `mark_session_completed`, `expire_partial_session`, `pick_drive_account`, `update_drive_quota`) have `EXECUTE` revoked from `authenticated`.
