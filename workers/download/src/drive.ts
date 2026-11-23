import { DownloadError } from './errors';
import type { ResolvedFile } from './resolve';

// Incremental SHA-256 is required because WebCrypto's digest() is one-shot and
// buffering a whole product file in a Worker would break the memory budget.
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

class Sha256 {
  private readonly state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  private readonly block = new Uint8Array(64);
  private blockLength = 0;
  private totalBytes = 0;

  update(chunk: Uint8Array): void {
    this.totalBytes += chunk.length;
    let offset = 0;

    if (this.blockLength > 0) {
      const take = Math.min(64 - this.blockLength, chunk.length);
      this.block.set(chunk.subarray(0, take), this.blockLength);
      this.blockLength += take;
      offset += take;
      if (this.blockLength === 64) {
        this.compress(this.block);
        this.blockLength = 0;
      }
    }

    while (offset + 64 <= chunk.length) {
      this.compress(chunk.subarray(offset, offset + 64));
      offset += 64;
    }

    if (offset < chunk.length) {
      this.block.set(chunk.subarray(offset), this.blockLength);
      this.blockLength += chunk.length - offset;
    }
  }

  digestHex(): string {
    // 2^29 bytes = 2^32 bits, so the high word counts 2^29-byte groups.
    const bitLengthHigh = Math.floor(this.totalBytes / 0x20000000) >>> 0;
    const bitLengthLow = (this.totalBytes * 8) >>> 0;
    // The final block(s) include the existing partial block plus padding.
    const paddedLength = this.blockLength < 56 ? 64 : 128;
    const tail = new Uint8Array(paddedLength);
    tail.set(this.block.subarray(0, this.blockLength));
    tail[this.blockLength] = 0x80;
    const view = new DataView(tail.buffer);
    view.setUint32(paddedLength - 8, bitLengthHigh, false);
    view.setUint32(paddedLength - 4, bitLengthLow, false);

    for (let offset = 0; offset < tail.length; offset += 64) {
      this.compress(tail.subarray(offset, offset + 64));
    }

    return Array.from(this.state, (word) => (word >>> 0).toString(16).padStart(8, '0')).join('');
  }

  private compress(chunk: Uint8Array): void {
    const words = new Uint32Array(64);
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(i * 4, false);
    for (let i = 16; i < 64; i++) {
      const x = words[i - 15];
      const y = words[i - 2];
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0;
    }

    let a = this.state[0];
    let b = this.state[1];
    let c = this.state[2];
    let d = this.state[3];
    let e = this.state[4];
    let f = this.state[5];
    let g = this.state[6];
    let h = this.state[7];

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + choose + SHA256_K[i] + words[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    this.state[0] = (this.state[0] + a) >>> 0;
    this.state[1] = (this.state[1] + b) >>> 0;
    this.state[2] = (this.state[2] + c) >>> 0;
    this.state[3] = (this.state[3] + d) >>> 0;
    this.state[4] = (this.state[4] + e) >>> 0;
    this.state[5] = (this.state[5] + f) >>> 0;
    this.state[6] = (this.state[6] + g) >>> 0;
    this.state[7] = (this.state[7] + h) >>> 0;
  }
}

export interface FileAudit {
  file_version_id: string;
  bytes_sent: number;
  checksum: string;
}

export interface AuditedFile {
  stream: ReadableStream<Uint8Array>;
  result: Promise<FileAudit>;
}

/**
 * Counts and hashes the bytes that actually flow to the client. The result is
 * settled only after the source ends cleanly and size/checksum guards pass.
 */
export function auditFileStream(
  source: ReadableStream<Uint8Array>,
  file: ResolvedFile,
  signal?: AbortSignal
): AuditedFile {
  const hasher = new Sha256();
  let bytes = 0;
  let settle!: (audit: FileAudit) => void;
  let fail!: (error: unknown) => void;
  const result = new Promise<FileAudit>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  // The request handler attaches to `result`; this keeps a failed standalone
  // stream from producing an unhandled rejection before that happens.
  void result.catch(() => {});

  // TS 5.6's WebWorker lib omits `cancel` from Transformer, but the runtime
  // supports it and it is how a cancelled download avoids a false completion.
  const transformer: Transformer<Uint8Array, Uint8Array> & {
    cancel?: (reason: unknown) => void;
  } = {
    transform(chunk, controller) {
      try {
        if (signal?.aborted) throw new DownloadError('CLIENT_ABORT', 499);
        hasher.update(chunk);
        bytes += chunk.length;
        if (bytes > file.size_bytes) throw new DownloadError('SIZE_MISMATCH', 502);
        controller.enqueue(chunk);
      } catch (error) {
        fail(error);
        throw error;
      }
    },
    flush() {
      try {
        if (bytes !== file.size_bytes) throw new DownloadError('SIZE_MISMATCH', 502);
        const checksum = hasher.digestHex();
        if (file.sha256 && checksum.toLowerCase() !== file.sha256.toLowerCase()) {
          throw new DownloadError('CHECKSUM_MISMATCH', 502);
        }
        settle({ file_version_id: file.file_version_id, bytes_sent: bytes, checksum });
      } catch (error) {
        fail(error);
        throw error;
      }
    },
    cancel(reason: unknown) {
      fail(reason ?? new DownloadError('CLIENT_ABORT', 499));
    },
  };

  return { stream: source.pipeThrough(new TransformStream<Uint8Array, Uint8Array>(transformer)), result };
}

export async function fetchDriveFile(
  file: ResolvedFile,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch
): Promise<AuditedFile> {
  let response: Response;
  try {
    response = await fetchImpl(file.drive_url, {
      // Files can belong to different seller Drive accounts, so each request
      // uses only the bearer token the resolver issued for that exact file.
      headers: { Authorization: `Bearer ${file.access_token}` },
      signal,
      redirect: 'follow',
      cache: 'no-store',
    });
  } catch {
    if (signal?.aborted) throw new DownloadError('CLIENT_ABORT', 499);
    throw new DownloadError('DRIVE_FAILED', 502);
  }

  // Do not log status/body here: they may echo the access token or file URL.
  if (!response.ok || !response.body) throw new DownloadError('DRIVE_FAILED', 502);
  return auditFileStream(response.body, file, signal);
}
