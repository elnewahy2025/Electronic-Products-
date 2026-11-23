# Secret Scanning

## CI
The `secret-scan` job in `.github/workflows/ci.yml` checks out the **full**
history (`fetch-depth: 0`) and runs gitleaks 8.30.1 against every commit:

```bash
gitleaks detect --source . --log-opts="--all --full-history" --redact
```

No repository secrets are required. A finding fails the job.

## Local full-history scan

```bash
pnpm scan:secrets
```

This requires gitleaks to be installed and on `PATH`.

## Pre-commit hook

```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit   # on macOS/Linux
```

The hook runs `gitleaks protect --staged --redact`. On Windows, enable it with
Git for Windows after making the script executable.

## Allowlisting

Only test fixtures may be allowlisted. New occurrences should use an inline comment:

```yaml
ENCRYPTION_KEY: <base64-32-byte-test-key> # gitleaks:allow
```

Historical occurrences that predate the inline comment are listed in
`.gitleaksignore` with their exact fingerprint. Never allowlist a real credential.
If a real secret is found, rotate it first,
then remove it from history or add a tightly scoped fingerprint only after the
owner confirms it is inactive.

## Current status

A full-history gitleaks scan found only the fixed CI test `ENCRYPTION_KEY`
fixture, which decodes to a 32-byte ASCII test value and is shared by the app
and Playwright. It is allowlisted in `ci.yml`. No real credentials were found
in the repository history; env files were never committed.
