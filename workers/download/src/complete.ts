import type { Config } from './env';

export interface CompletionFile {
  file_version_id: string;
  bytes_sent: number;
  checksum: string;
}

export interface CompleteDeps {
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  onFailure?: (code: 'COMPLETE_REJECTED' | 'COMPLETE_FAILED', status?: number) => void;
}

const MAX_ATTEMPTS = 3;

function defaultOnFailure(code: 'COMPLETE_REJECTED' | 'COMPLETE_FAILED', status?: number): void {
  // No token, session id, access token or body is logged here.
  console.error('download.complete', { code, status: status ?? null });
}

/**
 * POST the delivery receipt. Transport errors and 5xx are retried up to three
 * attempts with backoff; 4xx is terminal. The caller runs this in waitUntil.
 */
export async function postCompletion(
  token: string,
  sessionId: string,
  files: CompletionFile[],
  config: Config,
  deps: CompleteDeps = {}
): Promise<void> {
  const fetchImpl = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const onFailure = deps.onFailure ?? defaultOnFailure;
  const url = `${config.appInternalBase}/api/download/${encodeURIComponent(sessionId)}/complete`;
  const body = JSON.stringify({ token, files });
  let retriableFailure = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': config.token,
        },
        body,
        cache: 'no-store',
      });
      if (response.ok) return;
      if (response.status >= 400 && response.status < 500) {
        onFailure('COMPLETE_REJECTED', response.status);
        return;
      }
      retriableFailure = true;
    } catch {
      retriableFailure = true;
    }

    if (attempt < MAX_ATTEMPTS) await sleep(100 * 2 ** (attempt - 1));
  }

  if (retriableFailure) onFailure('COMPLETE_FAILED');
}
