import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  consumeRateLimit,
  getTrustedClientIp,
  logSecurityEvent,
} from '@/lib/security/rate-limit';

/**
 * CSP violation report endpoint.
 * Receives application/csp-report (legacy) or application/reports+json.
 * Uses a bounded streaming read (max 8 KiB) so oversized unauthenticated
 * bodies are rejected before buffering, sanitizes fields/URLs, logs to stdout,
 * and persists rate-limited violation events to `security_events`.
 */

const MAX_REPORT_BYTES = 8192;

const reportShape = z.object({
  'violated-directive': z.string().max(200).optional(),
  'effective-directive': z.string().max(200).optional(),
  'blocked-uri': z.string().max(500).optional(),
  'document-uri': z.string().max(500).optional(),
});

async function readBoundedText(req: NextRequest, maxBytes: number): Promise<string | null> {
  const declaredLength = Number(req.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return null;
  }

  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(combined);
}

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
    const body = await readBoundedText(req, MAX_REPORT_BYTES);

    if (body === null) {
      return new NextResponse(null, { status: 413 });
    }
    if (!body) {
      return new NextResponse(null, { status: 204 });
    }

    const json = JSON.parse(body);
    const candidates: unknown[] = contentType.includes('application/reports+json')
      ? Array.isArray(json)
        ? json.map((entry: any) => entry?.body ?? entry)
        : [json?.body ?? json]
      : [json?.['csp-report'] ?? json];

    const sanitizedReports = candidates
      .slice(0, 10)
      .map(sanitize)
      .filter((r): r is NonNullable<ReturnType<typeof sanitize>> => r !== null);

    if (sanitizedReports.length > 0) {
      for (const safe of sanitizedReports) {
        console.warn('[csp-report]', JSON.stringify(safe));
      }

      // Persist bounded CSP reports to security_events (rate-limited per IP to prevent DB flooding)
      const ip = getTrustedClientIp(req);
      const rl = await consumeRateLimit({
        scope: 'security:csp_report:ip',
        key: ip ?? 'unknown',
        limit: 30,
        windowSeconds: 3600,
        ip,
      });
      if (rl.allowed) {
        await logSecurityEvent({
          type: 'csp_violation',
          ip,
          userAgent: req.headers.get('user-agent'),
          severity: 'low',
          details: { reports: sanitizedReports.slice(0, 3) },
        });
      }
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
