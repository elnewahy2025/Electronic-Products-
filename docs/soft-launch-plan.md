# Soft Launch Plan — Proposed Phased Rollout

> **STATUS: PROPOSED PLAN. ALL COUNTS, WINDOWS AND THRESHOLDS BELOW ARE PROPOSALS FOR
> BUSINESS/SECURITY SIGN-OFF, NOT APPROVED COMMITMENTS.**
>
> No external deployment is assumed complete. Each gate requires evidence from the actual
> production environment before the next phase starts. Stop criteria override success
> criteria at every stage.

## 1. Goals

1. Validate off-platform payment communication, code issuance and protected delivery under
   real traffic without promising platform refunds.
2. Verify RLS, MFA, append-only audit logging and review-moderation controls under real use.
3. Exercise backup/restore, support and escalation paths before opening to the public.
4. Keep the blast radius small: start with staff and trusted sellers, expand only on evidence.

Reference documents: [`docs/plan-limits.md`](plan-limits.md),
[`docs/production-defaults.md`](production-defaults.md),
[`docs/backup-storage-config.md`](backup-storage-config.md),
[`docs/legal-review-drafts.md`](legal-review-drafts.md).

---

## 2. Phases and proposed sizes

| Phase | Audience | Proposed sellers | Proposed products | Proposed window | Entry gate |
|---|---|---|---|---|---|
| 0 — Internal dry run | Staff + 2 seeded test sellers | 2 | 10 | 3 business days | Migrations through `055` applied; Worker deployed; production defaults set; legal drafts approved for at least internal use; private R2/S3 bucket verified. |
| 1 — Closed pilot | Invited sellers only, no public marketing | 10 | 100 | 2 weeks | Phase 0 success criteria met; support rota staffed; alert routing verified. |
| 2 — Limited public | Public storefront, controlled traffic | 25 | 300 | 2 weeks | Phase 1 success criteria met; no open P0/P1 security issue; rate limits tuned from observed data. |
| 3 — General availability | Open seller applications | Review target 50+ | Review target 600+ | Ongoing | Phase 2 success criteria met; legal sign-off completed and published texts live. |

Proposed order-volume scaling: Phase 1 target 20–50 purchase requests/week; Phase 2 target
100–200/week; do not increase seller count if code-delivery success drops below the
threshold in section 5.

---

## 3. Phase activities

### Phase 0 — Internal dry run (3 business days, proposed)
- Verify every settings value using the queries in `docs/production-defaults.md`.
- Place test orders as guest and registered buyer; confirm guest orders are visible by
  matching email only, and that no other account can see them.
- Redeem codes, download ZIP and individual files, exhaust attempts, expire a session,
  open a compensation request and an attempt exception; verify audit events.
- Attempt prohibited actions: seller deletes a review, seller calls the legacy
  `delete_review` RPC, staff decides an attempt exception, direct `UPDATE`/`DELETE` on
  `audit_logs`; all must fail and be logged.
- Run one backup and one isolated restore drill; confirm checksum and `restore_jobs` entry.
- Confirm the downloaded Worker's signed-token flow: token verification, resolve, stream,
  completion, and failure with no completion call.

### Phase 1 — Closed pilot (2 weeks, proposed)
- 10 invited sellers, 100 products maximum; no public sign-up promotion.
- Daily audit/log review for the first 5 business days, then every 2 business days.
- Review every support ticket, especially structured review-deletion requests with
  `product_id`, `order_item_id`, `review_id`, and every `review.deleted_from_ticket` event.
- Reconcile off-platform payments manually with issued codes daily; confirm the platform
  never records a refund.
- Check Drive quota/token health, Worker egress and outbox backlog against
  `docs/plan-limits.md`.

### Phase 2 — Limited public (2 weeks, proposed)
- Open storefront to visitors; keep seller applications reviewed manually.
- 25 sellers, 300 products maximum; monitor 4-hour windows for the first 48 hours.
- Continue daily audit review; add a weekly permission-drift check (`roles`,
  `role_permissions`, `store_members`, `member_permissions`).
- Run a second restore drill and a review-moderation sampling audit: 100% of deleted reviews
  must have a linked open/pending seller ticket and no blocking buyer case at decision time.

### Phase 3 — General availability (ongoing)
- Keep seller approval manual until the support SLA is stable for 2 consecutive weeks.
- Move to weekly audit review, monthly restore drills and quarterly legal/policy review.
- Revisit all proposed quotas in `docs/plan-limits.md` using observed dashboards.

---

## 4. Monitoring windows and review cadence

| Window | What to inspect | Owner (proposed) |
|---|---|---|
| Real time / 15 min | 5xx rate, code-delivery success, Worker failures, Drive 401/403/429, outbox backlog | On-call engineer |
| Every 4 h (first 48 h of each new phase) | Dashboard thresholds in `docs/plan-limits.md`, open support tickets | Support lead + engineer |
| Daily (first 5 business days, then as shown per phase) | `audit_logs` for `settings.updated`, MFA failures, `*_blocked_after_delivery`, `review.deleted_from_ticket`, `review_delete_requires_ticket`, `buyer_case_*` guard failures | Security/Super Admin |
| Daily (Phases 0–2) | Manual settlement reconciliation vs issued codes; no platform refunds recorded | Finance owner |
| Every 2 days | `backup_jobs`, `restore_jobs`, watchdog alerts, storage growth | Super Admin |
| Weekly | Permission drift, Drive quota, vendor quota dashboards, support SLA | Platform lead |

---

## 5. Proposed success criteria (all must hold to advance)

| Metric | Target |
|---|---|
| Code delivery success (auto/manual confirmation or explicit `skipped`) | ≥ 99% over the phase window |
| Download completion failures (excluding genuine client cancels) | < 2%; no false successful completions |
| Attempt/concurrency integrity | 0 cases of >3 completed attempts or double-delivered file |
| RLS / permission violations | 0 confirmed cross-account reads or writes |
| `audit_logs` append-only violations | 0 (any attempt blocked and logged) |
| MFA enforcement | 100% of active admin/staff accounts MFA-enrolled; 0 admin sessions before enrollment |
| Review moderation | 100% of deletions have a linked seller ticket, mandatory reason and `review.deleted_from_ticket`; 0 seller-initiated deletions |
| Buyer-case protection | 0 deletions while a compensation request, attempt exception or buyer ticket was pending/approved/open |
| Backups | 1 successful backup and 1 successful isolated restore verification per phase |
| Support SLA | ≥ 90% of tickets first-answered within 4 business hours; no ticket older than 2 business days unanswered |
| Legal notices | Mandatory off-platform payment/no-refund statement visible at checkout in approved Arabic wording |
| Public errors | No leaked stack traces, secrets, `code_hash`, Drive tokens or buyer emails of other users |

---

## 6. Stop / rollback criteria (any one triggers a halt)

- Any confirmed data leak, cross-account access, RLS bypass, or audit-log modification.
- Any unauthorised review deletion or a deletion that bypasses the ticket/buyer-case guards.
- Code delivery success < 95% over 1 hour, or > 5% download completion failures over 15 min.
- Any code revoked or purchase cancelled after delivery, or session revoked after delivery
  began, with a successful state change (blocked attempts alone are expected and logged).
- More than 20 `*_blocked_after_delivery` events in 15 minutes without explanation.
- Backup overdue > 24 h, checksum mismatch, or failed restore verification.
- Repeated Drive token failures indicating compromised or revoked seller authorisations at scale.
- Legal review not signed off, or the mandatory off-platform/no-refund statement missing from
  checkout.
- Support queue > 20 open tickets with SLA breach, or a buyer-harm incident that cannot be
  remedied without a platform refund (escalate to counsel and the business owner; do not
  improvise a refund policy in code or copy).

### Rollback actions (Super Admin / on-call)
1. Announce a maintenance window and set `general_settings.maintenance_mode = true` through
   `/admin/settings` if self-service traffic must be stopped immediately.
2. Pause affected products or suspend the affected seller via the existing admin controls.
3. Disable the Worker's signing token / remove the `DOWNLOAD_SERVICE_URL` route from the
   deployment if the streaming path is the fault; signed tokens then stop being issued.
4. Roll back the application release to the previous known-good version; do not roll back
   migrations unless a reviewed migration-repair procedure exists.
5. If data was corrupted, use the documented Super Admin-only restore path with explicit
   confirmation; record the incident in `audit_logs`.
6. Keep append-only audit data intact for the incident review; export a copy for evidence.
7. Re-open the phase only after a written post-incident review and re-verification of the
   success criteria.

---

## 7. Support staffing (proposed)

| Phase | Support | Engineering | Security/Super Admin | Finance |
|---|---|---|---|---|
| 0 | 1 support lead (test tickets) | 1 engineer on call during dry run | 1 Super Admin for approvals and audit review | 1 owner for reconciliation |
| 1 | 1 full-time support (business hours, 4 h first-response target) | 1 engineer on call, 1 h response for P1 | Super Admin review daily | Daily reconciliation |
| 2 | 2 support agents (business hours) | 1 engineer on call + 1 backup | Daily audit review, weekly permission check | Daily reconciliation, weekly report |
| 3 | 2+ support agents, escalation rota | 24/7 on-call rotation target | Weekly review, monthly restore drill | Weekly settlement report |

Support runbook requirements:
- Escalation path: support → engineer on call → Super Admin → business/legal owner.
- Ticket categories include delivery failure, code not received, Drive failure, review
  moderation request (`request review deletion`), suspected abuse, and legal/content report.
- No support agent may promise a monetary refund; the approved script must repeat that
  payment is off-platform and that the Platform issues codes and protected sessions only.
- Every privileged action taken in response to a ticket (session extension, compensation,
  exception, review deletion) must reference the ticket and be visible in `audit_logs`.

---

## 8. Sign-off record (to be completed before Phase 0)

| Role | Name | Phase 0 | Phase 1 | Phase 2 | GA |
|---|---|---|---|---|---|
| Super Admin | — | ☐ | ☐ | ☐ | ☐ |
| Engineering lead | — | ☐ | ☐ | ☐ | ☐ |
| Support lead | — | ☐ | ☐ | ☐ | ☐ |
| Finance owner | — | ☐ | ☐ | ☐ | ☐ |
| Legal counsel | — | ☐ | ☐ | ☐ | ☐ |
