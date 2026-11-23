import 'server-only';
import { timingSafeEqual } from 'node:crypto';

/** Compare two secrets without leaking their contents through timing. */
export function constantTimeEqual(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
