# مصفوفة RLS التفصيلية (Row-Level Security Matrix)

توثّق هذه الوثيقة التصميم الكامل والنهائي لسياسات أمن الصفوف (`Row-Level Security - RLS`)، والدوال المساعدة (`SECURITY DEFINER`)، والعروض الآمنة (`Safe Views`)، ومشغلات الحماية الإلزامية (`Triggers`) عبر جميع جداول قاعدة البيانات، شاملةً كافة تحديثات التحصين الأمني والأداء في الترحيلات `027` و`028` و`031` و`032`.

---

## 1) المبادئ العامة

| المبدأ | التطبيق |
|---|---|
| **Deny by default** | `RLS` مفعّل على كل جدول (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)، وأي جدول بلا سياسة صريحة = الوصول مرفوض بالكامل |
| **Service role** | `service_role` يتجاوز `RLS`، ويُستخدم فقط في الخادم (`createAdminClient()`) للعمليات النظامية بعد تحقق منطقي صارم |
| **تحقق مزدوج** | `RLS` + فحص صلاحيات داخلي في كل دالة `SECURITY DEFINER` + تحقق خادمي (`requirePerm` / `requireRole`) قبل أي عملية حساسة |
| **`auth.uid()`** | مصدر الهوية الوحيد داخل قاعدة البيانات؛ لا يُقبل معرف الفاعل من العميل |
| **الأدوار** | `anon` / `authenticated` (`buyer`, `seller`, `staff`, `admin`, `super_admin`) / `service_role` |
| **الحقول الحساسة** | لا تُرسل للعميل أبدًا حتى لو كان الصف مسموحًا؛ تُحجب عبر العروض الآمنة (`Safe Views`) ومشغلات حماية الحقول (`Field-Level Triggers`) |

---

## 2) دوال التحقق الأمني المساعدة (`SECURITY DEFINER`)

تُنشأ في `003_security_helper_functions.sql` وتُستخدم في كل السياسات ودوال الـ RPC:

```sql
-- نوع الحساب الحالي (buyer | seller | staff)
current_account_type() RETURNS account_type_enum

-- هل المستخدم نشط وغير موقوف؟
is_active_user() RETURNS boolean

-- هل المستخدم بائع معتمد وموقّع على الإقرار؟
is_approved_seller() RETURNS boolean

-- هل يملك الموظف صلاحية معينة (من role_permissions أو member_permissions غير المنتهية)؟
staff_has(perm text) RETURNS boolean

-- هل المستخدم أدمن أو Super Admin؟
is_admin_or_above() RETURNS boolean

-- هل المستخدم Super Admin؟
is_super_admin() RETURNS boolean

-- هل يملك البائع هذا المنتج؟
seller_owns_product(p_product_id uuid) RETURNS boolean

-- هل يملك البائع هذا الملف؟
seller_owns_file(p_file_id uuid) RETURNS boolean

-- هل يملك المشتري هذا الطلب؟
buyer_owns_purchase(p_purchase_id uuid) RETURNS boolean

-- هل يملك المشتري هذا الكود (عبر buyer_id أو customer_email المطابق لبريده)؟
buyer_owns_code(p_code_id uuid) RETURNS boolean

-- هل يملك المشتري هذه الجلسة؟
buyer_owns_session(p_session_id uuid) RETURNS boolean

-- هل الكود سُلّم بالفعل (delivered_at IS NOT NULL)؟
code_is_delivered(p_code_id uuid) RETURNS boolean

-- هل بدأت جلسة التسليم (توجد صفوف في download_deliveries)؟
session_has_started_delivery(p_session_id uuid) RETURNS boolean
```

جميع هذه الدوال معرّفة بـ `STABLE SECURITY DEFINER SET search_path = public`.

---

## 3) RLS — الهوية والأدوار والبائعون

### `profiles`
| العملية | السياسة |
|---|---|
| **SELECT** | `auth.uid() = id` **OR** `is_admin_or_above()` **OR** `staff_has('staff.user.read')` |
| **INSERT** | `service_role` فقط (يُنشأ تلقائيًا عبر trigger `handle_new_auth_user` عند التسجيل) |
| **UPDATE** | `auth.uid() = id` مع منع تعديل: `account_type`, `status`, `mfa_enforced`, `email_verified_at`, `mfa_secret_encrypted` (عبر trigger `profiles_protect_fields`) **OR** `is_super_admin()` |
| **DELETE** | لا أحد (حذف ناعم عبر `status = 'deleted'`) |

> **ملاحظة حقول:** `mfa_secret_encrypted` لا يُقرأ لأي دور عبر واجهة العميل؛ يُقرأ فقط في الخادم للتحقق من رمز `TOTP`.

### `seller_profiles`
| العملية | السياسة |
|---|---|
| **SELECT** | `profile_id = auth.uid()` **OR** `is_admin_or_above()` **OR** `staff_has('seller.read')` **OR** (`status = 'approved'` — يرى الزائر والمشتري `display_name`, `bio`, `avatar_url` عبر `seller_public_view`) |
| **INSERT** | `profile_id = auth.uid()` (عند التقديم كبائع) **OR** `service_role` |
| **UPDATE** | `profile_id = auth.uid()` مع منع تعديل حقول الاعتماد والتعليق (`status`, `approved_*`, `rejected_*`, `suspended_*`) **OR** `staff_has('seller.approve')` **OR** `staff_has('seller.suspend')` **OR** `is_admin_or_above()` |
| **DELETE** | لا أحد |

### `seller_applications`, `seller_agreements`
| العملية | السياسة |
|---|---|
| **SELECT** | `profile_id = auth.uid()` **OR** `is_admin_or_above()` **OR** `staff_has('seller.read')` |
| **INSERT** | `profile_id = auth.uid()` **OR** `service_role` |
| **UPDATE** | `is_admin_or_above()` **OR** `staff_has('seller.approve')` (على `seller_applications` فقط؛ الاتفاقيات لا تُعدّل) |
| **DELETE** | لا أحد |

### `seller_drive_accounts`
| العملية | السياسة |
|---|---|
| **SELECT** | `seller_id = auth.uid()` (عبر `seller_drive_accounts_safe` بدون `encrypted_refresh_token`) **OR** `is_super_admin()` |
| **INSERT** | `seller_id = auth.uid()` |
| **UPDATE** | `seller_id = auth.uid()` (الخادم فقط يحدّث `encrypted_refresh_token` والحصة) |
| **DELETE** | `seller_id = auth.uid()` مع منع الحذف إذا كان الحساب مرتبطًا بمواقع تخزين ملفات نشطة (`ON DELETE RESTRICT`) |

> **قيد إضافي (`027_security_hardening.sql`):** فهرس فريد جزئي `idx_seller_drive_one_default ON seller_drive_accounts(seller_id) WHERE is_default = true` يضمن وجود حساب افتراضي واحد فقط لكل بائع.

### `roles`, `permissions`, `role_permissions`, `store_members`, `member_permissions`
| العملية | السياسة |
|---|---|
| **SELECT** | المستخدم يقرأ عضويته وصلاحياته الخاصة (`profile_id = auth.uid()` / `member_id = auth.uid()` وعبر `my_permissions_view`) **OR** `is_admin_or_above()` |
| **INSERT / UPDATE / DELETE** | `is_super_admin()` فقط |

> **قاعدة صارمة:** لا أحد يعدّل صلاحياته الخاصة، ولا يُسمح لغير `Super Admin` بمنح أو سحب الأدوار أو الصلاحيات.

---

## 4) RLS — المنتجات والملفات

### `categories`
| العملية | السياسة |
|---|---|
| **SELECT** | `is_active = true` للجميع (بما فيهم الزائر) **OR** `staff_has('category.manage')` **OR** `is_admin_or_above()` |
| **INSERT / UPDATE / DELETE** | `staff_has('category.manage')` **OR** `is_admin_or_above()` (ودوال `set_category_parent`, `delete_category_safe`, `reorder_categories` تتحقق داخليًا من `category.manage`) |

### `products`
| العملية | السياسة |
|---|---|
| **SELECT** | `status = 'published'` (للزائر والمشتري) **OR** `seller_id = auth.uid()` **OR** `staff_has('product.read.any')` **OR** `is_admin_or_above()` |
| **INSERT** | `seller_id = auth.uid()` **AND** `is_approved_seller()` (مع التحقق من الحد الأدنى للسعر `min_product_price` والعملة المعتمدة عبر trigger `products_validate_pricing`) |
| **UPDATE** | (`seller_id = auth.uid()` **AND** `is_approved_seller()`) **OR** `staff_has('product.suspend')` **OR** `is_admin_or_above()` |
| **DELETE** | (`seller_id = auth.uid()` **AND NOT EXISTS** `order_items` مرتبطة) **OR** `staff_has('product.delete.any')` **OR** `is_admin_or_above()` |

> **منع صريح:** لا حذف فيزيائي لمنتج أو إصدار له `order_items` مرتبطة (`ON DELETE RESTRICT`).

### `product_versions`
| العملية | السياسة |
|---|---|
| **SELECT** | `status = 'published'` **OR** `seller_owns_product(product_id)` **OR** `staff_has('product.read.any')` **OR** `is_admin_or_above()` |
| **INSERT / UPDATE** | `seller_owns_product(product_id)` **OR** `is_admin_or_above()` |
| **DELETE** | `seller_owns_product(product_id)` **AND NOT EXISTS** (`order_items` مرتبطة) |

### `files`, `file_versions`, `file_storage_locations`
| الجدول | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `files` | `seller_id = auth.uid()` **OR** `staff_has('file.quarantine')` **OR** `is_admin_or_above()` | `seller_id = auth.uid()` **AND** `is_approved_seller()` | `USING` و `WITH CHECK`: `seller_id = auth.uid()` **OR** `staff_has('file.quarantine')` **OR** `is_admin_or_above()` | `seller_id = auth.uid()` (بشرط عدم ارتباطه ببيع) |
| `file_versions` | `seller_owns_file(file_id)` **OR** `staff_has('file.quarantine')` **OR** `is_admin_or_above()` | `seller_owns_file(file_id)` | `seller_owns_file(file_id)` **OR** `staff_has('file.quarantine')` **OR** `is_admin_or_above()` | لا أحد (تُحفظ السجلات) |
| `file_storage_locations` | `is_super_admin()` فقط (لا تُقرأ من العميل؛ يُستخدم `files_safe`) | `service_role` فقط | `service_role` فقط | لا أحد |

> **تحصين (`027_security_hardening.sql`):** سياسة `files_update` تتضمن `WITH CHECK` صريحًا لمنع البائع من نقل ملكية ملفه (`seller_id`) إلى بائع آخر.

### `product_version_files`
| العملية | السياسة |
|---|---|
| **SELECT** | `EXISTS` (إصدار منشور لمنتج منشور) **OR** `seller_owns_product(...)` **OR** `is_admin_or_above()` |
| **INSERT / UPDATE / DELETE** | `seller_owns_product(...)` **OR** `is_admin_or_above()` |

### `file_previews`
| العملية | السياسة |
|---|---|
| **SELECT** | `status = 'ready'` (معاينة عامة للجميع) **OR** `seller_owns_file(...)` **OR** `staff_has('file.preview.regenerate')` **OR** `is_admin_or_above()` |
| **INSERT / UPDATE** | `seller_owns_file(...)` **OR** `staff_has('file.preview.regenerate')` **OR** `is_admin_or_above()` **OR** `service_role` |
| **DELETE** | `seller_owns_file(...)` **OR** `is_admin_or_above()` |

### `upload_sessions`, `scan_jobs`, `quarantine_records`
| الجدول | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `upload_sessions` | `seller_id = auth.uid()` **OR** `is_admin_or_above()` | `seller_id = auth.uid()` **AND** `is_approved_seller()` | `seller_id = auth.uid()` | `service_role` |
| `scan_jobs` | `seller_owns_file(...)` **OR** `staff_has('file.quarantine')` **OR** `is_admin_or_above()` | `service_role` | `service_role` | لا أحد |
| `quarantine_records` | `seller_owns_file(...)` **OR** `staff_has('file.quarantine')` **OR** `is_admin_or_above()` | `service_role` | `staff_has('file.quarantine')` **OR** `is_admin_or_above()` | لا أحد |

### `allowed_file_types`, `tags`, `product_tags`
| الجدول | SELECT | الكتابة (INSERT / UPDATE / DELETE) |
|---|---|---|
| `allowed_file_types` | `is_admin_or_above()` **OR** `staff_has('filetype.manage')` (مقيّد في `027_security_hardening.sql`؛ والتحقق أثناء الرفع يتم خادميًا) | `is_admin_or_above()` **OR** `staff_has('filetype.manage')` |
| `tags` | الكل يقرأ (`true`) | `staff_has('category.manage')` **OR** `is_admin_or_above()` |
| `product_tags` | الكل يقرأ (`true`) | `seller_owns_product(product_id)` **OR** `is_admin_or_above()` |

---

## 5) RLS — الطلبات والأكواد

### `purchase_requests`
| العملية | السياسة |
|---|---|
| **SELECT** | `buyer_id = auth.uid()` **OR** `lower(customer_email) = lower(auth.email())` **OR** `staff_has('request.read.any')` **OR** `is_admin_or_above()` |
| **INSERT** | عبر دالة `create_purchase_request` (`SECURITY DEFINER`) أو `buyer_id = auth.uid()` |
| **UPDATE** | (`buyer_id = auth.uid()` **AND** `status IN ('created','pending')`) **OR** `staff_has('request.read.any')` **OR** `is_admin_or_above()` |
| **DELETE** | لا أحد |

> **منع صريح:** الانتقال إلى `status = 'cancelled'` ممنوع على مستوى القاعدة عبر trigger `purchase_requests_block_cancel_after_delivery` إذا وُجد كود مرتبط حالته `delivered` أو `redeemed`.

### `purchase_request_items`, `orders`, `order_items`
| الجدول | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `purchase_request_items` | `buyer_owns_purchase(purchase_request_id)` **OR** `staff_has('request.read.any')` **OR** `is_admin_or_above()` | `service_role` / RPC | لا أحد | لا أحد |
| `orders` | `buyer_id = auth.uid()` **OR** `buyer_owns_purchase(purchase_request_id)` **OR** `staff_has('request.read.any')` **OR** `is_admin_or_above()` | `service_role` / RPC | `staff_has('request.read.any')` **OR** `is_admin_or_above()` | لا أحد |
| `order_items` | `EXISTS` (order للمشتري) **OR** `staff_has('request.read.any')` **OR** `is_admin_or_above()` | `service_role` / RPC | لا أحد | لا أحد |

### `purchase_codes` — الجدول الأكثر حساسية
| العملية | السياسة |
|---|---|
| **SELECT** | `buyer_owns_code(id)` (يفضّل عبر `buyer_codes_view` الذي يحجب `code_hash`) **OR** `staff_has('code.read.any')` **OR** `is_admin_or_above()` |
| **INSERT** | `staff_has('code.issue')` **OR** `is_admin_or_above()` (وعبر دالة `approve_purchase_request` / `issue_replacement_code`) |
| **UPDATE** | `staff_has('code.issue')` **OR** `staff_has('code.confirm_delivery')` **OR** `is_admin_or_above()` |
| **DELETE** | لا أحد |

**مشغلات الحماية الإلزامية على `purchase_codes`:**
1. **`purchase_codes_block_revoke_after_delivery`**: يمنع تحويل الحالة إلى `revoked` إذا كان `OLD.delivered_at IS NOT NULL` ويرفع خطأ `code_revocation_blocked_after_delivery`.
2. **`trg_codes_protect_fields` (`027_security_hardening.sql`)**: يمنع أي تعديل على `code_hash` أو `order_item_id` أو `issued_at` بعد الإنشاء، ويمنع تعديل `expires_at` بعد التسليم (`delivered_at IS NOT NULL`).

### `code_plaintext_handoff` (تسليم الكود لمرة واحدة عند الاعتماد — `016_purchase_flow.sql`)
| العملية | السياسة |
|---|---|
| **SELECT / INSERT / DELETE** | `service_role` فقط (لا توجد أي سياسة لـ `authenticated` أو `anon`؛ يُقرأ الكود النصي مرة واحدة في الخادم لإرساله، وتنتهي صلاحيته خلال ساعة) |

### `code_redemptions`, `code_delivery_attempts`, `redeem_attempts`
| الجدول | SELECT | INSERT | UPDATE / DELETE |
|---|---|---|---|
| `code_redemptions` | `buyer_owns_code(code_id)` **OR** `staff_has('code.read.any')` **OR** `is_admin_or_above()` | `service_role` / `redeem_code` RPC | لا أحد |
| `code_delivery_attempts` | `buyer_owns_code(code_id)` **OR** `staff_has('code.read.any')` **OR** `is_admin_or_above()` | `staff_has('code.confirm_delivery')` **OR** `is_admin_or_above()` **OR** `service_role` | لا أحد |
| `redeem_attempts` (`024`) | `is_super_admin()` فقط | `service_role` فقط | لا أحد (Append-only) |

---

## 6) RLS — التنزيل والتعويض والاستثناء

### `download_sessions`
| العملية | السياسة |
|---|---|
| **SELECT** | `buyer_id = auth.uid()` **OR** `buyer_owns_code(code_id)` **OR** `staff_has('download.session.revoke')` **OR** `is_admin_or_above()` |
| **INSERT** | `service_role` / `redeem_code` / `create_compensation_session` |
| **UPDATE** | `staff_has('download.session.extend')` **OR** `staff_has('download.session.revoke')` **OR** `is_admin_or_above()` |
| **DELETE** | لا أحد |

**Trigger إلزامي (`download_sessions_block_revoke_after_delivery`):**
يرفض تحويل الجلسة إلى `revoked` إذا كانت `session_has_started_delivery(OLD.id)` صحيحة، ويرفع استثناء `session_revocation_blocked_after_delivery`.

### `download_tokens`, `download_attempts`, `download_deliveries`
| الجدول | SELECT | INSERT / UPDATE | DELETE |
|---|---|---|---|
| `download_tokens` | لا أحد من العملاء (`service_role` فقط) | `service_role` فقط | `service_role` فقط |
| `download_attempts` | `EXISTS` (order_item للمشتري) **OR** `staff_has('download.session.revoke')` **OR** `is_admin_or_above()` | `service_role` فقط (عبر `record_successful_attempt` المحصورة بـ `service_role`) | لا أحد |
| `download_deliveries` | `buyer_owns_session(session_id)` **OR** `staff_has('download.session.revoke')` **OR** `is_admin_or_above()` | `service_role` فقط | لا أحد |

### `compensation_requests`
| العملية | السياسة |
|---|---|
| **SELECT** | `buyer_owns_code(code_id)` (عبر `buyer_compensation_view` الذي يخفي `admin_reason` إلا عند `status = 'rejected'`) **OR** `staff_has('download.compensation.approve')` **OR** `is_admin_or_above()` |
| **INSERT** | `staff_has('download.compensation.request')` **OR** `is_admin_or_above()` (بسبب إلزامي، وضمن سقف 3 لكل `code_id`) |
| **UPDATE** | `staff_has('download.compensation.approve')` **OR** `is_admin_or_above()` |
| **DELETE** | لا أحد |

### `attempt_exception_requests`
| العملية | السياسة |
|---|---|
| **SELECT** | `is_super_admin()` فقط |
| **INSERT** | `is_super_admin()` **OR** `service_role` |
| **UPDATE** | `is_super_admin()` فقط (عبر `issue_attempt_exception`) |
| **DELETE** | لا أحد |

---

## 7) RLS — المالية

### `exchange_rates`, `seller_commissions`, `seller_wallets`, `financial_transactions`, `seller_payouts`, `payments`
| الجدول | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `exchange_rates` | الكل يقرأ الأسعار الفعالة؛ الإدارة تقرأ السجل الكامل | `is_super_admin()` فقط | `is_super_admin()` فقط | `is_super_admin()` فقط |
| `seller_commissions` | `seller_id = auth.uid()` **OR** `staff_has('commission.seller.override')` **OR** `is_admin_or_above()` | `is_super_admin()` **OR** `staff_has('commission.seller.override')` | `is_super_admin()` **OR** `staff_has('commission.seller.override')` | `is_super_admin()` فقط |
| `seller_wallets` | `seller_id = auth.uid()` **OR** `staff_has('payout.read')` **OR** `is_admin_or_above()` | `service_role` فقط | `service_role` / `adjust_wallet` (`Super Admin` فقط) | لا أحد |
| `financial_transactions` | `EXISTS` (wallet للبائع `seller_id = auth.uid()`) **OR** `staff_has('payout.read')` **OR** `is_admin_or_above()` | `service_role` فقط | لا أحد | لا أحد |
| `seller_payouts` | `seller_id = auth.uid()` **OR** `staff_has('payout.read')` **OR** `is_admin_or_above()` | **ممنوع مباشرة** (`REVOKE INSERT` في `027`)؛ يتم حصريًا عبر دالة `request_payout` التي تتحقق من الرصيد وحد الـ `100 USD` | `staff_has('payout.approve')` **OR** `is_admin_or_above()` (عبر `approve_payout`, `mark_payout_paid`, `reject_payout`) | لا أحد |
| `payments` (معطّل) | `is_super_admin()` فقط | لا أحد | لا أحد | لا أحد |

---

## 8) RLS — التقييمات والبلاغات والإشعارات

### `reviews`
| العملية | السياسة |
|---|---|
| **SELECT** | `status = 'published'` للجميع **OR** `buyer_id = auth.uid()` **OR** `seller_owns_product(product_id)` **OR** `staff_has('review.delete')` **OR** `is_admin_or_above()` |
| **INSERT** | عبر `create_review` (`buyer_id = auth.uid()` + تحقق من وجود `order_item` مكتمل التسليم + قيد `UNIQUE(product_id, buyer_id)`) |
| **UPDATE (حذف ناعم فقط)** | `seller_owns_product(product_id)` **OR** `staff_has('review.delete')` **OR** `is_admin_or_above()` |
| **DELETE** | لا أحد |

**مشغلات حماية الحقول على `reviews` (`027_security_hardening.sql` و`028_seller_reviews.sql`):**
1. **`trg_reviews_protect_fields` (`restrict_review_updates` — `027`)**:
   - يمنع تعديل `rating`, `body`, `product_id`, `buyer_id`, `order_item_id` من أي دور غير `Super Admin`.
   - يمنع إعادة نشر تقييم محذوف (`OLD.status = 'deleted' AND NEW.status = 'published'`) إلا لـ `Super Admin`.
   - يفرض وجود `delete_reason` غير فارغ عند تحويل الحالة إلى `deleted`.
2. **`trg_restrict_review_reply` (`restrict_review_reply` — `028`)**:
   - يتحقق عند تعديل `seller_reply`, `seller_replied_at`, `seller_replied_by` من أن المستدعي هو البائع مالك المنتج (`p.seller_id = auth.uid()`) أو `is_admin_or_above()` أو يملك صلاحية `review.reply`.
   - يفرض ألا يتجاوز طول `seller_reply` 2000 حرف (`reply_too_long`).

### `favorites`, `content_reports`, `support_tickets`, `support_messages`, `notifications`
| الجدول | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `favorites` | `buyer_id = auth.uid()` | `buyer_id = auth.uid()` | لا أحد | `buyer_id = auth.uid()` |
| `content_reports` | `reporter_id = auth.uid()` **OR** `staff_has('report.read')` **OR** `is_admin_or_above()` | `reporter_id = auth.uid()` | `staff_has('report.resolve')` **OR** `is_admin_or_above()` | لا أحد |
| `support_tickets` | `owner_id = auth.uid()` **OR** `is_admin_or_above()` | `owner_id = auth.uid()` | `owner_id = auth.uid()` **OR** `is_admin_or_above()` | لا أحد |
| `support_messages` | `EXISTS` (ticket للمستخدم) **OR** `is_admin_or_above()` | `EXISTS` (ticket للمستخدم) **OR** `is_admin_or_above()` | لا أحد | لا أحد |
| `notifications` | `user_id = auth.uid()` | `service_role` / triggers فقط | `user_id = auth.uid()` (محمي بـ trigger `trg_notifications_only_read_at` الذي يمنع تعديل أي حقل سوى `read_at`) | `service_role` فقط |

---

## 9) RLS — جداول الإعدادات المنفصلة (11 جدولًا)

تنطبق السياسة الموحدة التالية على الجداول الأحد عشر (`general_settings`, `pricing_settings`, `download_settings`, `compensation_settings`, `attempt_exception_settings`, `watermark_settings`, `backup_settings`, `audit_settings`, `security_settings`, `payout_settings`, `commission_settings`):

| العملية | السياسة |
|---|---|
| **SELECT** | `is_admin_or_above()` للقراءة الكاملة (والحقول العامة غير الحساسة مثل `platform_name`, `default_currency`, `allowed_currencies` تُقرأ عبر `public_platform_settings_view`) |
| **INSERT / UPDATE** | `is_super_admin()` فقط (ويُسجَّل كل تحديث تلقائيًا في `audit_logs` بـ `before_value` و`after_value`) |
| **DELETE** | لا أحد |

**الحقول غير القابلة للتعديل بعد الإعداد الأول (`settings_immutable_fields` trigger):**
- `security_settings.mfa_enforced_roles`
- `audit_settings.append_only_enforced`

---

## 10) RLS — سجل التدقيق والنسخ الاحتياطي

### `audit_logs` (Append-Only)
| العملية | السياسة والحماية |
|---|---|
| **SELECT** | `is_admin_or_above()` **OR** `staff_has('audit.read')` |
| **INSERT** | عبر دالة `log_audit` (`SECURITY DEFINER`) فقط |
| **UPDATE** | **ممنوع تمامًا لأي دور** (`REVOKE UPDATE` + trigger `audit_logs_no_update_delete`) |
| **DELETE** | **ممنوع تمامًا لأي دور، بما فيهم `Super Admin` و`service_role`** (`REVOKE DELETE` + trigger `audit_logs_no_update_delete`) |

### `audit_archives`, `security_events`, `backup_jobs`, `backup_archives`, `restore_jobs`, `retention_policies`
| الجدول | SELECT | الكتابة (INSERT / UPDATE) |
|---|---|---|
| `audit_archives` | `is_super_admin()` **OR** `staff_has('audit.read')` | `service_role` فقط |
| `security_events` | `is_admin_or_above()` **OR** `staff_has('security.read')` | `service_role` فقط |
| `backup_jobs` | `is_admin_or_above()` **OR** `staff_has('backup.read')` | `is_super_admin()` **OR** `service_role` |
| `backup_archives` | `is_admin_or_above()` **OR** `staff_has('backup.read')` | `service_role` فقط |
| `restore_jobs` | `is_admin_or_above()` | `is_super_admin()` فقط |
| `retention_policies` | `is_admin_or_above()` | `is_super_admin()` فقط |

---

## 11) ملخص العروض الآمنة، المشغلات، وتحصين دوال RPC

### أ) العروض الآمنة (`Safe Views`)
| العرض | الغرض الأمني |
|---|---|
| `seller_public_view` | يكشف `display_name, bio, avatar_url` فقط للبائعين المعتمدين |
| `seller_drive_accounts_safe` | يخفي `encrypted_refresh_token` عن واجهة البائع |
| `files_safe` | يخفي `provider_file_id`, `provider_folder_id`, `internal_path` |
| `buyer_codes_view` | يخفي `code_hash` ويكشف `code_prefix, status, expires_at` فقط |
| `buyer_compensation_view` | يكشف `admin_reason` فقط عندما تكون `status = 'rejected'` |
| `my_permissions_view` | يعرض الصلاحيات الفعلية للمستخدم الحالي فقط |
| `public_platform_settings_view` | يعرض إعدادات العرض العامة (`platform_name`, `default_currency`, `allowed_currencies`) للزوار |
| `seller_reviews_view` (`028`) | عرض `SECURITY INVOKER` يربط `reviews` بـ `products` بحيث يرث سياسات `RLS` ويرى كل بائع تقييمات منتجاته فقط |

### ب) تحصين دوال `SECURITY DEFINER` (`027_security_hardening.sql`)
1. **دوال مسموحة لـ `service_role` فقط (`REVOKE EXECUTE FROM PUBLIC, authenticated, anon`):**
   - `record_successful_attempt`
   - `mark_session_completed`
   - `expire_partial_session`
   - `pick_drive_account`
   - `update_drive_quota`
2. **دوال إدارية تتحقق داخليًا من صلاحية المستدعي قبل أي تنفيذ (`IF NOT (is_admin_or_above() OR staff_has(...)) THEN RAISE EXCEPTION 'not_authorized'`):**
   - `confirm_code_delivery`, `revoke_code_before_delivery`, `issue_replacement_code`
   - `create_compensation_session`, `reject_compensation`
   - `extend_session`, `revoke_session_before_delivery`
   - `approve_seller`, `reject_seller`, `suspend_seller`
   - `approve_purchase_request`, `reject_purchase_request`
   - `approve_payout`, `mark_payout_paid`, `reject_payout`
   - `delete_review`, `resolve_report`
   - `set_category_parent`, `delete_category_safe`, `reorder_categories`
   - `issue_attempt_exception`, `adjust_wallet` (`is_super_admin()` حصريًا)
3. **دوال `SECURITY DEFINER` مقيدة بملكية المستخدم الحالي (`auth.uid()`) (`031` و`032`):**
   - `buyer_order_detail(p_request_id)` و`buyer_orders_list()`: تتحققان داخليًا من `buyer_id = auth.uid() OR customer_email = auth.email()` وتخفيان `admin_reason` إلا عند `status = 'rejected'`.
   - `seller_orders(...)` و`seller_sales_stats()`: تفرضان `p.seller_id = auth.uid()` داخليًا وتقنّعان بريد المشتري (`ab***@domain.com`) لحماية خصوصية المشتري، وممنوحتان لـ `authenticated` فقط.
   - `refresh_product_rating(p_product_id)`: محصورة بـ `service_role` فقط (تُستدعى عبر triggers).

---

## 12) قائمة اختبارات RLS الإلزامية (المحققة في `03-security.spec.ts` و`04-security-hardening.spec.ts`)

- [x] الزائر لا يقرأ أي صف من `download_*`, `purchase_*`, `seller_drive_accounts`, `allowed_file_types`
- [x] المشتري A لا يرى كود المشتري B ولا جلسته ولا يستطيع تفعيل كوده
- [x] المشتري لا يستطيع استدعاء أي دالة RPC إدارية مباشرة عبر PostgREST (`not_authorized`)
- [x] المشتري أو البائع لا يستطيع استدعاء الدوال الخادمية (`record_successful_attempt`, `pick_drive_account`, إلخ)
- [x] البائع A لا يرى منتجات البائع B غير المنشورة ولا ملفاته ولا يستطيع نقل ملكية ملف إلى بائع آخر (`WITH CHECK`)
- [x] البائع لا يستطيع إدراج صف مباشر في `seller_payouts` لتجاوز حد الـ 100 دولار أو الرصيد المتاح
- [x] البائع يستطيع حذف تقييم على منتجه ناعمًا بسبب إلزامي، لكنه لا يستطيع تعديل `rating`/`body` أو إعادة نشر تقييم محذوف
- [x] المستخدم يستطيع تحديث `read_at` في إشعاراته، لكنه لا يستطيع تعديل `title` أو `body`
- [x] المشتري لا يرى `admin_reason` في طلبات التعويض إلا عند `status = 'rejected'`
- [x] محاولة `UPDATE purchase_codes SET status = 'revoked'` بعد `delivered_at IS NOT NULL` تفشل بـ `code_revocation_blocked_after_delivery`
- [x] محاولة تغيير `code_hash` أو `order_item_id` على كود موجود تفشل بـ `cannot_modify_immutable_code_fields`
- [x] محاولة `UPDATE download_sessions SET status = 'revoked'` بعد بدء التسليم تفشل بـ `session_revocation_blocked_after_delivery`
- [x] محاولة `UPDATE` أو `DELETE` على `audit_logs` تفشل لكل الأدوار بما فيهم `Super Admin`
- [x] تقييم ثانٍ لنفس المنتج من نفس المشتري يفشل بقيد `UNIQUE(product_id, buyer_id)`
- [x] تعديل `security_settings.mfa_enforced_roles` أو `audit_settings.append_only_enforced` يفشل بـ `immutable_setting_violation`
