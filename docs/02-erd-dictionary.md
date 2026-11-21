# ERD وقاموس البيانات — منصة المنتجات الرقمية
الإصدار: 1.0 — 21 نوفمبر 2026

## الاصطلاحات
- مفاتيح: UUID مع gen_random_uuid()
- طوابع: TIMESTAMPTZ UTC
- المال: NUMERIC(18,4) + currency CHAR(3)
- الحذف: لا فيزيائي للكيانات الحساسة
- RLS مفعّل على كل الجدول

## خريطة ERD
(انظر مخطط mermaid في الملحق الكامل — يُلصق في أي محرر يدعم mermaid)

## جداول الهوية والأدوار
### profiles
- id UUID PK
- auth_provider ENUM(google,password,both)
- email CITEXT UNIQUE NOT NULL
- email_verified_at TIMESTAMPTZ
- phone TEXT
- full_name TEXT
- avatar_url TEXT
- account_type ENUM(buyer,seller,staff)
- status ENUM(active,suspended,deleted)
- mfa_enabled BOOLEAN
- mfa_secret_encrypted TEXT
- mfa_enforced BOOLEAN
- last_login_at TIMESTAMPTZ
- created_at, updated_at

### seller_profiles
- profile_id UUID PK FK→profiles ON DELETE RESTRICT
- display_name TEXT NOT NULL
- bio TEXT
- avatar_url TEXT
- status ENUM(pending,approved,rejected,suspended)
- agreement_accepted_at TIMESTAMPTZ
- agreement_version TEXT
- approved_by, approved_at
- rejected_by, rejected_at, rejection_reason
- suspended_by, suspended_at, suspension_reason
- created_at, updated_at
- INDEX (status)

### seller_drive_accounts
- id UUID PK
- seller_id UUID FK→seller_profiles
- google_account_email CITEXT
- encrypted_refresh_token TEXT
- scopes TEXT[]
- status ENUM(active,revoked,quota_exceeded)
- quota_total, quota_used BIGINT
- last_checked_at TIMESTAMPTZ
- is_default BOOLEAN
- priority INT
- UNIQUE(seller_id, google_account_email)

### roles, permissions, role_permissions, store_members, member_permissions
- roles: id, code UNIQUE, name
  - القيم: super_admin, admin, staff
- permissions: id, code UNIQUE, description
- role_permissions: role_id, permission_id (PK مركّب)
- store_members: profile_id PK, role_id, granted_at, granted_by, status
- member_permissions: member_id, permission_id, granted_by, expires_at

## جداول المنتجات
### categories
- id, parent_id, name, slug UNIQUE, sort_order, is_active, created_at

### products
- id UUID PK
- seller_id FK
- category_id FK
- title, slug UNIQUE, short_description, description
- price_amount NUMERIC(18,4)
- price_currency CHAR(3)
- status ENUM(draft,published,paused,suspended,rejected,deleted,archived)
- rejection_reason, suspension_reason
- min_price_checked_at
- published_at, deleted_at
- created_at, updated_at
- INDEX (status, published_at DESC), (seller_id, status)
- GIN(to_tsvector(title || description)) للبحث

### product_versions
- id UUID PK
- product_id FK ON DELETE RESTRICT
- version_number INT
- status ENUM(draft,published,archived)
- published_at, created_at
- UNIQUE(product_id, version_number)
- قاعدة: إصدار مرتبط بـorder_items لا يُحذف

### files
- id, seller_id, original_name, display_name, mime, extension, created_at

### file_versions
- id UUID PK
- file_id FK ON DELETE RESTRICT
- version_number INT
- storage_location_id UUID
- size_bytes BIGINT
- checksum_sha256 TEXT
- mime, extension
- scan_status ENUM(uploading,uploaded,scanning,quarantined,processing,ready,failed,deleted,backup_only)
- created_at
- UNIQUE(file_id, version_number)

### product_version_files
- id, product_version_id FK, file_version_id FK
- display_name, sort_order, included_in_zip BOOLEAN
- UNIQUE(product_version_id, file_version_id)

### file_storage_locations
- id, provider ENUM(google_drive,r2,s3)
- seller_drive_account_id FK
- provider_file_id, provider_folder_id, internal_path
- status, created_at

### file_previews
- id, file_version_id, preview_type ENUM(image,video,document)
- storage_location_id, quality ENUM(low,medium,high)
- watermark_text, watermark_applied BOOLEAN
- status, created_at, generated_by

### upload_sessions
- id, seller_id, file_id, provider, provider_upload_url
- status, bytes_uploaded, total_bytes, expires_at, created_at

### scan_jobs
- id, file_version_id, status ENUM(queued,running,passed,failed,quarantined)
- engine, result JSONB, queued_at, started_at, finished_at

### quarantine_records
- id, file_version_id, reason, quarantined_by, quarantined_at
- released_at, released_by, notes

### allowed_file_types
- id, extension, mime, is_enabled, max_size_bytes, updated_by, updated_at

### tags, product_tags
- tags: id, name, slug UNIQUE
- product_tags: product_id, tag_id (PK مركّب)

## جداول الطلبات والأكواد
### purchase_requests
- id UUID PK
- buyer_id UUID NULL
- customer_email, customer_phone
- status ENUM(created,pending,approved,rejected,cancelled,completed)
- total_amount, currency
- exchange_rate_at_purchase NUMERIC(18,8)
- amount_in_usd NUMERIC(18,4)
- cancelled_by, cancel_reason, cancelled_at
- created_at, updated_at
- قاعدة: لا Cancelled بعد وجود كود Delivered

### purchase_request_items
- id, purchase_request_id, product_id, product_version_id
- unit_price, currency, quantity

### orders
- id, purchase_request_id FK ON DELETE RESTRICT
- buyer_id, status
- total_amount, currency, amount_in_usd
- exchange_rate_at_purchase
- created_at

### order_items
- id, order_id, product_id, product_version_id FK ON DELETE RESTRICT
- price, currency, created_at

### purchase_codes
- id UUID PK
- order_item_id FK ON DELETE RESTRICT
- code_hash TEXT UNIQUE NOT NULL
- code_prefix CHAR(4)
- status ENUM(issued,delivered,redeemed,expired,revoked)
- issued_by, issued_at
- delivered_at, delivered_by
- delivery_confirmation_method ENUM(auto,manual)
- redeemed_at
- expires_at TIMESTAMPTZ
- revoked_at, revoked_by, revoke_reason
- replacement_for_code_id UUID NULL
- replacement_reason TEXT
- created_at
- UNIQUE(code_hash)
- CHECK(status <> 'revoked' OR delivered_at IS NULL)
- CHECK(expires_at = issued_at + interval '72 hours') — عبر trigger

### code_redemptions
- id, code_id UUID FK ON DELETE RESTRICT
- redeemed_by, redeemed_at, ip, user_agent, session_id
- UNIQUE(code_id) — تفعيل مرة واحدة

### code_delivery_attempts
- id, code_id, channel ENUM(email,sms,manual)
- sent_at, sent_by, result ENUM(sent,failed), error

### download_sessions
- id UUID PK
- code_id UUID FK ON DELETE RESTRICT
- order_item_id UUID FK
- product_version_id UUID FK
- buyer_id UUID NULL
- status ENUM(active,completed,expired,expired_partial,exhausted,compensation_pending,compensation_active,revoked)
- started_at, expires_at, ended_at
- is_compensation BOOLEAN
- parent_session_id UUID NULL FK
- compensation_request_id UUID NULL
- attempt_consumed BOOLEAN
- revocation_suggested_by_system BOOLEAN
- revocation_confirmed_by, revocation_reason, revoked_at
- created_by, created_at
- CHECK(status <> 'revoked' OR started_at IS NOT NULL AND NOT EXISTS(delivery)) — عبر trigger

### download_tokens
- id, session_id FK ON DELETE CASCADE
- token_hash UNIQUE
- scope ENUM(single,zip)
- file_version_id NULL
- expires_at, used_at, created_at

### download_attempts
- id, order_item_id FK ON DELETE RESTRICT
- session_id
- attempt_number INT
- type ENUM(zip,single_files)
- consumed_at, completed BOOLEAN
- UNIQUE(order_item_id, attempt_number)

### download_deliveries
- id, session_id FK ON DELETE CASCADE
- file_version_id FK ON DELETE RESTRICT
- delivery_type ENUM(single,zip)
- delivered_at, bytes_sent, checksum
- completed BOOLEAN, failure_reason
- UNIQUE(session_id, file_version_id) WHERE completed = true

### compensation_requests
- id UUID PK
- code_id UUID FK→purchase_codes
- original_session_id UUID FK
- status ENUM(pending,approved,rejected,fulfilled,cancelled)
- reason TEXT NOT NULL
- admin_reason TEXT (يظهر عند الرفض فقط)
- requested_by, requested_at
- decided_by, decided_at
- approved_session_id UUID NULL
- sequence_number INT NOT NULL
- UNIQUE(code_id, sequence_number)
- CHECK(sequence_number BETWEEN 1 AND 3)

### attempt_exception_requests
- id, code_id FK→purchase_codes, session_id
- status ENUM(pending,approved,rejected,fulfilled)
- reason NOT NULL
- decision_reason
- granted_attempts INT
- requested_by, decided_by, decided_at, created_at
- CHECK(granted_attempts > 0) عند approved

## جداول المالية
### exchange_rates
- id, base_currency, quote_currency
- rate NUMERIC(18,8)
- set_by, set_at, effective_at
- UNIQUE(base_currency, quote_currency, effective_at)

### seller_commissions
- id, seller_id
- scope ENUM(global,product_type,category)
- reference_id
- rate NUMERIC(5,4)
- effective_from, effective_to

### seller_wallets
- id, seller_id, currency
- balance NUMERIC(18,4)
- updated_at
- UNIQUE(seller_id, currency)

### financial_transactions
- id, wallet_id
- type ENUM(earning,commission,payout,adjustment)
- amount, currency
- reference_type, reference_id
- created_at

### seller_payouts
- id, seller_id
- amount, currency, amount_in_usd
- status ENUM(requested,approved,rejected,paid)
- requested_at, decided_by, decided_at, paid_at
- method, reference

### payments (معطّل في المرحلة الأولى)
- بنية موجودة فقط، غير مفعّلة

## جداول التفاعل والإدارة
### reviews
- id UUID PK
- product_id FK ON DELETE RESTRICT
- buyer_id FK ON DELETE RESTRICT
- order_item_id FK
- rating SMALLINT CHECK(1..5)
- body TEXT
- status ENUM(published,deleted)
- deleted_by, delete_reason, deleted_at
- created_at
- UNIQUE(product_id, buyer_id)

### favorites
- buyer_id, product_id (PK مركّب)

### content_reports
- id, reporter_id, entity_type, entity_id
- reason
- status ENUM(open,resolved,dismissed)
- resolved_by, resolved_at, resolution_note

### support_tickets, support_messages, notifications
- بنية قياسية

### audit_logs (Append-only)
- id BIGSERIAL PK
- actor_id UUID NULL
- actor_role TEXT
- action TEXT
- entity_type, entity_id
- before_value, after_value JSONB
- reason TEXT
- ip, user_agent, request_id
- created_at TIMESTAMPTZ
- حماية: لا UPDATE ولا DELETE لأي دور
- الكتابة عبر دالة SECURITY DEFINER فقط

### audit_archives
- id, period_start, period_end
- storage_location, checksum
- archived_at, archived_by, records_count

### security_events
- id, type, actor_id, ip, user_agent
- severity, details JSONB, created_at

### backup_jobs
- id, type ENUM(auto,manual)
- status
- started_at, finished_at
- size_bytes, storage_location, error
- triggered_by

### backup_archives
- id, backup_job_id
- period_start, period_end
- storage_location, checksum
- created_at

### restore_jobs
- id, backup_archive_id, status
- started_at, finished_at, error
- performed_by

### retention_policies
- id, entity, retention_days
- action ENUM(archive,delete)
- updated_by, updated_at

## القيود الفريدة الأساسية
| القيد | الجدول | الغرض |
|---|---|---|
| UNIQUE(code_hash) | purchase_codes | منع كود مشابه |
| UNIQUE(code_id) | code_redemptions | تفعيل مرة واحدة |
| UNIQUE(order_item_id, attempt_number) | download_attempts | عدم تجاوز 3 |
| UNIQUE(session_id, file_version_id) WHERE completed | download_deliveries | منع إعادة تسليم مكتمل |
| UNIQUE(code_id, sequence_number) + CHECK 1..3 | compensation_requests | سقف 3 تعويضات |
| UNIQUE(product_id, buyer_id) | reviews | تقييم واحد نهائيًا |
| UNIQUE(product_id, version_number) | product_versions | تسلسل إصدارات |
| UNIQUE(file_id, version_number) | file_versions | تسلسل نسخ الملف |
| UNIQUE(seller_id, google_account_email) | seller_drive_accounts | عدم تكرار Drive |
| UNIQUE(product_version_id, file_version_id) | product_version_files | عدم تكرار الملف |

## سياسات الحذف
| العلاقة | السلوك |
|---|---|
| products → product_versions | RESTRICT |
| product_versions → order_items | RESTRICT |
| file_versions → order_items | RESTRICT |
| purchase_codes → code_redemptions | RESTRICT |
| download_sessions → download_deliveries | CASCADE |
| download_sessions → download_tokens | CASCADE |
| profiles → seller_profiles | RESTRICT |
| audit_logs | لا حذف إطلاقًا |

## آلات الحالة
| الكيان | الانتقالات المسموحة | الممنوعة صراحةً |
|---|---|---|
| purchase_codes | issued→delivered→redeemed→expired، issued→revoked | delivered→revoked، redeemed→revoked |
| purchase_requests | created→pending→approved→completed، created/pending→cancelled | approved→cancelled بعد delivered |
| download_sessions | active→completed/expired/expired_partial/exhausted، compensation_pending→compensation_active→...، active→revoked قبل التسليم فقط | →revoked بعد بدء التسليم |
| file_versions | uploading→uploaded→scanning→processing→ready، scanning→quarantined | ready→deleted إذا مرتبط ببيع |
| products | draft→published→paused/suspended/archived | deleted إذا له order_items |