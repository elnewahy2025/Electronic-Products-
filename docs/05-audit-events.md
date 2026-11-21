# أحداث سجل التدقيق

## المصادقة والهوية
- auth.login_success
- auth.login_failed
- auth.2fa_enabled
- auth.2fa_failed
- auth.role_changed
- auth.permission_granted
- auth.permission_revoked

## البائعون
- seller.application_submitted
- seller.approved
- seller.rejected
- seller.suspended
- seller.reinstated
- seller.drive_linked
- seller.drive_revoked
- seller.agreement_accepted

## المنتجات والملفات
- product.created
- product.published
- product.paused
- product.suspended
- product.deleted
- file.uploaded
- file.scan_passed
- file.scan_failed
- file.quarantined
- file.deleted
- preview.generated
- filetype.changed

## الطلبات والأكواد
- purchase_request.created
- purchase_request.approved
- purchase_request.cancelled
- purchase_request.cancel_blocked_after_delivery
- code.issued
- code.delivery_confirmed_auto
- code.delivery_confirmed_manual
- code.delivery_resent
- code.replacement_issued
- code.revocation_suggested
- code.revocation_confirmed
- code.revocation_blocked_after_delivery
- code.redeemed
- code.expired
- code.bruteforce_detected

## التنزيل والتعويض والاستثناء
- session.created
- session.completed
- session.expired
- session.expired_partial
- file.delivered
- zip.delivered
- attempt.consumed
- attempt.exhausted
- attempt.exception_requested
- attempt.exception_decided
- compensation.requested
- compensation.approved
- compensation.rejected
- compensation.fulfilled
- compensation.auto_requested_drive_failure
- compensation_session.created
- session.revocation_suggested
- session.revocation_confirmed
- session.revocation_blocked_after_delivery
- session.drive_failure_detected
- session.revoked

## المالية
- exchange_rate.updated
- commission.updated
- payout.requested
- payout.approved
- payout.rejected
- payout.paid
- wallet.adjusted

## الإدارة والتشغيل
- review.created
- review.deleted
- review.replied
- review.reply_deleted
- report.resolved
- backup.started
- backup.completed
- backup.failed
- backup.manual_triggered
- restore.started
- restore.completed
- restore.failed
- retention.updated
- settings.updated
- audit.archived

## حقول كل حدث
- actor_id
- actor_role
- action
- entity_type
- entity_id
- before_value
- after_value
- reason
- ip
- user_agent
- created_at
- request_id

## قواعد
- لا UPDATE ولا DELETE على الجدول لأي دور
- الكتابة عبر مسار خادمي فقط (SECURITY DEFINER)
- أرشفة بعد 180 يومًا إلى تخزين بارد
- البحث والاستعادة يبقيان متاحين بعد الأرشفة
- أي محاولة إلغاء بعد التسليم تُرفض وتُسجَّل كـ*_blocked_after_delivery