import { DownloadError } from './errors';
import type { Config } from './env';
import type { TokenPayload } from './token';

export interface ResolvedFile {
  file_version_id: string;
  drive_url: string;
  filename: string;
  mime: string;
  size_bytes: number;
  sha256?: string | null;
  /** Short-lived bearer token scoped to THIS file's Drive account only. */
  access_token: string;
}

export interface Resolution {
  type: 'single' | 'zip';
  session_id: string;
  files: ResolvedFile[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-fA-F]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseFile(value: unknown): ResolvedFile | null {
  if (!isRecord(value)) return null;
  const f = value;
  if (typeof f.file_version_id !== 'string' || !UUID_RE.test(f.file_version_id)) return null;
  if (typeof f.drive_url !== 'string' || !f.drive_url) return null;
  if (typeof f.filename !== 'string' || !f.filename) return null;
  if (typeof f.mime !== 'string') return null;
  // Each file may live in a different seller Drive account: the resolver must
  // supply a bearer token for that file alone. Never reuse one here.
  if (typeof f.access_token !== 'string' || !f.access_token) return null;
  if (typeof f.size_bytes !== 'number' || !Number.isSafeInteger(f.size_bytes) || f.size_bytes < 0) {
    return null;
  }
  if (f.sha256 !== undefined && f.sha256 !== null && (typeof f.sha256 !== 'string' || !SHA256_RE.test(f.sha256))) {
    return null;
  }

  // Only https source URLs are accepted. The resolver is trusted, but this
  // stops a malformed response from turning the worker into an http proxy.
  try {
    if (new URL(f.drive_url).protocol !== 'https:') return null;
  } catch {
    return null;
  }

  return {
    file_version_id: f.file_version_id,
    drive_url: f.drive_url,
    filename: f.filename,
    mime: f.mime,
    size_bytes: f.size_bytes,
    sha256: f.sha256 ?? null,
    access_token: f.access_token,
  };
}

function parseResolution(value: unknown): Resolution | null {
  if (!isRecord(value)) return null;
  if (value.type !== 'single' && value.type !== 'zip') return null;
  if (typeof value.session_id !== 'string' || !UUID_RE.test(value.session_id)) return null;
  if (!Array.isArray(value.files) || value.files.length === 0) return null;

  const files: ResolvedFile[] = [];
  const seen = new Set<string>();
  for (const raw of value.files) {
    const file = parseFile(raw);
    if (!file || seen.has(file.file_version_id)) return null;
    seen.add(file.file_version_id);
    files.push(file);
  }

  return {
    type: value.type,
    session_id: value.session_id,
    files,
  };
}

function statusToError(status: number): DownloadError {
  if (status === 409 || status === 410) return new DownloadError('RESOLVE_REJECTED', 410);
  if (status === 429) return new DownloadError('RESOLVE_REJECTED', 429);
  if (status >= 400 && status < 500) return new DownloadError('RESOLVE_REJECTED', 403);
  return new DownloadError('RESOLVE_UNAVAILABLE', 502);
}

/**
 * Exchange the capability token for short-lived source URLs.
 * The resolver is the single-use authority; the worker never decides reuse.
 */
export async function resolveToken(
  token: string,
  payload: TokenPayload,
  config: Config,
  fetchImpl: typeof fetch = fetch
): Promise<Resolution> {
  const url = `${config.appInternalBase}/api/internal/resolve-token`;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': config.token,
      },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    });
  } catch {
    throw new DownloadError('RESOLVE_UNAVAILABLE', 502);
  }

  if (!response.ok) throw statusToError(response.status);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new DownloadError('RESOLVE_BAD_RESPONSE', 502);
  }

  const resolution = parseResolution(body);
  if (!resolution) throw new DownloadError('RESOLVE_BAD_RESPONSE', 502);

  // Cross-check the resolver against the locally verified token so a confused
  // or compromised resolver cannot stream a different session's files.
  if (resolution.session_id !== payload.sid || resolution.type !== payload.typ) {
    throw new DownloadError('RESOLVE_REJECTED', 403);
  }
  if (payload.typ === 'single') {
    if (resolution.files.length !== 1 || resolution.files[0].file_version_id !== payload.fid) {
      throw new DownloadError('RESOLVE_REJECTED', 403);
    }
  }

  return resolution;
}
