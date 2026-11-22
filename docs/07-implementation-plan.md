# خطة التنفيذ المرحلية المحدّثة وحالة الإنجاز

توثّق هذه الخطة المراحل الخمس عشرة (0–14) المعتمدة لبناء منصة بيع المنتجات الرقمية، مع ربط كل مرحلة بما تم تنفيذه فعليًا في المستودع (ملفات الترحيل حتى `032`، الخدمات الخادمية، الواجهات، واختبارات النهاية إلى النهاية)، إضافةً إلى النقاط التنفيذية المتبقية قبل الإطلاق الفعلي وخارطة طريق التحسينات الإضافية.

---

## 1. جدول المراحل الأساسي (0–14)

| المرحلة | المحتوى | مخرج قابل للتحقق | الحالة في المستودع |
|---|---|---|---|
| **0** | تثبيت الوثيقة والملحق النهائي | وثيقة متطلبات معتمدة + قاموس قرارات مغلق بالكامل | مكتمل (`docs/01-requirements-final.md`) |
| **1** | ERD + قاموس بيانات + جداول الإعدادات + مصفوفة الصلاحيات وRLS | مخطط نهائي + قيود `UNIQUE` + مصفوفة الصلاحيات وRLS التفصيلية | مكتمل (`docs/02` إلى `docs/08` + ترحيلات `001`–`012`) |
| **2** | تصميم UX عربي متجاوب (`RTL Mobile-First`) | دليل الهوية + مكونات الواجهة الأساسية (`RTL` + `Cairo`) | مكتمل (`src/app/globals.css`, `src/components/ui/*`) |
| **3** | أساس التطبيق + OAuth + 2FA إلزامي للأدوار الإدارية + الأدوار | دخول يعمل مع حجب الوصول الإداري الكامل حتى تفعيل `2FA (TOTP)` | مكتمل (`013_mfa_and_auth_helpers.sql`, `src/lib/auth/*`, `src/app/(auth)/*`) |
| **4** | اعتماد البائعين + الإقرار الإلزامي + ربط Google Drive متعدد | بائع معتمد مع توقيع الإقرار وربط عدة حسابات Drive بتشفير `AES-256-GCM` | مكتمل (`014_seller_onboarding.sql`, `015_drive_upload.sql`, `src/app/(seller)/seller/onboarding/*`, `drive-accounts/*`) |
| **5** | مركز الرفع المباشر (`Direct-to-Drive Resumable`) + الإصدارات | رفع مباشر من المتصفح إلى Drive لا يمر عبر Vercel + إدارة المنتجات والإصدارات | مكتمل (`015_drive_upload.sql`, `021_product_management.sql`, `src/lib/google/drive.ts`, `src/app/api/upload/*`) |
| **6** | الفحص التلقائي والعزل + المعاينات + العلامة المائية | فحص التوقيع الرقمي (`Magic Bytes`) + عزل المشبوه + معاينات موسومة بعلامة مائية قطرية | مكتمل (`022_scan_and_previews.sql`, `src/lib/server/services/scan-service.ts`, `preview-service.ts`) |
| **7** | المتجر العام والتصنيفات الهرمية والبحث الفوري | تصفح زائر بدون حساب + فلترة وبحث + إدارة تصنيفات محمية من الحلقات | مكتمل (`023_category_rpc.sql`, `src/app/(public)/*`, `src/app/(admin)/admin/categories/*`) |
| **8** | طلبات الشراء + الأكواد (`HMAC-SHA256`) + 72 ساعة + منع السحب بعد التسليم | إصدار أكواد فريدة + تتبع الطلب + كود بديل + حماية ضد التخمين + منع الإلغاء بعد التسليم | مكتمل (`005_orders_and_codes.sql`, `016_purchase_flow.sql`, `024_redeem_hardening.sql`) |
| **9** | جلسات التنزيل + ZIP + الملفات المنفردة + عداد المحاولات الذرّي | 3 محاولات لا تُخترق بالتزامن (`FOR UPDATE`) + دعم الجلسة الجزئية `ExpiredPartial` | مكتمل (`006_downloads_and_compensation.sql`, `017_download_flow.sql`, `src/lib/server/services/download-service.ts`) |
| **10** | التعويض (سقف 3 لكل كود منتج `code_id`) + طلبات الاستثناء | جلسة تعويضية للملفات المتبقية فقط + طلبات استثناء بقرار حصري من `Super Admin` | مكتمل (`006_downloads_and_compensation.sql`, `017_download_flow.sql`, `src/app/(admin)/admin/compensations/*`, `exceptions/*`) |
| **11** | المالية: عملات + أسعار صرف لحظة الشراء + عمولات + محافظ ومستحقات | تثبيت سعر الصرف لحظة الشراء + محافظ البائعين + حد الصرف الأدنى (`100 USD`) | مكتمل (`007_finance.sql`, `018_finance_helpers.sql`, `src/lib/server/services/finance-service.ts`) |
| **12** | التقييمات والبلاغات والإشعارات ولوحة الإدارة وتقييمات البائع | تقييم واحد لكل منتج بقيد `UNIQUE(product_id, buyer_id)` + رد البائع وإحصائياته + حذف بسبب إلزامي + إشعارات فورية | مكتمل (`008`, `019`, `025`, `026`, `028_seller_reviews.sql`, `/seller/reviews`) |
| **13** | الإعدادات المنفصلة (11 جدولًا) + النسخ الاحتياطي + سجل التدقيق `Append-Only` | سجل تدقيق غير قابل للتعديل أو الحذف + إدارة الإعدادات والموظفين والصلاحيات | مكتمل (`009_settings_tables.sql`, `010_audit_and_backups.sql`, `020_settings_and_staff_helpers.sql`) |
| **14** | المراجعة الأمنية الشاملة + تحصين دوال RPC وRLS + اختبارات Playwright E2E | إغلاق ثغرات RPC وRLS وتزوير الحقول + 4 حزم اختبارات E2E شاملة | مكتمل (`027_security_hardening.sql`, `tests/e2e/specs/01..04`, `docs/security-review.md`) |

---

## 2. خريطة التنفيذ الفعلي في المستودع (الترحيلات والوحدات)

### 2.1 ترحيلات قاعدة البيانات (`supabase/migrations/001..032`)
- **`001_extensions_and_helpers.sql`**: الإضافات (`pgcrypto`, `citext`)، الأنواع (`ENUMs`)، ودوال `updated_at`.
- **`002_identity_and_roles.sql`**: جداول `profiles`, `seller_profiles`, `seller_applications`, `seller_agreements`, `seller_drive_accounts`, `roles`, `permissions`, `role_permissions`, `store_members`, `member_permissions`.
- **`003_security_helper_functions.sql`**: دوال التحقق الأمني (`SECURITY DEFINER`) المستخدمة في سياسات `RLS`.
- **`004_products_and_files.sql`**: جداول `categories`, `products`, `product_versions`, `files`, `file_versions`, `product_version_files`, `file_storage_locations`, `file_previews`, `upload_sessions`, `scan_jobs`, `quarantine_records`, `allowed_file_types`, `tags`, `product_tags`.
- **`005_orders_and_codes.sql`**: جداول `purchase_requests`, `purchase_request_items`, `orders`, `order_items`, `purchase_codes`, `code_redemptions`, `code_delivery_attempts` مع triggers منع سحب الكود أو إلغاء الطلب بعد التسليم.
- **`006_downloads_and_compensation.sql`**: جداول `download_sessions`, `download_tokens`, `download_attempts`, `download_deliveries`, `compensation_requests` (بسقف 3 لكل `code_id`), `attempt_exception_requests` مع triggers منع إبطال الجلسة بعد بدء التسليم.
- **`007_finance.sql`**: جداول `exchange_rates`, `seller_commissions`, `seller_wallets`, `financial_transactions`, `seller_payouts`, `payments`.
- **`008_reviews_and_support.sql`**: جداول `reviews` (`UNIQUE(product_id, buyer_id)`), `favorites`, `content_reports`, `support_tickets`, `support_messages`, `notifications`.
- **`009_settings_tables.sql`**: الجداول الأحد عشر المنفصلة للإعدادات (`Singleton id = 1`) مع trigger منع تعديل الحقول غير القابلة للتغيير (`mfa_enforced_roles`, `append_only_enforced`).
- **`010_audit_and_backups.sql`**: جداول `audit_logs` (`Append-Only` محمي بـ `REVOKE` + trigger), `audit_archives`, `security_events`, `backup_jobs`, `backup_archives`, `restore_jobs`, `retention_policies`.
- **`011_rls_policies.sql`**: سياسات `Row-Level Security` لجميع الجداول.
- **`012_views_and_rpcs.sql`**: العروض الآمنة (`Safe Views`) ودوال العمليات الحساسة (`redeem_code`, `consume_attempt`, `confirm_code_delivery`, `create_compensation_session`, `issue_attempt_exception`, `adjust_wallet`).
- **`013_mfa_and_auth_helpers.sql`**: دوال التحقق من `2FA` وإنشاء الملف الشخصي التلقائي عند التسجيل.
- **`014_seller_onboarding.sql`**: دوال تقديم طلب البائع، توقيع الإقرار، واعتماد/رفض/تعليق البائع.
- **`015_drive_upload.sql`**: دوال اختيار حساب Drive تلقائيًا (`pick_drive_account`) وتحديث الحصة (`update_drive_quota`).
- **`016_purchase_flow.sql`**: جدول التسليم المؤقت للكود (`code_plaintext_handoff`)، ودوال إنشاء واعتماد ورفض طلبات الشراء وإصدار الأكواد البديلة.
- **`017_download_flow.sql`**: دوال تسجيل المحاولات المكتملة، إغلاق الجلسات، تحويل الجلسات الجزئية المنتهية إلى `expired_partial`، وتمديد/إبطال الجلسات قبل التسليم.
- **`018_finance_helpers.sql`**: دوال حساب العمولة الفعلية، إيداع أرباح البائع عند اعتماد الطلب، وطلب/اعتماد/صرف/رفض السحب.
- **`019_reviews_and_admin.sql`**: دوال إضافة التقييم الموثّق، الحذف الناعم للتقييم بسبب إلزامي، ومعالجة البلاغات.
- **`020_settings_and_staff_helpers.sql`**: triggers تسجيل تعديلات الإعدادات تلقائيًا في `audit_logs`، ودوال إدارة الموظفين والصلاحيات الفردية.
- **`021_product_management.sql`**: دوال إنشاء وتحديث ونشر المنتجات والإصدارات والتحقق من السعر الأدنى.
- **`022_scan_and_previews.sql`**: دوال طابور الفحص (`claim_scan_jobs`, `complete_scan_pass`, `quarantine_file`, `release_from_quarantine`) وطابور المعاينات (`claim_preview_jobs`, `finalize_preview`, `fail_preview`).
- **`023_category_rpc.sql`**: دوال حماية شجرة التصنيفات من الحلقات (`category_would_create_cycle`, `set_category_parent`, `delete_category_safe`, `reorder_categories`).
- **`024_redeem_hardening.sql`**: جدول `redeem_attempts`، وفحص حدود المحاولات (`check_redeem_rate_limit`)، وتحصين `redeem_code` و`buyer_owns_code`.
- **`025_seller_orders_and_stats.sql`**: عروض ودوال إحصاءات ومبيعات البائع دون كشف بيانات المشترين الحساسة.
- **`026_notifications_system.sql`**: توسيع جدول `notifications` مع triggers الإشعارات التلقائية ودالة `mark_all_notifications_read`.
- **`027_security_hardening.sql`**: التحصين الأمني الشامل (فحص الصلاحيات داخل 24 دالة RPC إدارية، سحب 5 دوال خادمية من `authenticated`، إصلاح 4 سياسات RLS، وإضافة 4 triggers لحماية الحقول من التلاعب).
- **`028_seller_reviews.sql`**: إدارة تقييمات البائع والرد عليها (`seller_reply`, `seller_replied_at`, `seller_replied_by`، مشغل `trg_restrict_review_reply`، العرض `seller_reviews_view` (`SECURITY INVOKER`)، ودالة الإحصائيات `seller_review_stats`).
- **`029_storefront_ux.sql`**: صورة غلاف المنتج (`cover_image_url`)، وجدول معرض الصور `product_gallery_images` (مع RLS وحد أقصى 8 صور لكل منتج)، وتحديث `storefront_products` و`search_storefront`، مع مكونات `Breadcrumbs`, `ProductGallery`, `SimilarProducts` وشاشات `loading.tsx`.
- **`030_admin_notifications.sql`**: دالة `notify_staff_with_permission` (`SECURITY DEFINER`, `service_role` فقط) و5 مشغلات تلقائية لإشعار الموظفين حسب الصلاحية (بائع جديد، طلب سحب، ملف معزول، تعويض، استثناء)، ومسار الإشعارات الموحد `/notifications` مع بانر العناصر المعلّقة.
- **`031_performance_indexes.sql`**: تفعيل `pg_trgm` وفهرس البحث العربي `idx_products_search_trgm`، و12 فهرسًا على المسارات الساخنة، وجدول `product_rating_stats` التجميعي، وإعادة كتابة `buyer_order_detail` و`buyer_orders_list` لحل مشاكل `N+1`.
- **`032_seller_orders.sql`**: دوال `seller_orders` و`seller_sales_stats` (`SECURITY DEFINER`) لعرض مبيعات البائع وإحصائياته مع تقنيع هوية المشتري (`ab***@domain.com`) وحساب الصافي بعد العمولة.
- **`033_commission_snapshot_and_wallet.sql`**: تثبيت نسبة العمولة لحظة البيع على `order_items` (`commission_rate_at_sale`, `commission_amount`, `net_seller_amount`)، والإيداع الذري الفوري في `seller_wallets.balance` و`financial_transactions` داخل `approve_purchase_request` (محمي بفهرس فريد ضد التكرار `uq_fin_tx_order_item_type`)، وعرض سجل الحركات المالية في `/seller/wallet`.
- **`034_product_images_storage.sql`**: إنشاء حاوية `product-images` في Supabase Storage مع سياسات `RLS`، ومعالجة الصور خادميًا عبر `sharp` (تحويل إلى WebP + إزالة EXIF + تغيير الحجم)، وحذف فعلي من Storage عند الإزالة، وتضييق `img-src` في `middleware.ts` بإزالة `https:` المفتوحة.

---

## 3. نقاط تنفيذية متبقية قبل الإطلاق الفعلي (قرارات تشغيلية وقانونية)

1. **المراجعة القانونية النهائية** لنص إقرار البائع، وسياسة الخصوصية، وشروط الاستخدام شاملةً السطر الصريح: *«الدفع يتم خارج المنصة، ولا تقدم المنصة استردادًا ماليًا، ويقتصر دورها على إصدار أكواد التنزيل»*.
2. **وثيقة حدود الخطط الفعلية**: تثبيت أرقام وحدود الخطط الإنتاجية لـ Vercel، وGoogle Drive API، وSupabase، وخدمة بث التنزيلات، والتخزين السحابي الإداري.
3. **ربط خدمة بث التنزيل المستقلة (`DOWNLOAD_SERVICE_URL`)**: نشر Worker البث الخارجي (مثل Cloudflare Worker وفق عقد `docs/download-service-contract.md`) لبث ملفات Drive وحزم ZIP الكبيرة خارج Vercel.
4. **إعداد التخزين السحابي الإداري للنسخ الاحتياطية** (Cloudflare R2 أو AWS S3 مستقل عن Drive البائعين) وضبط مفاتيح التشفير المنفصلة.
5. **تحديد القيم الافتراضية الإنتاجية من لوحة `Super Admin`**: حد السعر الأدنى للمنتجات (`min_product_price`)، أسعار الصرف الأولية (`EGP, KWD, SAR, USD`)، وحد الصرف الأدنى للمستحقات (`100 USD`).
6. **تحديد خطة الإطلاق التدريجي (Soft Launch)**: عدد البائعين الأوائل، حجم المنتجات، ومراقبة سجلات الأداء والتدقيق.

---

## 4. قائمة التحقق قبل النشر (Pre-Deployment Checklist)

1. تطبيق جميع الترحيلات حتى `032` بالترتيب على قاعدة بيانات الاختبار ثم الإنتاج (`pnpm db:push`).
2. إنشاء حاوية التخزين العامة للمعاينات `previews` في Supabase Storage وفق `docs/scan-preview-flow.md`.
3. التأكد من ضبط جميع متغيرات البيئة في `.env.local` / Vercel (`ENCRYPTION_KEY`, `CODE_HASH_PEPPER`, `DOWNLOAD_SERVICE_TOKEN`, `WORKER_SECRET`, `GOOGLE_DRIVE_*`).
4. التحقق من نجاح فحص الأنواع (`pnpm typecheck`) واجتياز اختبارات Playwright الأربع (`pnpm test:e2e`):
   - `01-full-journey.spec.ts`
   - `02-attempts-and-compensation.spec.ts`
   - `03-security.spec.ts`
   - `04-security-hardening.spec.ts`

---

## 5. تحسينات المرحلة القادمة — خارطة الطريق الإضافية (Next Iteration Roadmap)

- [x] **صفحة تقييمات البائع (`/seller/reviews`)**: مكتملة في الترحيل `028_seller_reviews.sql` و`docs/seller-reviews.md`.
- [x] **تحسينات UX للمتجر (`Storefront UX`)**: مكتملة في الترحيل `029_storefront_ux.sql` (`cover_image_url`, `product_gallery_images`, `Breadcrumbs`, `ProductGallery`, `SimilarProducts`, `loading.tsx`) و`docs/storefront-ux.md`.
- [x] **إشعارات الإدارة ومسار `/notifications` الموحد**: مكتملة في الترحيل `030_admin_notifications.sql` و`src/app/notifications/*` و`docs/admin-notifications.md`.
- [x] **ترويسات الأمان (`CSP + Nonce + HSTS + Permissions-Policy`)**: مكتملة في `middleware.ts`, `src/app/layout.tsx`, `next.config.mjs`, `/api/csp-report`, و`docs/security-headers.md`.
- [x] **مراجعة الأداء (`Performance Review`)**: مكتملة في الترحيل `031_performance_indexes.sql` (`pg_trgm`, `product_rating_stats`, حل `N+1` في `buyer-service.ts`, `unstable_cache` + `revalidateTag`, `<Suspense>` streaming في `/products`) و`docs/performance.md`.
- [x] **صفحة مبيعات البائع (`/seller/orders`)**: مكتملة في الترحيل `032_seller_orders.sql` و`src/app/(seller)/seller/orders/*` و`docs/seller-orders.md` مع تقنيع هوية المشتري.
- [x] **تثبيت العمولة لحظة البيع + إيداع المحفظة (`credit wallet`)**: مكتمل في الترحيل `033_commission_snapshot_and_wallet.sql` مع سجل الحركات المالية في `/seller/wallet`.
- [x] **رفع صور المنتجات مباشرة إلى Supabase Storage + `sharp` + تضييق CSP**: مكتمل في الترحيل `034_product_images_storage.sql` و`product-image-service.ts` و`/api/seller/images/upload` وتضييق `img-src` في `middleware.ts`.

البنود التالية مقترحة للجولات القادمة:
1. **إشعارات بالبريد الإلكتروني**: ملخصات دورية (`Digests`) للموظفين وإشعارات فورية للأحداث الحرجة.
2. **أتمتة النسخ الاحتياطي**: ربط جدولة `backup_settings` بـ Cron خارجي وتنفيذ اختبار استعادة تلقائي.
3. **صفحة تفاصيل مبيعة البائع (`/seller/orders/[orderItemId]`)**: عرض تفاصيل كود المبيعة وحالة التسليمات للبائع دون كشف هوية المشتري.
