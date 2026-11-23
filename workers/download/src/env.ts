import { DownloadError } from './errors';

export interface Env {
  DOWNLOAD_SERVICE_TOKEN: string;
  APP_INTERNAL_URL: string;
}

/** Minimal subset of the Workers ExecutionContext used by this worker. */
export interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void;
}

export interface Config {
  token: string;
  appInternalBase: string;
}

export function readConfig(env: Env): Config {
  const token = typeof env?.DOWNLOAD_SERVICE_TOKEN === 'string' ? env.DOWNLOAD_SERVICE_TOKEN : '';
  const rawBase = typeof env?.APP_INTERNAL_URL === 'string' ? env.APP_INTERNAL_URL.trim() : '';

  if (!token || !rawBase) {
    throw new DownloadError('CONFIG_ERROR', 500);
  }

  try {
    const parsed = new URL(rawBase);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('unsupported protocol');
    }
    return { token, appInternalBase: parsed.origin };
  } catch {
    throw new DownloadError('CONFIG_ERROR', 500);
  }
}
