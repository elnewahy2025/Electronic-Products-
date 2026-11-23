# File Screening Risk Record

## Status
- **Control implemented:** file type/signature screening on upload completion.
- **Control not implemented:** malware/AV scanning, archive expansion, behavioral analysis.
- **Risk acceptance:** documented here; deployment owner sign-off is still required.

Owner: ____________________  Date: ____________

## What the current control does
`src/lib/files/signature.ts` inspects the first 8 KiB fetched by
`src/lib/server/services/scan-service.ts` and compares detected magic bytes with
the seller-declared extension/MIME. A mismatch, missing storage location, or
fetch failure quarantines the file version via `quarantine_file`.

Zip-based formats (docx/xlsx/pptx/zip) are recognized as a type but are **not
expanded or inspected internally**.

## Accepted risk
Malware or unwanted executable content can be embedded inside an allowed file
type or inside a zip-based container and will not be detected by this control.
Quarantine here means “type/signature mismatch or screening failure”, not
“malware-free”.

## Compensating controls
- Uploads are limited by allowed types, size, and seller quota checks.
- Files are not delivered until preview processing marks them ready.
- Quarantine records and seller/admin notifications exist for screening failures.
- Download sessions are short-lived and separately authorized.

## Review triggers
Re-evaluate this record and implement isolated full-object AV scanning when any
of the following occurs:
- a new archive/executable-capable file type is allowed;
- files are served to users outside the current download-session model;
- a malware incident or credible report affects uploaded content;
- a provider offers an isolated scanner that can be bounded by size/time and
  archive expansion limits.

## Operational requirement
If full AV scanning is added, fail closed: scanner timeout, error, or positive
verdict must quarantine the file; archive expansion must have file-count,
byte-size, depth, and encryption limits.
