import { NextRequest, NextResponse } from 'next/server';

/**
 * CSP violation report endpoint.
 * Receives application/csp-report (legacy) or application/reports+json.
 * Logs to stdout — in production, ship these to your observability stack.
 *
 * Enable by setting CSP_REPORT_URI=/api/csp-report in .env.local
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') ?? '';
    const body = await req.text();

    if (body.length > 8192) {
      // Reject oversized reports
      return new NextResponse(null, { status: 413 });
    }

    if (contentType.includes('application/csp-report')) {
      const parsed = JSON.parse(body);
      console.warn('[csp-report]', JSON.stringify(parsed));
    } else if (contentType.includes('application/reports+json')) {
      const parsed = JSON.parse(body);
      for (const report of Array.isArray(parsed) ? parsed : [parsed]) {
        console.warn('[csp-report]', JSON.stringify(report));
      }
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
