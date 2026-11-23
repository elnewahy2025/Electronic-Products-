-- 050_delivery_result_skipped.sql
-- M5: resend is not implemented yet. Delivery attempts need an honest
-- outcome so the UI and support never see a fabricated 'sent'.
ALTER TYPE delivery_result_enum ADD VALUE IF NOT EXISTS 'skipped';
