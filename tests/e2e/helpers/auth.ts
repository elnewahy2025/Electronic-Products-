import { createServerClient } from '@supabase/ssr';
import type { BrowserContext } from '@playwright/test';

/**
 * Signs in via Supabase and returns cookies compatible with Playwright's
 * context.addCookies(). Uses the same @supabase/ssr client the app uses,
 * so the cookie names/format match exactly.
 */
export async function getAuthCookies(
  email: string,
  password: string
): Promise<Array<{ name: string; value: string; domain: string; path: string; httpOnly: boolean; secure: boolean; sameSite: 'Lax' }>> {
  const cookieJar = new Map<string, string>();

  const supabase = createServerClient(
    process.env.TEST_SUPABASE_URL!,
    process.env.TEST_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return Array.from(cookieJar.entries()).map(([name, value]) => ({ name, value }));
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          cookiesToSet.forEach(({ name, value }) => cookieJar.set(name, value));
        },
      },
    }
  );

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login failed for ${email}: ${error.message}`);

  return Array.from(cookieJar.entries()).map(([name, value]) => ({
    name,
    value,
    domain: 'localhost',
    path: '/',
    httpOnly: false,
    secure: false,
    sameSite: 'Lax' as const,
  }));
}

/**
 * Sets auth cookies on a Playwright BrowserContext, ready to make authenticated
 * requests to the Next.js app.
 */
export async function authenticateContext(
  context: BrowserContext,
  email: string,
  password: string
): Promise<void> {
  const cookies = await getAuthCookies(email, password);
  await context.addCookies(cookies);
}

/**
 * Returns a Cookie header string for use with fetch() calls inside tests.
 */
export async function getCookieHeader(email: string, password: string): Promise<string> {
  const cookies = await getAuthCookies(email, password);
  return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}