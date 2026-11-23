'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

function resolveBrowserSupabaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (
    typeof window !== 'undefined' &&
    /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(configured) &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    // When testing over a forwarded port / Dev Tunnel on phone, route browser
    // Supabase calls through Next.js's same-origin `/supabase` proxy while SSR
    // keeps talking directly to local 127.0.0.1 at zero latency.
    return `${window.location.origin}/supabase`;
  }
  return configured;
}

export function createClient() {
  if (client) return client;
  client = createBrowserClient<Database>(
    resolveBrowserSupabaseUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return client;
}