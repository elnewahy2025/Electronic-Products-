# Legal Review Drafts — DRAFT, NOT LEGAL ADVICE

> **STATUS: DRAFT. NOT LEGAL ADVICE. DO NOT PUBLISH AS-IS.**
>
> These clauses are drafting material for qualified counsel in the jurisdictions where the
> platform will operate. They reflect the current *implemented product behaviour* only.
> They are not a legal opinion, do not create a lawyer-client relationship, and must not be
> shipped as the live Seller Agreement, Privacy Policy, or Terms of Use until reviewed,
> translated into Arabic by a qualified translator, and signed off. See the launch checklist
> in section 6.

## 0. Product facts that the final texts must reflect

| Fact | Required treatment in the legal texts |
|---|---|
| Arabic RTL marketplace for digital products | All published texts must be in Arabic (RTL); the English text here is a drafting source only. |
| Payment is made outside the platform; settlement with sellers is manual | State this prominently before checkout, in the Seller Agreement and in the Terms. The platform must not be described as a payment processor, escrow agent, or merchant of record for the buyer's money. |
| No financial refunds issued by the platform | State the no-refund rule clearly and explain the non-financial remedies (download session, compensation session, attempt exception, support review). |
| Platform role is strictly limited to issuing download codes and protected delivery sessions | Do not promise storage ownership, file authorship, or custody of seller files in the platform's own name. |
| Original files remain in the seller's own Google Drive account | Seller is responsible for file availability, accuracy, licensing and Drive account maintenance. |
| Guest purchases can be viewed by matching the customer email | Disclose that email address is the access key for guest orders and codes; require the buyer to protect it. |
| Codes: 72-hour validity; sessions: 4 hours; 3 completed attempts; up to 3 compensation sessions per code | Describe these as operational limits, not as a guarantee of unlimited access. |
| Staff/admin MFA is mandatory | Describe administrative access controls in the security section. |
| Audit log is append-only | Describe retention and that administrative actions are recorded. |
| Reviews: seller replies only; deletion only by admin/staff from a seller support ticket | Describe the moderation path and the buyer-case blocking rules in the Terms and Seller Agreement. |

### Mandatory statement (exact wording to carry into the final Arabic texts)

> "Payment takes place outside the platform; the platform does not provide financial refunds; its role is strictly limited to issuing download codes and protected delivery sessions."

Counsel must approve the Arabic translation of this sentence and confirm that it appears:
1. On the public checkout flow before a purchase request is submitted.
2. In the Terms of Use accepted (or conspicuously acknowledged) at checkout.
3. In the Seller Agreement accepted before seller approval.
4. In any order confirmation email/notification sent to the buyer.

---

## 1. Seller Agreement — DRAFT CLAUSES

### 1.1 Parties and scope
This agreement is between the platform operator (the "Platform") and the approved seller
("Seller"). It governs the listing, promotion and delivery of digital products through the
Platform. It does not transfer ownership of the Seller's files, IP, or Google Drive account
to the Platform.

### 1.2 Eligibility, approval and ongoing obligations
- Seller must submit accurate identity/business information, accept this agreement, and
  connect at least one Google Drive account under the Seller's control before publishing.
- Approval may be withheld, suspended or withdrawn for breach, invalid content, or risk to
  buyers; the reasons and actor are recorded in the Platform's audit log.
- Seller must keep Drive authorisations valid, quotas available, and product versions
  complete; the Platform cannot deliver files from a revoked or unavailable Drive account.

### 1.3 Content, licensing and legal responsibility
- Seller represents and warrants that it owns or holds all rights necessary to distribute
  every product, preview, image, and description, and that publication does not infringe
  third-party IP, confidentiality, or publicity rights.
- Seller is solely responsible for the lawfulness, accuracy, safety, malware-free state and
  labelling of its files, including any third-party components and licence terms passed on
  to buyers.
- The Platform does not review every file for legal compliance. Scanning and quarantine are
  technical safeguards, not a legal clearance or endorsement.
- Seller indemnifies the Platform against claims, losses and regulatory action arising from
  Seller content, misrepresentation, or licence failures. Counsel to confirm scope and
  enforceability.

### 1.4 Payment and refunds (mandatory)
> "Payment takes place outside the platform; the platform does not provide financial refunds; its role is strictly limited to issuing download codes and protected delivery sessions."

- Buyers pay the Seller (or an off-platform settlement channel) directly. The Platform does
  not collect, hold, transmit, or refund buyer funds, and does not operate escrow.
- Seller is responsible for its own payment collection, receipts, tax invoices, VAT/sales
  tax, dispute handling and any refunds it chooses to grant under its own terms. Manual
  settlement and payout records shown in the Seller wallet are accounting records only.
- Platform-side remedies are limited to re-issuing/resending codes where permitted, opening
  a compensation session within the configured cap, granting attempt exceptions through the
  Super Admin, and support review. These are not financial refunds.

### 1.5 Digital delivery, codes and protected sessions
- On approval of a purchase request, the Platform issues a unique code stored as an HMAC
  hash; the plaintext is delivered once through the configured channel. Codes expire 72
  hours after issue and may be redeemed once.
- A successful redemption opens a protected download session lasting 4 hours by default.
  Three completed attempts are allowed per purchased item. A full ZIP counts as one attempt;
  individual files count as one attempt when all version files have been delivered.
  Technical failures before completion do not consume an attempt.
- Compensation sessions (maximum three per code) and attempt exceptions are administrative
  decisions recorded in the audit log; they are not entitlements and are not cash value.
- Codes cannot be revoked and purchase requests cannot be cancelled after code delivery;
  download sessions cannot be revoked after delivery has started. Attempts to do so are
  blocked and logged.

### 1.6 Seller Drive accounts
- Seller grants only the Drive scope required for its own files. Tokens are encrypted at
  rest; the Platform does not sell, share or use them for unrelated purposes.
- Seller must notify the Platform promptly of suspected token compromise or unauthorised
  file changes. Revocation is available from the Seller dashboard, subject to restrictions
  where files are already referenced by sales.

### 1.7 Reviews and moderation
- Buyers may leave one review per completed product purchase. Reviews show as "verified
  buyer"; the Platform does not publish buyer identity.
- Seller may reply to a review (one editable reply, maximum 2,000 characters) but may not
  edit the rating or body, and **may not delete a review directly**.
- To request removal, Seller opens a structured support ticket from `/seller/reviews` by
  choosing "request review deletion". The ticket must carry `product_id`, `order_item_id`
  and `review_id`. Only an Admin/Staff member holding `review.delete` may decide the ticket
  and delete the review from the admin support ticket detail page using the
  `delete_review_from_ticket` RPC, with a mandatory reason.
- Deletion is blocked while the buyer has a pending or approved compensation request, a
  pending or approved attempt exception, or an open or pending buyer-owned support ticket
  for the same review, order item or product. The audit event is `review.deleted_from_ticket`.
- Seller may not republish a deleted review. Counsel to confirm the enforceability of this
  moderation policy and any statutory review/publication rules.

### 1.8 Data, audit and access
- Seller consents to the Platform processing the data described in the Privacy Policy for
  operation, security, support and legal compliance.
- All staff/admin access requires MFA. Administrative actions are written to an append-only
  audit log retained and archived under the audit settings; Seller may request an extract of
  records concerning its own account where legally permitted.

### 1.9 Suspension, termination and survival
- The Platform may suspend listings or terminate the agreement for breach, legal risk, or
  safety concerns, with notice where practicable. Sections on payment/refunds, IP
  responsibility, indemnity, data, audit, confidentiality and dispute resolution survive.

---

## 2. Privacy Policy — DRAFT CLAUSES

### 2.1 Controller and scope
The Platform operator is the controller for account, order, code, download, review, support
and audit data. Sellers are independent controllers for their own customer/payment records
created off-platform. Counsel to confirm roles, joint-controllership analysis and the
correct legal entity name/address before publication.

### 2.2 Data collected
- **Accounts and authentication:** email, display name, OAuth identifiers, MFA enrolment
  metadata, role and permission assignments.
- **Guest purchases:** name, email, phone, optional notes, IP address, user agent, order and
  code records. **A guest order is visible to any authenticated user whose account email
  matches the customer email on the order.** Counsel to confirm this is adequately disclosed
  and lawful; consider adding a verification step for high-value accounts.
- **Delivery data:** code hash and prefix, redemption records, download sessions, attempts,
  deliveries and compensation/exception requests.
- **Seller data:** application information, signed agreement, encrypted Google Drive refresh
  tokens, product metadata, wallet and payout records.
- **Support/reviews:** support tickets and messages (including structured review-deletion
  requests), reviews and replies, content reports.
- **Security data:** append-only audit logs, security events, rate-limit and blocked-action
  records.

The Platform does not collect card numbers, bank credentials or payment instrument data in
v1, because payment happens outside the Platform.

### 2.3 Purposes and legal bases (draft — counsel to finalise)
Operation of the marketplace; issuing codes and protected delivery sessions; seller
settlement records; support and dispute handling; fraud/rate-limit prevention; security
auditing; legal compliance. Legal bases (contract, legitimate interests, legal obligation,
consent) must be mapped per jurisdiction by counsel.

### 2.4 Sharing and processors
- Supabase (database, auth, private storage), Vercel (application hosting), Google
  OAuth/Drive and Picker (seller authorisation and file storage), Cloudflare Worker
  (streaming/ZIP delivery), the configured SMTP/Resend provider (transactional email),
  and an independent R2/S3 bucket or Supabase Storage for administrator backups.
- Processors may act only on documented instructions. A current subprocessor list,
  data-processing agreements and transfer mechanism (e.g. SCCs) must be published or made
  available on request. Google Drive files remain in the Seller's account.
- The Platform does not sell personal data.

### 2.5 Retention and deletion
| Data | Indicative retention | Notes |
|---|---|---|
| Live audit logs | 180 days, then archived to cold storage; never hard-deleted from the audit trail | Append-only; `audit_settings.append_only_enforced` is immutable. |
| Database backups | 90 days by default (`backup_settings.retention_days`) | Stored separately from seller Drive accounts; restore restricted to Super Admin. |
| Orders, codes, delivery and wallet records | Retain for the applicable limitation/accounting period set by counsel | Needed for dispute and tax evidence; do not promise immediate erasure. |
| Support tickets and review-deletion requests | Retain for the support SLA plus the legal hold period | `product_id`, `order_item_id` and `review_id` are stored for moderation evidence. |
| Account data | Life of account plus legal hold | Deletion requests handled under applicable law. |

### 2.6 Security
RLS on all tables; encryption of Drive tokens; HMAC code hashing; mandatory MFA for
staff/admin (`security_settings.mfa_enforced_roles`); least-privilege service credentials;
append-only audit logs; periodic restore drills. No system is completely secure.

### 2.7 Rights and contact
Data subjects may request access, correction, deletion, restriction or portability where
applicable, and may complain to their local regulator. Requests go to the contact address
published in `general_settings.platform_contact_email`. Counsel to confirm statutory
deadlines and identity-verification steps.

### 2.8 Cookies and analytics
Describe only cookies/technologies actually deployed; confirm analytics scripts before
adding this section to the live policy.

---

## 3. Terms of Use — DRAFT CLAUSES

### 3.1 Acceptance and accounts
Browsing and previews are available without an account. An account is optional for buying,
but is required to manage orders, redeem codes, and use some buyer features. A guest order
is linked to the email used at checkout and can be viewed by signing in with the same email.
Users must provide accurate information and keep their email secure.

### 3.2 Payment, no refunds, delivery role (mandatory)
> "Payment takes place outside the platform; the platform does not provide financial refunds; its role is strictly limited to issuing download codes and protected delivery sessions."

By submitting a purchase request, the buyer acknowledges that:
- payment is completed outside the Platform and settled manually with the Seller;
- the Platform does not hold buyer funds and issues no financial refunds;
- its role is limited to issuing download codes and protected delivery sessions;
- the Seller is responsible for the product, its licence, its description, and any refund
  decision or receipt under applicable law.

### 3.3 Codes and download sessions
Codes expire after 72 hours and are single-use. Download sessions last 4 hours by default
and allow three completed attempts per purchased item. Technical failures before completion
do not consume an attempt. Partial sessions do not consume an attempt and are completed
through a compensation session for the remaining files only. Compensation is capped at three
sessions per code; additional attempts require a Super Admin decision. No code may be
revoked after delivery and no session may be revoked after delivery has started.

### 3.4 Buyer conduct
No abuse of rate limits, automated code guessing, sharing tokens, redistribution of files
in breach of the Seller's licence, uploading malware, harassment, or attempts to bypass RLS,
MFA or audit controls. Violations may result in blocked orders or account suspension and
are recorded in the audit log.

### 3.5 Reviews and seller replies
One review per completed product purchase; the Platform publishes "verified buyer" only.
Buyers may not edit or delete a published review. Sellers may reply but may not delete a
review themselves; deletion requires a structured seller support ticket and an Admin/Staff
decision under `review.delete`, subject to the buyer-case blocking rules in section 1.7.
Deleted reviews disappear from the public product page but remain in the audit trail.

### 3.6 Content reports and support path
Report unlawful content, delivery failures or suspected fraud through the support system.
Support triages tickets, may request information, and escalates to the Seller, the Platform,
or the relevant authority as appropriate. Support decisions on delivery are not monetary
refunds. Response-time targets are operational, not contractual guarantees, unless counsel
inserts a binding SLA.

### 3.7 Availability and limitation of liability
The Platform provides the service "as available"; sellers control the files in their own
Drive accounts. To the maximum extent permitted by law, the Platform excludes liability for
seller content, off-platform payments, indirect losses, and availability of third-party
services. Counsel must review exclusions against mandatory consumer rights; a no-refund
clause does not override non-waivable statutory remedies.

### 3.8 Changes, governing law and disputes
Updates to these terms will be notified through the Platform; material changes may require
re-acceptance. Before litigation, parties should use the support/escalation path. Governing
law, venue, language and any arbitration clause are **intentionally left blank** pending
counsel's choice of jurisdiction.

---

## 4. Supporting policy notes (for counsel, not for publication)

### 4.1 Data retention and audit logging
- `audit_logs` is append-only: `UPDATE` and `DELETE` are revoked for every role including
  `service_role`, and a trigger raises on any attempt. Live retention target is 180 days
  with cold archive (`audit_archives`), not erasure.
- `log_audit` is the only writer; every action records actor, role, action, entity, before
  and after values, reason, IP, user agent, request id and timestamp.
- Moderation events to monitor: `review.deleted_from_ticket`, `review.deleted`,
  `review_delete_requires_ticket`, `buyer_case_*` guard failures.

### 4.2 MFA and staff access
`security_settings.mfa_enforced_roles` defaults to `{super_admin, admin, staff}` and is
immutable after initial configuration. All administrative routes and operations are blocked
until TOTP is enabled. Any exception process (recovery codes, device loss) must be approved
by counsel/security and documented out of band; do not disable MFA for an individual as an
ad hoc fix.

### 4.3 Review moderation / ticket policy (operational summary)
1. Seller selects "request review deletion" on `/seller/reviews`.
2. Ticket stores `product_id`, `order_item_id`, `review_id` and the seller's reason.
3. Admin/Staff with `review.delete` reviews the ticket on the admin support detail page.
4. RPC `delete_review_from_ticket` checks authorisation, ticket status and linkage, then
   blocks deletion when a buyer compensation request, attempt exception or buyer-owned
   support ticket is pending/approved/open for the same review, item or product.
5. On success the review is soft-deleted, disappears publicly, and `review.deleted_from_ticket`
   is written to the audit log. Seller replies and stats remain available.
6. The legacy `delete_review` RPC is now service-role-only; no seller UI calls it.

---

## 5. Cross-reference to other operational documents

- Plan/limit assumptions: [`docs/plan-limits.md`](plan-limits.md)
- Independent backup storage: [`docs/backup-storage-config.md`](backup-storage-config.md)
- Production values to configure: [`docs/production-defaults.md`](production-defaults.md)
- Phased rollout: [`docs/soft-launch-plan.md`](soft-launch-plan.md)
- Review workflow: [`docs/seller-reviews.md`](seller-reviews.md)

---

## 6. REQUIRES QUALIFIED LEGAL REVIEW BEFORE LAUNCH — CHECKLIST

- [ ] Identify the contracting/controller legal entity, registration details and address.
- [ ] Confirm governing law, venue, language and any arbitration clause in all three texts.
- [ ] Confirm the no-refund wording is enforceable and does not override non-waivable
      consumer rights in Egypt and every target market; add required statutory language.
- [ ] Approve the Arabic translation of the mandatory off-platform payment/no-refund
      statement and verify its placement at checkout and in all three documents.
- [ ] Clarify the legal characterization of off-platform/manual settlement (no money held by
      Platform), including invoicing, VAT/sales tax, reporting and record-keeping duties.
- [ ] Review the guest-order email-matching access model against applicable privacy law.
- [ ] Complete a data-protection impact assessment and map purposes to legal bases.
- [ ] Publish/execute DPAs with Supabase, Vercel, Google, Cloudflare, the email provider and
      backup storage provider; confirm international transfer mechanisms.
- [ ] Confirm retention periods for orders, wallets, support tickets, reviews and backups
      against limitation periods and tax law.
- [ ] Confirm that seller content licensing warranties, takedown process and indemnity are
      enforceable and consistent with the DMCA-style notice path where relevant.
- [ ] Confirm review moderation/ticket policy complies with local rules on consumer reviews.
- [ ] Add mandatory age/eligibility, sanctions and acceptable-use language if required.
- [ ] Confirm MFA, audit retention and access controls meet sector/cyber regulations.
- [ ] Add named contact details (`general_settings.platform_contact_email`, phone, postal).
- [ ] Record counsel name, firm, review date, version number and sign-off in the launch log.
