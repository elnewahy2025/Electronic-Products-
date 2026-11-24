export type { Database } from '@/lib/types/database';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

/**
 * `@supabase/ssr@0.5.2` still declares the old three-generic SupabaseClient
 * shape. The installed supabase-js uses the second generic for the schema
 * name, so passing a schema object there makes every query result `never`.
 * SSR factories create an untyped client and normalize it here.
 */
export type TypedSupabaseClient = SupabaseClient<Database>;

export function asTypedSupabaseClient(client: unknown): TypedSupabaseClient {
  return client as TypedSupabaseClient;
}
