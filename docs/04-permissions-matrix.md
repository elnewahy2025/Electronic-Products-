# مصفوفة الصلاحيات

## صلاحيات الإدارة
| الصلاحية | Super Admin | الأدمن | الموظف | البائع |
|---|---|---|---|---|
| settings.manage | ✔ | ✖ | ✖ | ✖ |
| role.manage / permission.assign | ✔ | ✖ | ✖ | ✖ |
| staff.manage | ✔ | ✖ | ✖ | ✖ |
| seller.read | ✔ | ✔ | ✔ بصلاحية | — |
| seller.approve / seller.reject | ✔ | ✔ بصلاحية | ✔ بصلاحية | ✖ |
| seller.suspend | ✔ | ✔ بصلاحية | ✔ بصلاحية | ✖ |
| product.read.any | ✔ | ✔ | ✔ بصلاحية | ✖ (منتجاته فقط) |
| product.suspend / product.reject | ✔ | ✔ بصلاحية | ✔ بصلاحية | ✖ |
| product.delete.any | ✔ | ✔ بصلاحية | ✖ | منتجاته فقط |
| category.manage | ✔ | ✔ بصلاحية | ✔ بصلاحية | ✖ |
| filetype.manage | ✔ | ✔ بصلاحية | ✖ | ✖ |
| file.quarantine / file.delete | ✔ | ✔ بصلاحية | ✔ بصلاحية | ملفاته فقط |
| file.preview.regenerate | ✔ | ✔ بصلاحية | ✔ بصلاحية | منتجاته فقط |
| code.issue / code.revoke | ✔ | ✔ بصلاحية | ✔ بصلاحية | ✖ |
| code.confirm_delivery | ✔ | ✔ | ✔ بصلاحية | ✖ |
| code.read.any | ✔ | ✔ | ✔ بصلاحية | ✖ |
| download.session.revoke / extend | ✔ | ✔ بصلاحية | ✔ بصلاحية | ✖ |
| download.compensation.request | ✔ | ✔ بصلاحية | ✔ بصلاحية | ✖ |
| download.compensation.approve / reject | ✔ | ✔ بصلاحية | ✔ بصلاحية | ✖ |
| download.attempt.exception.decide | ✔ | ✖ | ✖ | ✖ |
| commission.manage (عام) | ✔ | ✖ | ✖ | ✖ |
| commission.seller.override | ✔ | ✔ بصلاحية | ✖ | ✖ |
| exchange_rate.manage | ✔ | ✖ | ✖ | ✖ |
| payout.read | ✔ | ✔ بصلاحية | ✔ بصلاحية | طلباته فقط |
| payout.approve / reject | ✔ | ✔ بصلاحية | ✔ بصلاحية | ✖ |
| wallet.adjust | ✔ | ✖ | ✖ | ✖ |
| review.delete | ✔ | ✔ | ✔ بصلاحية | ✔ على منتجاته |
| review.reply | ✔ | ✔ | ✔ بصلاحية | ✖ |
| report.read / report.resolve | ✔ | ✔ | ✔ بصلاحية | ✖ |
| backup.run | ✔ | ✖ | ✖ | ✖ |
| backup.read | ✔ | ✔ بصلاحية | ✖ | ✖ |
| backup.restore | ✔ | ✖ | ✖ | ✖ |
| retention.manage | ✔ | ✖ | ✖ | ✖ |
| audit.read | ✔ | ✔ | ✔ بصلاحية | ✖ |
| audit.export | ✔ | ✔ بصلاحية | ✖ | ✖ |

## قواعد ثابتة
- كل صلاحية تُفرض مرتين: RLS + تحقق خادمي
- البائع لا يملك أي صلاحية إدارية مهما مُنح
- الموظف لا يصل إلى settings, roles, staff, backup.restore, exchange_rate, attempt.exception مطلقًا
- كل عملية حساسة تُسجَّل في audit_logs قبل التنفيذ وبعده
- المشتري لا يقرأ إلا جلساته وطلباته، ولا يرى admin_reason إلا عند الرفض
- البائع لا يملك أي صلاحية على جلسات التنزيل أو المحاولات أو التعويض
- الموظف لا يملك download.attempt.override مطلقًا