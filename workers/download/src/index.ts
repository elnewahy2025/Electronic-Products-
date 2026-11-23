import { DownloadError, logFailure, toDownloadError } from './errors';
import { readConfig, type Config, type Env, type WorkerContext } from './env';
import { verifyToken, type TokenPayload } from './token';
import { resolveToken, type ResolvedFile } from './resolve';
import { fetchDriveFile, type AuditedFile } from './drive';
import { buildZipStream } from './zip';
import { downloadHeaders, jsonError, preflight } from './headers';
import { postCompletion } from './complete';

interface PreparedFile {
  meta: ResolvedFile;
  audited: AuditedFile;
}

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // waitUntil always awaits through finish(), which handles rejections.
  void promise.catch(() => {});
  return { promise, resolve, reject };
}

/** The final transform resolves only after every output byte was handed off. */
function terminalStream(source: ReadableStream<Uint8Array>, done: Deferred): ReadableStream<Uint8Array> {
  // TS 5.6's WebWorker lib omits `cancel` from Transformer; the runtime calls
  // it on client abort, which must never resolve the completion gate.
  const transformer: Transformer<Uint8Array, Uint8Array> & {
    cancel?: (reason: unknown) => void;
  } = {
    flush() {
      done.resolve();
    },
    cancel(reason: unknown) {
      done.reject(reason ?? new DownloadError('CLIENT_ABORT', 499));
    },
  };
  return source.pipeThrough(new TransformStream<Uint8Array, Uint8Array>(transformer));
}

interface FinishArgs {
  token: string;
  sessionId: string;
  config: Config;
  files: PreparedFile[];
  done: Deferred;
  nonce: string;
  signal: AbortSignal;
}

async function finish(args: FinishArgs): Promise<void> {
  try {
    // A failed audit rejects immediately; the output stream may still be
    // draining, but no completion is allowed in that case.
    const audits = await Promise.all(args.files.map((file) => file.audited.result));
    if (args.signal.aborted) return;
    await args.done.promise;
    if (args.signal.aborted) return;
    await postCompletion(args.token, args.sessionId, audits, args.config);
  } catch (error) {
    const failure = toDownloadError(error);
    if (failure.code !== 'CLIENT_ABORT') logFailure(failure.code, args.nonce);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: WorkerContext): Promise<Response> {
    const url = new URL(request.url);
    const allowedOrigin = env.APP_INTERNAL_URL;
    if (url.pathname === '/stream' && request.method === 'OPTIONS') {
      return preflight(request, allowedOrigin);
    }

    let nonce: string | undefined;
    try {
      if (url.pathname !== '/stream') throw new DownloadError('NOT_FOUND', 404);
      if (request.method !== 'GET') throw new DownloadError('METHOD_NOT_ALLOWED', 405);

      const token = url.searchParams.get('token');
      if (!token) throw new DownloadError('INVALID_TOKEN', 401);

      const config = readConfig(env);
      const payload: TokenPayload | null = await verifyToken(token, config.token);
      if (!payload) throw new DownloadError('INVALID_TOKEN', 401);
      nonce = payload.n;

      const resolution = await resolveToken(token, payload, config);

      const prepared: PreparedFile[] = [];
      for (const file of resolution.files) {
        // Each file carries the bearer token for its own seller Drive account.
        prepared.push({ meta: file, audited: await fetchDriveFile(file, request.signal) });
      }

      const done = deferred();
      const onAbort = () => done.reject(new DownloadError('CLIENT_ABORT', 499));
      if (request.signal.aborted) onAbort();
      else request.signal.addEventListener('abort', onAbort, { once: true });

      let body: ReadableStream<Uint8Array>;
      if (resolution.type === 'single') {
        body = terminalStream(prepared[0].audited.stream, done);
      } else {
        body = terminalStream(
          buildZipStream(
            prepared.map((file) => ({ name: file.meta.filename, stream: file.audited.stream })),
            done.reject
          ),
          done
        );
      }

      ctx.waitUntil(
        finish({
          token,
          sessionId: resolution.session_id,
          config,
          files: prepared,
          done,
          nonce,
          signal: request.signal,
        })
      );

      return new Response(body, {
        status: 200,
        headers: downloadHeaders(request, resolution.type, prepared[0]?.meta, allowedOrigin),
      });
    } catch (error) {
      const failure = toDownloadError(error);
      if (failure.code !== 'CLIENT_ABORT') logFailure(failure.code, nonce);
      return jsonError(failure.status, failure.code, request, allowedOrigin);
    }
  },
};
