import 'server-only';
import { randomBytes, createHmac } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const LENGTH = 16;
// Reject the tail of the byte range so every alphabet character is equally
// likely (ALPHABET.length is not a power of two).
const ACCEPTABLE_BYTE = Math.floor(256 / ALPHABET.length) * ALPHABET.length;

export function generateCode(): string {
  let body = '';
  while (body.length < LENGTH) {
    for (const byte of randomBytes(LENGTH * 2)) {
      if (byte >= ACCEPTABLE_BYTE) continue;
      body += ALPHABET[byte % ALPHABET.length];
      if (body.length === LENGTH) break;
    }
  }
  return [body.slice(0, 4), body.slice(4, 8), body.slice(8, 12), body.slice(12)].join('-');
}

export function hashCode(code: string): string {
  const pepper = process.env.CODE_HASH_PEPPER;
  if (!pepper) throw new Error('CODE_HASH_PEPPER not set');
  return createHmac('sha256', pepper).update(code.trim().toUpperCase()).digest('hex');
}

export function codePrefix(code: string): string {
  return code.slice(0, 4);
}