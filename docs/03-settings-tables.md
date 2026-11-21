# جداول الإعدادات المنفصلة
كل جدول صف واحد (Singleton) بقيد id SMALLINT PRIMARY KEY CHECK(id=1).
التعديل مسجّل في audit_logs تلقائيًا.

## general_settings
- id SMALLINT PK CHECK(id=1)
- default_currency CHAR(3) DEFAULT 'USD'
- allowed_currencies CHAR(3)[] DEFAULT {EGP,KWD,SAR,USD}
- platform_name TEXT
- platform_contact_email CITEXT
- platform_contact_phone TEXT
- timezone TEXT DEFAULT 'Africa/Cairo'
- maintenance_mode BOOLEAN DEFAULT false
- updated_by, updated_at

## pricing_settings
- id SMALLINT PK CHECK(id=1)
- min_product_price NUMERIC(18,4)
- min_product_price_currency CHAR(3) DEFAULT 'USD'
- updated_by, updated_at

## download_settings
- id SMALLINT PK CHECK(id=1)
- session_duration_hours SMALLINT DEFAULT 4
- max_attempts_per_product SMALLINT DEFAULT 3
- code_validity_hours SMALLINT DEFAULT 72
- partial_session_new_duration_hours SMALLINT DEFAULT 4
- updated_by, updated_at

## compensation_settings
- id SMALLINT PK CHECK(id=1)
- max_sessions_per_product SMALLINT DEFAULT 3
- session_duration_hours SMALLINT DEFAULT 4
- requires_admin_approval BOOLEAN DEFAULT true
- reason_required BOOLEAN DEFAULT true
- updated_by, updated_at

## attempt_exception_settings
- id SMALLINT PK CHECK(id=1)
- warning_threshold SMALLINT DEFAULT 5
- reason_required BOOLEAN DEFAULT true
- super_admin_only BOOLEAN DEFAULT true
- updated_by, updated_at

## watermark_settings
- id SMALLINT PK CHECK(id=1)
- text_template TEXT DEFAULT '{platform_name} — نسخة غير مرخصة'
- opacity_level ENUM(low,medium,high) DEFAULT 'medium'
- direction ENUM(diagonal,horizontal) DEFAULT 'diagonal'
- apply_to_previews_only BOOLEAN DEFAULT true
- apply_to_delivered_files BOOLEAN DEFAULT false
- video_style ENUM(static,periodic,both) DEFAULT 'both'
- updated_by, updated_at

## backup_settings
- id SMALLINT PK CHECK(id=1)
- schedule ENUM(daily,weekly,manual_only) DEFAULT 'weekly'
- manual_enabled BOOLEAN DEFAULT true
- retention_days SMALLINT DEFAULT 90
- storage_provider ENUM(r2,s3,admin_server)
- encryption_enabled BOOLEAN DEFAULT true
- restore_test_frequency_days SMALLINT DEFAULT 30
- include_files BOOLEAN DEFAULT true
- updated_by, updated_at

## audit_settings
- id SMALLINT PK CHECK(id=1)
- retention_days SMALLINT DEFAULT 180
- post_retention_action ENUM(archive,archive_and_keep_index) DEFAULT 'archive'
- append_only_enforced BOOLEAN DEFAULT true (غير قابل للتعديل)
- updated_by, updated_at

## security_settings
- id SMALLINT PK CHECK(id=1)
- mfa_enforced_roles TEXT[] DEFAULT {super_admin,admin,staff}
- code_rate_limit_per_hour INT DEFAULT 10
- login_rate_limit_per_hour INT DEFAULT 20
- session_idle_timeout_minutes INT DEFAULT 60
- password_min_length SMALLINT DEFAULT 10
- updated_by, updated_at

## payout_settings
- id SMALLINT PK CHECK(id=1)
- minimum_amount NUMERIC(18,4) DEFAULT 100
- minimum_currency CHAR(3) DEFAULT 'USD'
- allowed_methods TEXT[]
- updated_by, updated_at

## commission_settings
- id SMALLINT PK CHECK(id=1)
- default_rate NUMERIC(5,4)
- per_seller_override_enabled BOOLEAN DEFAULT true
- per_product_type_override_enabled BOOLEAN DEFAULT true
- updated_by, updated_at

## قواعد عامة
1. RLS: القراءة حسب الدور، الكتابة Super Admin فقط
2. استثناء: security_settings.mfa_enforced_roles وaudit_settings.append_only_enforced لا تُعدّل بعد الإعداد الأول
3. كل UPDATE يُسجَّل في audit_logs مع before_value/after_value
4. القيم تُقرأ من قاعدة البيانات مع تحقق من نطاق منطقي
5. تخزين مؤقت في الخادم مع إبطال فوري عند التعديل