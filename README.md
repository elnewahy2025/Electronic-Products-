# منصة بيع المنتجات الرقمية (Electronic Products Platform)

منصة عربية متعددة البائعين لبيع وتسليم المنتجات الرقمية بأمان عالٍ، مبنية باستخدام **Next.js 14 (App Router)** و **Supabase (PostgreSQL + Auth + RLS + Storage)** مع ربط مباشر بحسابات **Google Drive** الخاصة بالبائعين.

## المميزات الأساسية
- **رفع مباشر إلى Google Drive (Direct-to-Drive Resumable Upload):** الملفات تُرفع مباشرة من متصفح البائع إلى حسابات Google Drive المربوطة دون المرور عبر خوادم Vercel، مع توزيع تلقائي للحصص (`quota`) ودعم استئناف الرفع.
- **فحص تلقائي ومعاينات موسومة بعلامة مائية:** فحص التوقيع الرقمي للملفات (`Magic Bytes`) وعزل الملفات المشبوهة، مع توليد معاينات موسومة بعلامة مائية قطرية (`{platform_name} — نسخة غير مرخصة`) بينما يُسلَّم الملف الأصلي للمشتري نظيفًا بدون علامة مائية.
- **نظام أكواد الشراء وجلسات التنزيل المحمية:**
  - أكواد شراء فريدة مخزنة ببصمة `HMAC-SHA256` مع حماية ضد التخمين (`Rate Limiting`) وسجل محاولات التفعيل.
  - جلسات تنزيل محددة بـ 4 ساعات (قابلة للتعديل من Super Admin) وحد أقصى 3 محاولات تنزيل مكتملة لكل منتج (ZIP كامل أو اكتمال الملفات المنفردة).
  - دعم الجلسات الجزئية (`ExpiredPartial`) وجلسات التعويض الإدارية (بحد أقصى 3 جلسات تعويضية لكل كود منتج `code_id`) وطلبات استثناء المحاولات بقرار حصري من `Super Admin`.
  - منع كامل لإلغاء أو سحب الأكواد أو الجلسات بعد تأكيد التسليم أو بدء التنزيل، حتى من قِبل `Super Admin`.
- **الإدارة المالية وتعدد العملات:** دعم `USD, EGP, SAR, KWD` مع تثبيت سعر الصرف لحظة الشراء فقط، ومحافظ البائعين وطلبات السحب (بحد أدنى افتراضي 100 دولار).
- **نظام صلاحيات دقيق وسجل تدقيق غير قابل للتعديل (`Append-Only Audit Log`):** مصادقة ثنائية (`2FA / TOTP`) إلزامية للأدوار الإدارية، وسياسات `Row-Level Security (RLS)` شاملة، وسجل تدقيق محمي ضد الحذف أو التعديل.

## الوثائق المرجعية (`docs/`)
| الوثيقة | المحتوى |
|---|---|
| [`docs/01-requirements-final.md`](docs/01-requirements-final.md) | وثيقة المتطلبات النهائية الكاملة والملحق التنفيذي المغلق |
| [`docs/02-erd-dictionary.md`](docs/02-erd-dictionary.md) | مخطط العلاقات (`Mermaid ERD`) وقاموس البيانات والقيود وآلات الحالة |
| [`docs/03-settings-tables.md`](docs/03-settings-tables.md) | تصميم جداول الإعدادات الأحد عشر المنفصلة (`Singleton Settings Tables`) |
| [`docs/04-permissions-matrix.md`](docs/04-permissions-matrix.md) | مصفوفة الصلاحيات الكاملة (الإدارة + **مصفوفة صلاحيات مسار التنزيل والتعويض والاستثناء** + التقييمات) |
| [`docs/05-audit-events.md`](docs/05-audit-events.md) | قاموس أحداث سجل التدقيق (`audit_logs`) وقواعد الحماية والأرشفة |
| [`docs/06-testing-checklist.md`](docs/06-testing-checklist.md) | قائمة الاختبارات الإلزامية قبل الإطلاق |
| [`docs/07-implementation-plan.md`](docs/07-implementation-plan.md) | خطة التنفيذ المرحلية المحدّثة (0–14) وخريطة الترحيلات (`001`–`027`) والنقاط المتبقية |
| [`docs/08-rls-matrix.md`](docs/08-rls-matrix.md) | مصفوفة `RLS` التفصيلية لكل جدول، العروض الآمنة، المشغلات، وتحصين دوال `SECURITY DEFINER` |
| [`docs/drive-upload-flow.md`](docs/drive-upload-flow.md) | تدفق ربط Google Drive والرفع المباشر القابل للاستئناف وإدارة الحصص |
| [`docs/scan-preview-flow.md`](docs/scan-preview-flow.md) | خط أنابيب الفحص التلقائي، العزل، وتوليد المعاينات الموسومة بالعلامة المائية |
| [`docs/download-service-contract.md`](docs/download-service-contract.md) | عقد خدمة بث التنزيل المستقلة (`Download Streaming Service`) |
| [`docs/redeem-hardening.md`](docs/redeem-hardening.md) | تحصين نقطة تفعيل الأكواد (`/api/redeem`) وحدود المحاولات ونموذج التهديدات |
| [`docs/categories-management.md`](docs/categories-management.md) | إدارة التصنيفات الهرمية والحماية من الحلقات |
| [`docs/notifications.md`](docs/notifications.md) | نظام الإشعارات الفورية ومشغلات قاعدة البيانات التلقائية |
| [`docs/security-review.md`](docs/security-review.md) | المراجعة الأمنية الشاملة، الثغرات المكتشفة وإصلاحاتها في `027_security_hardening.sql` |

## هيكل المشروع
```text
├── docs/                     # وثائق المتطلبات، ERD، مصفوفة الصلاحيات وRLS، العقود، والأمان
├── supabase/
│   ├── config.toml           # إعدادات Supabase المحلية
│   └── migrations/           # ملفات قاعدة البيانات (001 إلى 027)
├── src/
│   ├── app/                  # صفحات ومسارات Next.js App Router و API Routes
│   ├── components/           # مكونات الواجهة (Storefront, Buyer, Seller, Admin)
│   └── lib/                  # الخدمات الخادمية، المصادقة، التشفير، وربط Google Drive
└── tests/e2e/                # اختبارات Playwright الشاملة (01 إلى 04)
```

## التشغيل المحلي
1. انسخ ملف البيئة `.env.example` إلى `.env.local` واضبط متغيرات Supabase و Google OAuth ومفاتيح التشفير:
   ```bash
   cp .env.example .env.local
   ```
2. ثبّت الحزم وشغّل خادم التطوير:
   ```bash
   pnpm install
   pnpm dev
   ```
3. لتطبيق قاعدة البيانات على Supabase:
   ```bash
   pnpm db:push
   ```
4. لتشغيل اختبارات النهاية إلى النهاية (Playwright E2E):
   ```bash
   cp .env.test.example .env.test
   pnpm test:e2e
   ```
