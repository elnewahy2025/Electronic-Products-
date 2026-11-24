// H-07 guard: the generated Database type must be real, not a placeholder.
// `pnpm db:types` regenerates it from the local Supabase stack.
import { readFileSync } from 'node:fs';

const path = 'src/lib/types/database.ts';
const source = readFileSync(path, 'utf8');

if (/export type Database\s*=\s*any\b/.test(source)) {
  console.error(`${path} still contains "export type Database = any". Run pnpm db:types.`);
  process.exit(1);
}
if (!/export type Database\s*=/.test(source)) {
  console.error(`${path} does not export a Database type. Run pnpm db:types.`);
  process.exit(1);
}
if (source.trim().length < 1000) {
  console.error(`${path} looks truncated. Run pnpm db:types.`);
  process.exit(1);
}
console.log('Database type is generated and not a placeholder.');
