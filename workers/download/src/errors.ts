export type ErrorCode =
  | 'BAD_REQUEST'
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'CONFIG_ERROR'
  | 'RESOLVE_REJECTED'
  | 'RESOLVE_UNAVAILABLE'
  | 'RESOLVE_BAD_RESPONSE'
  | 'DRIVE_FAILED'
  | 'SIZE_MISMATCH'
  | 'CHECKSUM_MISMATCH'
  | 'CLIENT_ABORT'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'INTERNAL';

/** Errors with an explicit public status/code. Never carry token or file data. */
export class DownloadError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, status: number, message?: string) {
    super(message ?? code);
    this.name = 'DownloadError';
    this.code = code;
    this.status = status;
  }
}

export function toDownloadError(error: unknown): DownloadError {
  if (error instanceof DownloadError) return error;
  return new DownloadError('INTERNAL', 500);
}

/**
 * Safe logging: only a stable code and the token nonce (never the token,
 * signature, access_token, resolver body, file bytes, or response headers).
 */
export function logFailure(code: string, nonce?: string): void {
  console.error('download.failure', { code, nonce: nonce ?? null });
}
