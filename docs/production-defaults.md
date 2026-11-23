# Production Defaults — Super Admin Setup Runbook

> **STATUS: PRE-LAUNCH RUNBOOK. VALUES BELOW ARE PROPOSED, NOT YET APPLIED IN PRODUCTION.**
>
> Perform these steps with the designated Super Admin account after the final migration run.
> Every change must be made through the admin UI (or an authorised server path) so that the
> settings trigger writes `before_value`/`after_value` to `audit_logs`. Do not edit singleton
> rows directly in the SQL editor as a routine operation.

## 1. Where values are configured

| Setting | UI location | Storage / source of truth |
|---|---|---|
| `min_product_price`, `min_product_price_currency` | `/admin/settings` → **Pricing** tab | `pricing_settings` row `id = 1` (`009_settings.sql`) |
| `default_currency`, `allowed_currencies`, `platform_name`, contact details, timezone | `/admin/settings` → **General** tab | `general_settings` row `id = 1` |
| `session_duration_hours`, `max_attempts_per_product`, `code_validity_hours`, `partial_session_new_duration_hours` | `/admin/settings` → **Download** tab | `download_settings` row `id = 1` |
| `max_sessions_per_product`, compensation duration/approval flags | `/admin/settings` → **Compensation** tab | `compensation_settings` row `id = 1` |
| `minimum_amount`, `minimum_currency`, payout methods | `/admin/settings` → **Payout** tab | `payout_settings` row `id = 1` |
| `default_rate`, override flags | `/admin/settings` → **Commission** tab | `commission_settings` row `id = 1` |
| `mfa_enforced_roles`, rate limits, session idle timeout | `/admin/settings` → **Security** tab | `security_settings` row `id = 1` — `mfa_enforced_roles` is immutable after initial setup (`settings_immutable_fields` trigger) |
| `append_only_enforced`, audit retention, archive action | `/admin/settings` → **Audit** tab | `audit_settings` row `id = 1` — `append_only_enforced` is immutable |
| Backup schedule, retention, provider, restore-test frequency | `/admin/settings` → **Backup** tab | `backup_settings` row `id = 1` |
| Exchange rates | `/admin/exchange-rates` form → `POST /api/admin/exchange-rates` | `exchange_rates` (`base_currency = 'USD'`, `quote_currency` = target); `get_usd_rate` handles both directions (`023_purchase_request_creation.sql`) |

All settings tables are singletons (`id SMALLINT PRIMARY KEY CHECK (id = 1)`), writable only
by Super Admin, and each update is audited. Staff and Admin cannot change settings, roles or
exchange rates.

---

## 2. Proposed launch values

### 2.1 Pricing and finance

| Setting | Proposed production value | Status |
|---|---|---|
| `pricing_settings.min_product_price` | `1.0000` | Proposed; confirm with business owner. DB default is `0`, which must not be left in production. |
| `pricing_settings.min_product_price_currency` | `USD` | Proposed. |
| `general_settings.default_currency` | `USD` | Matches product rules. |
| `general_settings.allowed_currencies` | `EGP, KWD, SAR, USD` | Matches product rules. |
| `payout_settings.minimum_amount` | `100.0000` | Fixed product requirement. |
| `payout_settings.minimum_currency` | `USD` | Fixed product requirement. |
| `commission_settings.default_rate` | Confirm with finance before launch; do not invent a value here | Open decision. |

### 2.2 Exchange rates — illustrative launch defaults

Rates are stored as **USD → quote currency** (e.g. `1 USD = 3.75 SAR`). The platform locks
the rate at purchase time; changing rates later does not alter existing orders.

| `base_currency` | `quote_currency` | Proposed `rate` | Note |
|---|---|---|---|
| USD | USD | 1.00000000 | Identity pair. |
| USD | EGP | 48.50000000 | Illustrative only; refresh from a live provider on setup day. |
| USD | SAR | 3.75000000 | Illustrative only; SAR is conventionally pegged, still confirm. |
| USD | KWD | 0.30600000 | Illustrative only; high precision matters (column is `numeric(18,8)`). |

Do not use these sample numbers if the finance owner supplies different rates. Confirm that
`get_usd_rate('EGP')` returns a usable value (direct EGP→USD row or inverse USD→EGP row).

### 2.3 Download and compensation

| Setting | Proposed production value | Source of truth |
|---|---|---|
| `download_settings.session_duration_hours` | `4` | Product rule (`docs/01-requirements-final.md`, section 6) |
| `download_settings.partial_session_new_duration_hours` | `4` | Product rule |
| `download_settings.max_attempts_per_product` | `3` | Product rule |
| `download_settings.code_validity_hours` | `72` | Product rule |
| `compensation_settings.max_sessions_per_product` | `3` | Product rule |
| `compensation_settings.session_duration_hours` | `4` | Proposed |
| `compensation_settings.requires_admin_approval` | `true` | Product rule |
| `compensation_settings.reason_required` | `true` | Product rule |
| `attempt_exception_settings.super_admin_only` | `true` | Product rule |
| `attempt_exception_settings.warning_threshold` | `5` | Proposed default in migration `009` |
| `attempt_exception_settings.reason_required` | `true` | Product rule |

### 2.4 Security, audit and backup

| Setting | Proposed production value | Note |
|---|---|---|
| `security_settings.mfa_enforced_roles` | `{super_admin,admin,staff}` | Must be correct at first write; immutable afterwards. |
| `audit_settings.append_only_enforced` | `true` | Must be correct at first write; immutable afterwards. |
| `audit_settings.retention_days` | `180` | Live retention; then `audit_archives`. |
| `security_settings.session_idle_timeout_minutes` | `60` | Proposed. |
| `security_settings.login_rate_limit_per_hour` | `20` | Proposed; align with `docs/plan-limits.md`. |
| `security_settings.code_rate_limit_per_hour` | `10` | Proposed. |
| `backup_settings.schedule` | `weekly` | Migration `037` runner supports `daily`/`weekly`/`manual_only`. |
| `backup_settings.retention_days` | `90` | Proposed; align with backup bucket lifecycle. |
| `backup_settings.storage_provider` | `r2` or `s3` | Only after the independent bucket is provisioned (`docs/backup-storage-config.md`). |
| `backup_settings.encryption_enabled` | `true` | Required. |
| `backup_settings.restore_test_frequency_days` | `30` | Proposed. |
| `backup_settings.include_files` | Confirm before enabling | Original files are in seller Drive accounts; see legal review. |

---

## 3. Setup order (run once, in this order)

1. Log in as Super Admin and complete TOTP enrollment. Confirm no admin/staff account is
   active without MFA.
2. `/admin/settings` → **General**: platform name, public contact email/phone, timezone
   (`Africa/Cairo`), `default_currency = USD`, `allowed_currencies = EGP,KWD,SAR,USD`.
3. `/admin/settings` → **Pricing**: set `min_product_price = 1` USD.
4. `/admin/exchange-rates`: add the four USD-based pairs in section 2.2 with a single
   effective date; verify `get_usd_rate` for each target currency.
5. `/admin/settings` → **Download**, **Compensation**: apply section 2.3.
6. `/admin/settings` → **Payout**, **Commission**: apply section 2.1 and the finance-approved
   commission rate.
7. `/admin/settings` → **Security**, **Audit**, **Backup**: apply section 2.4. `mfa_enforced_roles`
   and `append_only_enforced` cannot be edited after the first write — verify before saving.
8. Confirm every write produced a `settings.updated` audit row with the real Super Admin
   `actor_id` (not a placeholder).
9. Record the applied values, who applied them, and the timestamp in the launch log.

---

## 4. Verification SQL (read-only)

Run as a Super Admin/operator with read access to the settings tables. These queries verify
state; they do not modify data.

```sql
-- 1a. General settings
SELECT default_currency, allowed_currencies, platform_name,
       platform_contact_email, timezone, maintenance_mode
  FROM general_settings WHERE id = 1;

-- 1b. Pricing settings
SELECT min_product_price, min_product_price_currency
  FROM pricing_settings WHERE id = 1;

-- 2. Download, compensation and payout defaults
SELECT d.session_duration_hours, d.partial_session_new_duration_hours,
       d.max_attempts_per_product, d.code_validity_hours,
       c.max_sessions_per_product, c.session_duration_hours,
       c.requires_admin_approval, c.reason_required,
       p.minimum_amount, p.minimum_currency
  FROM download_settings d
  JOIN compensation_settings c ON c.id = 1
  JOIN payout_settings p ON p.id = 1
 WHERE d.id = 1;

-- 3. Exchange rates (latest effective row per pair)
SELECT DISTINCT ON (base_currency, quote_currency)
       base_currency, quote_currency, rate, effective_at, set_at
  FROM exchange_rates
 ORDER BY base_currency, quote_currency, effective_at DESC, set_at DESC;

-- 4. Converted-rate sanity check (expect 1 for USD and > 0 for all others)
SELECT c AS currency, get_usd_rate(c) AS usd_rate
  FROM (VALUES ('USD'::char(3)), ('EGP'::char(3)),
               ('KWD'::char(3)), ('SAR'::char(3))) AS v(c);

-- 5. MFA / audit / backup flags
SELECT s.mfa_enforced_roles, a.append_only_enforced, a.retention_days,
       b.schedule, b.retention_days, b.storage_provider,
       b.encryption_enabled, b.restore_test_frequency_days, b.include_files
  FROM security_settings s
  JOIN audit_settings a ON a.id = 1
  JOIN backup_settings b ON b.id = 1
 WHERE s.id = 1;

-- 6. Administrative accounts must be MFA-enrolled and active
SELECT p.email, p.account_type, p.mfa_enabled, p.status, r.code AS role_code, sm.status AS member_status
  FROM profiles p
  JOIN store_members sm ON sm.profile_id = p.id
  JOIN roles r ON r.id = sm.role_id
 WHERE r.code IN ('super_admin', 'admin', 'staff')
 ORDER BY r.code, p.email;

-- 7. Recent settings changes must be audited with a real actor
SELECT id, actor_id, action, entity_type, before_value, after_value, reason, created_at
  FROM audit_logs
 WHERE action = 'settings.updated'
 ORDER BY created_at DESC
 LIMIT 20;

-- 8. No settings table may have more than one row
SELECT 'general_settings' AS tbl, count(*) FROM general_settings
UNION ALL SELECT 'pricing_settings', count(*) FROM pricing_settings
UNION ALL SELECT 'download_settings', count(*) FROM download_settings
UNION ALL SELECT 'compensation_settings', count(*) FROM compensation_settings
UNION ALL SELECT 'payout_settings', count(*) FROM payout_settings
UNION ALL SELECT 'security_settings', count(*) FROM security_settings
UNION ALL SELECT 'audit_settings', count(*) FROM audit_settings
UNION ALL SELECT 'backup_settings', count(*) FROM backup_settings
UNION ALL SELECT 'compensation_settings', count(*) FROM compensation_settings
UNION ALL SELECT 'attempt_exception_settings', count(*) FROM attempt_exception_settings
UNION ALL SELECT 'commission_settings', count(*) FROM commission_settings;
```

Expected result: every singleton count is `1`; MFA roles are exactly
`{super_admin,admin,staff}`; `append_only_enforced = true`; download values are 4/3/72;
minimum payout is 100 USD; and each of the four exchange-rate pairs has exactly one current
row with a positive rate.

---

## 5. Do not do these

- Do not disable MFA for a single admin to "unblock" a launch task; use the documented
  recovery process approved by security.
- Do not set `min_product_price = 0` to unblock seller onboarding; it is a pricing decision.
- Do not change exchange rates for an existing order — rates are locked at purchase time.
- Do not point `backup_settings.storage_provider` at R2/S3 before the bucket and credentials
  exist and a test upload has been verified.
- Do not modify `audit_logs` to remove a failed test event; the table is append-only by design.
