export type TokenPayload = {
  sid: string;
  fid?: string;
  typ: 'single' | 'zip';
  exp: number;
  n: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const DECODE_TABLE = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) table[ALPHABET.charCodeAt(i)] = i;
  return table;
})();
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += ALPHABET[(triple >>> 18) & 63];
    out += ALPHABET[(triple >>> 12) & 63];
    if (i + 1 < bytes.length) out += ALPHABET[(triple >>> 6) & 63];
    if (i + 2 < bytes.length) out += ALPHABET[triple & 63];
  }
  return out;
}

function base64UrlDecode(input: string): Uint8Array {
  if (input.length % 4 === 1) throw new Error('invalid base64url length');
  const values = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    const value = code < DECODE_TABLE.length ? DECODE_TABLE[code] : -1;
    if (value < 0) throw new Error('invalid base64url character');
    values[i] = value;
  }

  const byteLength = Math.floor((values.length * 6) / 8);
  const out = new Uint8Array(byteLength);
  let bitBuffer = 0;
  let bitCount = 0;
  let offset = 0;
  for (let i = 0; i < values.length; i++) {
    bitBuffer = (bitBuffer << 6) | values[i];
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      out[offset++] = (bitBuffer >>> bitCount) & 0xff;
    }
  }
  return out;
}

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return new Uint8Array(signature);
}

function isPayload(value: unknown, nowSec: number): value is TokenPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;

  if (typeof payload.sid !== 'string' || !UUID_RE.test(payload.sid)) return false;
  if (payload.typ !== 'single' && payload.typ !== 'zip') return false;
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return false;
  // Match the Node verifier: `exp < now` is expired; `exp === now` is still valid.
  if (payload.exp < nowSec) return false;
  if (typeof payload.n !== 'string' || payload.n.length === 0) return false;
  if (payload.fid !== undefined && (typeof payload.fid !== 'string' || !UUID_RE.test(payload.fid))) {
    return false;
  }
  if (payload.typ === 'single' && typeof payload.fid !== 'string') return false;
  return true;
}

export async function verifyToken(
  token: string,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000)
): Promise<TokenPayload | null> {
  if (typeof token !== 'string' || typeof secret !== 'string' || secret.length === 0) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, encodedSignature] = parts;
  if (!encoded || !encodedSignature) return null;

  let received: Uint8Array;
  try {
    received = base64UrlDecode(encodedSignature);
  } catch {
    return null;
  }

  const expected = await hmacSha256(secret, encoded);

  // Compare every byte of the 32-byte digest, including on length mismatch.
  // The Node issuer compares the base64url strings with timingSafeEqual,
  // which is equivalent to comparing the decoded digest bytes.
  const normalized = new Uint8Array(32);
  if (received.length === expected.length) normalized.set(received);
  let diff = received.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) diff |= normalized[i] ^ expected[i];
  if (diff !== 0) return null;

  try {
    const payload: unknown = JSON.parse(decoder.decode(base64UrlDecode(encoded)));
    return isPayload(payload, nowSec) ? payload : null;
  } catch {
    return null;
  }
}

/** Exported for deterministic tests; unused by the request path. */
export function encodeTokenPayloadForTest(payload: TokenPayload): string {
  return base64UrlEncode(encoder.encode(JSON.stringify(payload)));
}
