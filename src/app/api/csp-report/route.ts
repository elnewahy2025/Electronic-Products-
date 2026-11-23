import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * CSP violation report endpoint.
 * Receives application/csp-report (legacy) or application/reports+json.
 * Logs only an allowlisted, URL-sanitized summary to stdout.
 *
 * Enable by setting CSP_REPORT_URI=/api/csp-report in .env.local
 */

const reportShape = z.object({
  'violated-directive': z.string().max(200).optional(),
  'effective-directive': z.string().max(200).optional(),
  'blocked-uri': z.string().max(500).optional(),
  'document-uri': z.string().max(500).optional(),
});

function cleanUrl(value: string | undefined, pathOnly = false): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return pathOnly ? url.pathname : `${url.origin}${url.pathname}`;
  } catch {
    return value.split('?')[0]!.split('#')[0]!.slice(0, 200);
  }
}

function sanitize(input: unknown) {
  const parsed = reportShape.safeParse(input);
  if (!parsed.success) return null;
  const safe = {
    violatedDirective: parsed.data['violated-directive'],
    effectiveDirective: parsed.data['effective-directive'],
    blockedUri: cleanUrl(parsed.data['blocked-uri']),
    documentUri: cleanUrl(parsed.data['document-uri'], true),
  };
  return Object.values(safe).some(Boolean) ? safe : null;
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') ?? '';
    const body = await req.text();

    if (body.length > 8192) {
      // Reject oversized reports
      return new NextResponse(null, { status: 413 });
    }

    const json = JSON.parse(body);
    const candidates: unknown[] = contentType.includes('application/reports+json')
      ? Array.isArray(json)
        ? json.map((entry: any) => entry?.body ?? entry)
        : [json?.body ?? json]
      : [json?.['csp-report'] ?? json];

    for (const candidate of candidates) {
      const safe = sanitize(candidate);
      if (safe) console.warn('[csp-report]', JSON.stringify(safe));
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
