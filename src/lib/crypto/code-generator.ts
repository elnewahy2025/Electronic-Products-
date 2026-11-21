import 'server-only';
import { randomBytes, createHmac } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const LENGTH = 16;

export function generateCode(): string {
  const bytes = randomBytes(LENGTH);
  let out = '';
  for (let i = 0; i < LENGTH; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
    if (i === 3 || i === 7 || i === 11) out += '-';
  }
  return out; // e.g. ABCD-EFGH-JKLM-NPQR
}

export function hashCode(code: string): string {
  const pepper = process.env.CODE_HASH_PEPPER;
  if (!pepper) throw new Error('CODE_HASH_PEPPER not set');
  return createHmac('sha256', pepper).update(code.trim().toUpperCase()).digest('hex');
}

export function codePrefix(code: string): string {
  return code.slice(0, 4);
}